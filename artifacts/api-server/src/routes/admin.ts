import { Router, type IRouter } from "express";
import { eq, and, or, ne, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  db, companiesTable, routesTable, tripsTable, seatsTable, usersTable, hotelsTable,
  citiesTable, stationsTable, companyStationsTable, busesTable, agenciesTable, platformSettingsTable, ticketsTable, companyRatingsTable,
} from "@workspace/db";
import { z } from "zod";
import {
  CreateCompanyBody,
  UpdateCompanyParams,
  UpdateCompanyPayoutAccountParams,
  UpdateCompanyPayoutAccountBody,
  GetCompanyPayoutStatusQueryParams,
  GetAdminRefundsQueryParams,
  UpdateCompanyBody,
  DeleteCompanyParams,
  CreateRouteBody,
  UpdateRouteParams,
  UpdateRouteBody,
  DeleteRouteParams,
  CreateTripBody,
  UpdateTripParams,
  UpdateTripBody,
  DeleteTripParams,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserEmailParams,
  UpdateUserEmailBody,
  GetCompanySuspensionPreviewParams,
  SuspendCompanyParams,
  SuspendCompanyBody,
  ReactivateCompanyParams,
  SuspendUserParams,
  SuspendUserBody,
  ReactivateUserParams,
  GetAdminCompaniesQueryParams,
  GetAdminRoutesQueryParams,
  GetAdminUsersQueryParams,
  GetAdminHotelsQueryParams,
  CreateHotelBody,
  UpdateHotelParams,
  UpdateHotelBody,
  DeleteHotelParams,
  CreateCityBody,
  DeleteCityParams,
  CreateStationBody,
  DeleteStationParams,
  GetCompanyStationsParams,
  AddCompanyStationParams,
  AddCompanyStationBody,
  RemoveCompanyStationParams,
  GetCompanyBusesParams,
  CreateBusParams,
  CreateBusBody,
  UpdateBusParams,
  UpdateBusBody,
  DeleteBusParams,
  UpdateCommissionSettingsBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";
import { formatStation } from "../lib/stations";
import { parsePagination } from "../lib/pagination";
import { EMAIL_TAKEN, emailTaken, isUniqueViolation, parseEmail } from "../lib/user-email";
import { checkAgencyType, checkImageUrls } from "../lib/agency-queries";
import {
  selectRoutes,
  selectTrips,
  getTripDetails,
  getSeatCounts,
  isBusBusy,
  routeLabels,
  formatTripDetail,
  originStation,
  originCity,
  type RouteRow,
} from "../lib/trip-queries";
import { getPlatformSettings, formatSettings, COMMISSION_NOTICE_DAYS } from "../lib/pricing";
import { notifyCompanyAdmins } from "../lib/commission-notice";
import { previewCompanySuspension, runSuspensionCascade } from "../lib/company-suspension";
import { formatCompany } from "../lib/companies";

const router: IRouter = Router();
// Super admin only. Scoped to /admin: a router-wide use() would also run on requests meant for
// routers mounted after this one. Company-scoped admin routes live in admin-company.ts.
router.use("/admin", requireRole("admin"));

// ── Companies ──────────────────────────────────────────────────────────────────

router.post("/admin/companies", async (req, res): Promise<void> => {
  const body = CreateCompanyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [c] = await db.insert(companiesTable).values({ name: body.data.name }).returning();
  res.status(201).json(formatCompany(c));
});

router.put("/admin/companies/:companyId", async (req, res): Promise<void> => {
  const params = UpdateCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateCompanyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [c] = await db.update(companiesTable).set({ name: body.data.name }).where(eq(companiesTable.id, params.data.companyId)).returning();
  if (!c) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }
  res.json(formatCompany(c));
});

router.delete("/admin/companies/:companyId", async (req, res): Promise<void> => {
  const params = DeleteCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  // Never delete a company with any history (lines, so trips / tickets, staff, ratings): suspend it instead
  const companyId = params.data.companyId;
  const { rows: [usage] } = await db.execute<{ used: boolean }>(sql`select
    exists (select 1 from ${routesTable} where ${routesTable.companyId} = ${companyId})
    or exists (select 1 from ${usersTable} where ${usersTable.companyId} = ${companyId})
    or exists (select 1 from ${companyRatingsTable} where ${companyRatingsTable.companyId} = ${companyId}) as used`);
  if (usage?.used) {
    res.status(409).json({ error: "Cette compagnie a des lignes, du personnel ou des avis : elle ne peut pas être supprimée. Suspendez-la plutôt." });
    return;
  }
  await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
  res.json({ success: true });
});

// ── Suspension (super admin only) ──────────────────────────────────────────────
// Never a deletion: only a status. See lib/company-suspension.ts for what a company suspension does.

/** Reason given by the super admin: required, trimmed, 3 to 500 characters. */
function parseReason(raw: unknown): string | null {
  const reason = typeof raw === "string" ? raw.trim() : "";
  return reason.length >= 3 && reason.length <= 500 ? reason : null;
}

router.get("/admin/companies/:companyId/suspension-preview", async (req, res): Promise<void> => {
  const params = GetCompanySuspensionPreviewParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [company] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }
  res.json(await previewCompanySuspension(company.id));
});

router.put("/admin/companies/:companyId/suspend", async (req, res): Promise<void> => {
  const params = SuspendCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SuspendCompanyBody.safeParse(req.body);
  const reason = body.success ? parseReason(body.data.reason) : null;
  if (!reason) { res.status(400).json({ error: "Indiquez la raison de la suspension (3 à 500 caractères)" }); return; }
  const adminId = getSession(req).userId!;

  // Marked suspended first (one request only): its staff is locked out and no new sale can start
  // while the cascade runs
  const [company] = await db.update(companiesTable)
    .set({ status: "suspended", suspendedReason: reason, suspendedAt: new Date(), suspendedBy: adminId })
    .where(and(eq(companiesTable.id, params.data.companyId), eq(companiesTable.status, "active")))
    .returning();
  if (!company) {
    const [exists] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
    res.status(exists ? 409 : 404).json({ error: exists ? "Cette compagnie est déjà suspendue" : "Compagnie non trouvée" });
    return;
  }
  const logContext = { operation: "company_suspension", companyId: company.id, adminId };
  req.log.warn({ ...logContext, reason }, "Company suspended");

  const summary = await runSuspensionCascade(company.id, logContext);
  req.log.warn({ ...logContext, ...summary, tickets: undefined }, "Company suspension cascade done");
  res.json({ company: formatCompany(company), summary });
});

// Cancelled trips and refunds stay as they are: the company creates new trips once reactivated
router.put("/admin/companies/:companyId/reactivate", async (req, res): Promise<void> => {
  const params = ReactivateCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [company] = await db.update(companiesTable)
    .set({ status: "active", suspendedReason: null, suspendedAt: null, suspendedBy: null })
    .where(and(eq(companiesTable.id, params.data.companyId), eq(companiesTable.status, "suspended")))
    .returning();
  if (!company) {
    const [exists] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
    res.status(exists ? 409 : 404).json({ error: exists ? "Cette compagnie n'est pas suspendue" : "Compagnie non trouvée" });
    return;
  }
  req.log.warn({ operation: "company_reactivation", companyId: company.id, adminId: getSession(req).userId }, "Company reactivated");
  res.json(formatCompany(company));
});

// ── Company payouts (automatic transfer of the company share to its PayDunya account) ──────

router.put("/admin/companies/:companyId/payout-account", async (req, res): Promise<void> => {
  const params = UpdateCompanyPayoutAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateCompanyPayoutAccountBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Empty = no automatic transfer for this company's sales
  const alias = body.data.paydunyaAccountAlias?.trim() || null;
  const [c] = await db.update(companiesTable).set({ paydunyaAccountAlias: alias }).where(eq(companiesTable.id, params.data.companyId)).returning();
  if (!c) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }
  res.json({ companyId: c.id, paydunyaAccountAlias: c.paydunyaAccountAlias });
});

const UNTRANSFERRED = ["failed", "not_configured", "pending"];

// Paid tickets whose company share was not transferred automatically, to settle by hand (cancelled
// tickets are no longer owed), plus transfers reduced by a clawback, so the netting stays traceable
router.get("/admin/company-payouts", async (req, res): Promise<void> => {
  const query = GetCompanyPayoutStatusQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, query.data.companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }

  const untransferred = and(inArray(ticketsTable.companyPayoutStatus, UNTRANSFERRED), isNull(ticketsTable.cancelledAt));
  const where = and(
    or(untransferred, and(eq(ticketsTable.companyPayoutStatus, "success"), gt(ticketsTable.companyPayoutClawbackAmount, "0"))),
    sql`${ticketsTable.tripId} IN (SELECT tr.id FROM trips tr JOIN routes r ON r.id = tr.route_id WHERE r.company_id = ${company.id})`,
  );
  const [{ count, totalAmount }] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(${ticketsTable.companyPayoutAmount}) FILTER (WHERE ${ticketsTable.companyPayoutStatus} <> 'success'), 0)::float`,
    })
    .from(ticketsTable).where(where);
  const rows = await db
    .select({ ticket: ticketsTable, departureDate: tripsTable.departureDate })
    .from(ticketsTable)
    .innerJoin(tripsTable, eq(ticketsTable.tripId, tripsTable.id))
    .where(where)
    .orderBy(sql`${ticketsTable.companyPayoutAt} DESC NULLS LAST`, ticketsTable.id)
    .limit(pageSize).offset(offset);

  res.json({
    companyId: company.id,
    companyName: company.name,
    paydunyaAccountAlias: company.paydunyaAccountAlias,
    pendingClawback: parseFloat(company.pendingClawback),
    items: rows.map(({ ticket, departureDate }) => ({
      ticketId: ticket.id,
      passengerName: ticket.passengerName,
      departureDate,
      amount: parseFloat(ticket.companyPayoutAmount ?? "0"),
      clawbackAmount: ticket.companyPayoutClawbackAmount !== null ? parseFloat(ticket.companyPayoutClawbackAmount) : null,
      netAmount: ticket.companyPayoutNetAmount !== null ? parseFloat(ticket.companyPayoutNetAmount) : null,
      status: ticket.companyPayoutStatus,
      error: ticket.companyPayoutError,
      attemptedAt: ticket.companyPayoutAt?.toISOString() ?? null,
    })),
    totalAmount,
    total: count, page, pageSize,
  });
});

// ── Refunds (automatic PayDunya refunds that need a follow-up) ────────────────

const REFUNDS_TO_FOLLOW = ["failed", "manual_required", "created", "pending"];

router.get("/admin/refunds", async (req, res): Promise<void> => {
  const query = GetAdminRefundsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const where = inArray(ticketsTable.refundStatus, REFUNDS_TO_FOLLOW);
  const [{ count, totalAmount }] = await db
    .select({ count: sql<number>`count(*)::int`, totalAmount: sql<number>`coalesce(sum(${ticketsTable.refundAmount}), 0)::float` })
    .from(ticketsTable).where(where);
  const rows = await db
    .select({ ticket: ticketsTable, phone: usersTable.phone })
    .from(ticketsTable)
    .leftJoin(usersTable, eq(ticketsTable.userId, usersTable.id))
    .where(where)
    // Failures and manual cases first, then the most recent cancellations
    .orderBy(sql`CASE WHEN ${ticketsTable.refundStatus} IN ('failed', 'manual_required') THEN 0 ELSE 1 END`, sql`${ticketsTable.cancelledAt} DESC NULLS LAST`, ticketsTable.id)
    .limit(pageSize).offset(offset);

  res.json({
    items: rows.map(({ ticket, phone }) => ({
      ticketId: ticket.id,
      passengerName: ticket.passengerName,
      accountPhone: phone ?? null,
      paymentMethod: ticket.paymentMethod,
      refundAmount: parseFloat(ticket.refundAmount ?? "0"),
      status: ticket.refundStatus,
      error: ticket.refundError,
      cancelledAt: ticket.cancelledAt?.toISOString() ?? null,
    })),
    totalAmount,
    total: count, page, pageSize,
  });
});

// ── Users ──────────────────────────────────────────────────────────────────────

function formatUser(
  u: typeof usersTable.$inferSelect,
  company: typeof companiesTable.$inferSelect | null | undefined,
  agency: typeof agenciesTable.$inferSelect | null | undefined,
) {
  return {
    id: u.id, phone: u.phone, name: u.name, email: u.email, role: u.role,
    companyId: u.companyId, companyName: company?.name ?? null,
    agencyId: u.agencyId, agencyName: agency?.name ?? null, agencyType: agency?.type ?? null,
    status: u.status, suspendedReason: u.suspendedReason, suspendedAt: u.suspendedAt ? u.suspendedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

function getSession(req: any) {
  return req.session as { userId?: number };
}

router.get("/admin/users", async (req, res): Promise<void> => {
  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const results = await db
    .select({ user: usersTable, company: companiesTable, agency: agenciesTable })
    .from(usersTable)
    .leftJoin(companiesTable, eq(usersTable.companyId, companiesTable.id))
    .leftJoin(agenciesTable, eq(usersTable.agencyId, agenciesTable.id))
    .orderBy(usersTable.createdAt, usersTable.id)
    .limit(pageSize).offset(offset);

  res.json({
    items: results.map(({ user, company, agency }) => formatUser(user, company, agency)),
    total: count, page, pageSize,
  });
});

router.put("/admin/users/:userId/role", async (req, res): Promise<void> => {
  const params = UpdateUserRoleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateUserRoleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { userId } = getSession(req);
  if (userId === params.data.userId) {
    res.status(400).json({ error: "Vous ne pouvez pas modifier votre propre rôle" });
    return;
  }

  // A clerk works either for a bus company or for an agency, never both
  if (body.data.companyId && body.data.agencyId) {
    res.status(400).json({ error: "Un utilisateur ne peut pas être rattaché à la fois à une compagnie et à une agence" });
    return;
  }
  if (body.data.agencyId) {
    const [agency] = await db.select({ id: agenciesTable.id }).from(agenciesTable).where(eq(agenciesTable.id, body.data.agencyId)).limit(1);
    if (!agency) { res.status(400).json({ error: "Agence non trouvée" }); return; }
  }
  // A company admin manages exactly one bus company: it must be given one, and no agency
  if (body.data.role === "company_admin" && (!body.data.companyId || body.data.agencyId)) {
    res.status(400).json({ error: "Un administrateur de compagnie doit être rattaché à une compagnie (et à aucune agence)" });
    return;
  }
  if (body.data.companyId) {
    const [company] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.id, body.data.companyId)).limit(1);
    if (!company) { res.status(400).json({ error: "Compagnie non trouvée" }); return; }
  }

  const [u] = await db
    .update(usersTable)
    .set({ role: body.data.role, companyId: body.data.companyId ?? null, agencyId: body.data.agencyId ?? null })
    .where(eq(usersTable.id, params.data.userId))
    .returning();
  if (!u) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }

  const [company] = u.companyId
    ? await db.select().from(companiesTable).where(eq(companiesTable.id, u.companyId)).limit(1)
    : [undefined];
  const [agency] = u.agencyId
    ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, u.agencyId)).limit(1)
    : [undefined];

  res.json(formatUser(u, company, agency));
});

// Sets (or removes) a user's e-mail by hand, after the administrator checked the person's identity outside the app.
// The way in for accounts that can't attach one at login (existing tickets or bookings, staff accounts).
/** formatUser with the user's company and agency looked up. */
async function formatUserWithRelations(u: typeof usersTable.$inferSelect) {
  const [company] = u.companyId ? await db.select().from(companiesTable).where(eq(companiesTable.id, u.companyId)).limit(1) : [undefined];
  const [agency] = u.agencyId ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, u.agencyId)).limit(1) : [undefined];
  return formatUser(u, company, agency);
}

// One account only (abuse, departure…): login blocked at once, nothing else changes (its company,
// trips and tickets stay as they are). Never a super admin.
router.put("/admin/users/:userId/suspend", async (req, res): Promise<void> => {
  const params = SuspendUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = SuspendUserBody.safeParse(req.body);
  const reason = body.success ? parseReason(body.data.reason) : null;
  if (!reason) { res.status(400).json({ error: "Indiquez la raison de la suspension (3 à 500 caractères)" }); return; }
  const adminId = getSession(req).userId!;

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.userId)).limit(1);
  if (!target) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  if (target.role === "admin") { res.status(400).json({ error: "Un compte super administrateur ne peut pas être suspendu" }); return; }

  const [u] = await db.update(usersTable)
    .set({ status: "suspended", suspendedReason: reason, suspendedAt: new Date(), suspendedBy: adminId })
    .where(and(eq(usersTable.id, target.id), eq(usersTable.status, "active")))
    .returning();
  if (!u) { res.status(409).json({ error: "Ce compte est déjà suspendu" }); return; }
  req.log.warn({ operation: "user_suspension", userId: u.id, role: u.role, adminId, reason }, "User suspended");
  res.json(await formatUserWithRelations(u));
});

router.put("/admin/users/:userId/reactivate", async (req, res): Promise<void> => {
  const params = ReactivateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [u] = await db.update(usersTable)
    .set({ status: "active", suspendedReason: null, suspendedAt: null, suspendedBy: null })
    .where(and(eq(usersTable.id, params.data.userId), eq(usersTable.status, "suspended")))
    .returning();
  if (!u) {
    const [exists] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, params.data.userId)).limit(1);
    res.status(exists ? 409 : 404).json({ error: exists ? "Ce compte n'est pas suspendu" : "Utilisateur non trouvé" });
    return;
  }
  req.log.warn({ operation: "user_reactivation", userId: u.id, adminId: getSession(req).userId }, "User reactivated");
  res.json(await formatUserWithRelations(u));
});

router.put("/admin/users/:userId/email", async (req, res): Promise<void> => {
  const params = UpdateUserEmailParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateUserEmailBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const email = parseEmail(body.data.email);
  if (!email.ok) { res.status(400).json({ error: email.error }); return; }

  if (email.email && await emailTaken(email.email, params.data.userId)) { res.status(409).json({ error: EMAIL_TAKEN }); return; }
  let u;
  try {
    [u] = await db.update(usersTable).set({ email: email.email }).where(eq(usersTable.id, params.data.userId)).returning();
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: EMAIL_TAKEN }); return; }
    throw err;
  }
  if (!u) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  // Who changed whose login e-mail: kept in the logs, since this e-mail then receives the login codes
  req.log.info({ adminId: getSession(req).userId, userId: u.id, emailSet: !!email.email }, "User e-mail set by admin");

  const [company] = u.companyId
    ? await db.select().from(companiesTable).where(eq(companiesTable.id, u.companyId)).limit(1)
    : [undefined];
  const [agency] = u.agencyId
    ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, u.agencyId)).limit(1)
    : [undefined];

  res.json(formatUser(u, company, agency));
});

// ── Cities ─────────────────────────────────────────────────────────────────────

router.get("/admin/cities", async (_req, res): Promise<void> => {
  const cities = await db.select().from(citiesTable).orderBy(citiesTable.name);
  res.json(cities.map((c) => ({ id: c.id, name: c.name })));
});

router.post("/admin/cities", async (req, res): Promise<void> => {
  const body = CreateCityBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const name = body.data.name.trim();
  if (!name) { res.status(400).json({ error: "Le nom de la ville est requis" }); return; }

  const [existing] = await db.select().from(citiesTable).where(sql`lower(${citiesTable.name}) = lower(${name})`).limit(1);
  if (existing) { res.status(409).json({ error: "Cette ville existe déjà" }); return; }

  const [c] = await db.insert(citiesTable).values({ name }).returning();
  res.status(201).json({ id: c.id, name: c.name });
});

router.delete("/admin/cities/:cityId", async (req, res): Promise<void> => {
  const params = DeleteCityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [station] = await db.select({ id: stationsTable.id }).from(stationsTable).where(eq(stationsTable.cityId, params.data.cityId)).limit(1);
  if (station) { res.status(409).json({ error: "Cette ville contient des gares, supprimez-les d'abord" }); return; }

  await db.delete(citiesTable).where(eq(citiesTable.id, params.data.cityId));
  res.json({ success: true });
});

// ── Stations ───────────────────────────────────────────────────────────────────


router.post("/admin/stations", async (req, res): Promise<void> => {
  const body = CreateStationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const name = body.data.name.trim();
  if (!name) { res.status(400).json({ error: "Le nom de la gare est requis" }); return; }

  const [city] = await db.select().from(citiesTable).where(eq(citiesTable.id, body.data.cityId)).limit(1);
  if (!city) { res.status(404).json({ error: "Ville non trouvée" }); return; }

  const [station] = await db.insert(stationsTable).values({ name, cityId: city.id }).returning();
  res.status(201).json(formatStation(station, city));
});

router.delete("/admin/stations/:stationId", async (req, res): Promise<void> => {
  const params = DeleteStationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [route] = await db
    .select({ id: routesTable.id })
    .from(routesTable)
    .where(or(eq(routesTable.originStationId, params.data.stationId), eq(routesTable.destinationStationId, params.data.stationId)))
    .limit(1);
  if (route) { res.status(409).json({ error: "Cette gare est utilisée par des lignes, supprimez-les d'abord" }); return; }

  await db.delete(stationsTable).where(eq(stationsTable.id, params.data.stationId));
  res.json({ success: true });
});

// ── Commission settings (super admin only) ─────────────────────────────────────

router.get("/admin/settings/commission", async (_req, res): Promise<void> => {
  res.json(formatSettings(await getPlatformSettings()));
});

router.put("/admin/settings/commission", async (req, res): Promise<void> => {
  const body = UpdateCommissionSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Pourcentages entre 0 et 100, frais de choix de siège positif ou nul" });
    return;
  }
  const { commissionPercent, seatSelectionFee, seatSelectionPlatformPercent } = body.data;
  if (![commissionPercent, seatSelectionFee, seatSelectionPlatformPercent].every(Number.isFinite)) {
    res.status(400).json({ error: "Valeurs invalides" });
    return;
  }

  const current = await getPlatformSettings(); // creates the row if needed, applies a change that came due
  const activePercent = parseFloat(current.commissionPercent);
  const pendingPercent = current.commissionPercentPending !== null ? parseFloat(current.commissionPercentPending) : null;
  const requested = Number(commissionPercent.toFixed(2));

  // Seat selection settings: at once, as before. Only tickets created from now on use the new values.
  const changes: Partial<typeof platformSettingsTable.$inferInsert> = {
    seatSelectionFee: seatSelectionFee.toFixed(2),
    seatSelectionPlatformPercent: seatSelectionPlatformPercent.toFixed(2),
    updatedAt: new Date(),
  };
  // Commission: announced, then in force after the notice period (a new change replaces the pending one;
  // the current rate cancels it; the rate already pending changes nothing and isn't announced twice)
  let announcement: Parameters<typeof notifyCompanyAdmins>[0] | null = null;
  if (requested !== activePercent && requested !== pendingPercent) {
    const effectiveAt = new Date(Date.now() + COMMISSION_NOTICE_DAYS * 24 * 60 * 60 * 1000);
    Object.assign(changes, { commissionPercentPending: requested.toFixed(2), commissionEffectiveAt: effectiveAt, commissionAnnouncedAt: new Date() });
    announcement = { kind: "change", oldPercent: activePercent, newPercent: requested, effectiveAt };
  } else if (requested === activePercent && pendingPercent !== null) {
    Object.assign(changes, { commissionPercentPending: null, commissionEffectiveAt: null });
    announcement = { kind: "cancelled", currentPercent: activePercent, cancelledPercent: pendingPercent };
  }

  const [row] = await db.update(platformSettingsTable).set(changes).where(eq(platformSettingsTable.id, 1)).returning();
  req.log.info({ adminId: getSession(req).userId, commissionPercent: requested, announcement: announcement?.kind ?? null }, "Commission settings updated");
  // The new settings are saved whatever happens to the e-mails
  const notification = announcement ? await notifyCompanyAdmins(announcement) : null;
  res.json({ ...formatSettings(row), notification });
});

// Cancels the announced change before it applies: the current rate stays, company admins are told
router.delete("/admin/settings/commission/pending", async (req, res): Promise<void> => {
  const current = await getPlatformSettings(); // a change that already came due is applied, not cancelled
  if (current.commissionPercentPending === null) {
    res.status(404).json({ error: "Aucun changement de commission en attente" });
    return;
  }
  const [row] = await db.update(platformSettingsTable)
    .set({ commissionPercentPending: null, commissionEffectiveAt: null, updatedAt: new Date() })
    .where(eq(platformSettingsTable.id, 1))
    .returning();
  req.log.info({ adminId: getSession(req).userId, cancelledPercent: current.commissionPercentPending }, "Pending commission change cancelled");
  const notification = await notifyCompanyAdmins({
    kind: "cancelled",
    currentPercent: parseFloat(current.commissionPercent),
    cancelledPercent: parseFloat(current.commissionPercentPending),
  });
  res.json({ ...formatSettings(row), notification });
});

// ── Company ratings overview (super admin) ──────────────────────────────────────

// Every company, best average first; companies without any rating come last
router.get("/admin/companies/ratings-overview", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      companyId: companiesTable.id,
      companyName: companiesTable.name,
      averageRating: sql<string | null>`round(avg(${companyRatingsTable.rating}), 1)`,
      ratingsCount: sql<number>`count(${companyRatingsTable.id})::int`,
    })
    .from(companiesTable)
    .leftJoin(companyRatingsTable, eq(companyRatingsTable.companyId, companiesTable.id))
    .groupBy(companiesTable.id, companiesTable.name)
    .orderBy(sql`avg(${companyRatingsTable.rating}) desc nulls last`, sql`count(${companyRatingsTable.id}) desc`, companiesTable.name);

  res.json({
    items: rows.map((r) => ({ ...r, averageRating: r.averageRating !== null ? parseFloat(r.averageRating) : null })),
  });
});

// ── Hotels ─────────────────────────────────────────────────────────────────────

function formatHotel(h: typeof hotelsTable.$inferSelect, agency: typeof agenciesTable.$inferSelect | undefined) {
  return {
    id: h.id, agencyId: h.agencyId, agencyName: agency?.name ?? "", name: h.name, city: h.city, address: h.address, description: h.description,
    pricePerNight: parseFloat(h.pricePerNight), totalRooms: h.totalRooms,
    rating: h.rating ? parseFloat(h.rating) : null, images: h.images ?? null, createdAt: h.createdAt.toISOString(),
  };
}

router.get("/admin/hotels", async (req, res): Promise<void> => {
  const query = GetAdminHotelsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(hotelsTable);
  const hotels = await db
    .select({ hotel: hotelsTable, agency: agenciesTable })
    .from(hotelsTable)
    .innerJoin(agenciesTable, eq(hotelsTable.agencyId, agenciesTable.id))
    .orderBy(hotelsTable.city, hotelsTable.id)
    .limit(pageSize).offset(offset);

  res.json({ items: hotels.map(({ hotel, agency }) => formatHotel(hotel, agency)), total: count, page, pageSize });
});

router.post("/admin/hotels", async (req, res): Promise<void> => {
  const body = CreateHotelBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const agencyError = await checkAgencyType(body.data.agencyId, "hotel");
  if (agencyError) { res.status(400).json({ error: agencyError }); return; }
  const imagesError = checkImageUrls(body.data.images);
  if (imagesError) { res.status(400).json({ error: imagesError }); return; }

  const [h] = await db.insert(hotelsTable).values({
    agencyId: body.data.agencyId, name: body.data.name, city: body.data.city, address: body.data.address,
    description: body.data.description ?? null,
    pricePerNight: String(body.data.pricePerNight), totalRooms: body.data.totalRooms,
    rating: body.data.rating != null ? String(body.data.rating) : null,
    images: body.data.images ?? null,
  }).returning();

  const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, h.agencyId)).limit(1);
  res.status(201).json(formatHotel(h, agency));
});

router.put("/admin/hotels/:hotelId", async (req, res): Promise<void> => {
  const params = UpdateHotelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateHotelBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const agencyError = await checkAgencyType(body.data.agencyId, "hotel");
  if (agencyError) { res.status(400).json({ error: agencyError }); return; }
  const imagesError = checkImageUrls(body.data.images);
  if (imagesError) { res.status(400).json({ error: imagesError }); return; }

  const [h] = await db.update(hotelsTable).set({
    agencyId: body.data.agencyId, name: body.data.name, city: body.data.city, address: body.data.address,
    description: body.data.description ?? null,
    pricePerNight: String(body.data.pricePerNight), totalRooms: body.data.totalRooms,
    rating: body.data.rating != null ? String(body.data.rating) : null,
    images: body.data.images ?? null,
  }).where(eq(hotelsTable.id, params.data.hotelId)).returning();

  if (!h) { res.status(404).json({ error: "Hôtel non trouvé" }); return; }
  const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, h.agencyId)).limit(1);
  res.json(formatHotel(h, agency));
});

router.delete("/admin/hotels/:hotelId", async (req, res): Promise<void> => {
  const params = DeleteHotelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(hotelsTable).where(eq(hotelsTable.id, params.data.hotelId));
  res.json({ success: true });
});

export default router;
