import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, companiesTable, routesTable, tripsTable, seatsTable, ticketsTable, usersTable, hotelsTable } from "@workspace/db";
import { z } from "zod";
import {
  CreateCompanyBody,
  UpdateCompanyParams,
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
  GetAdminCompaniesQueryParams,
  GetAdminRoutesQueryParams,
  GetAdminUsersQueryParams,
  GetAdminHotelsQueryParams,
  CreateHotelBody,
  UpdateHotelParams,
  UpdateHotelBody,
  DeleteHotelParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";

const AdminTripsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  routeId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

const SalesReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  companyId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

function parsePagination(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.trunc(page ?? 1) || 1);
  const size = Math.min(100, Math.max(1, Math.trunc(pageSize ?? 20) || 20));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

const router: IRouter = Router();
router.use(requireRole("admin"));

// ── Companies ──────────────────────────────────────────────────────────────────

router.get("/admin/companies", async (req, res): Promise<void> => {
  const query = GetAdminCompaniesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(companiesTable);
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name, companiesTable.id).limit(pageSize).offset(offset);

  res.json({
    items: companies.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() })),
    total: count, page, pageSize,
  });
});

router.post("/admin/companies", async (req, res): Promise<void> => {
  const body = CreateCompanyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [c] = await db.insert(companiesTable).values({ name: body.data.name }).returning();
  res.status(201).json({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() });
});

router.put("/admin/companies/:companyId", async (req, res): Promise<void> => {
  const params = UpdateCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateCompanyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [c] = await db.update(companiesTable).set({ name: body.data.name }).where(eq(companiesTable.id, params.data.companyId)).returning();
  if (!c) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }
  res.json({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() });
});

router.delete("/admin/companies/:companyId", async (req, res): Promise<void> => {
  const params = DeleteCompanyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(companiesTable).where(eq(companiesTable.id, params.data.companyId));
  res.json({ success: true });
});

// ── Users ──────────────────────────────────────────────────────────────────────

function getSession(req: any) {
  return req.session as { userId?: number };
}

router.get("/admin/users", async (req, res): Promise<void> => {
  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt, usersTable.id).limit(pageSize).offset(offset);

  res.json({
    items: users.map((u) => ({
      id: u.id, phone: u.phone, name: u.name, role: u.role, createdAt: u.createdAt.toISOString(),
    })),
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

  const [u] = await db.update(usersTable).set({ role: body.data.role }).where(eq(usersTable.id, params.data.userId)).returning();
  if (!u) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }
  res.json({ id: u.id, phone: u.phone, name: u.name, role: u.role, createdAt: u.createdAt.toISOString() });
});

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get("/admin/routes", async (req, res): Promise<void> => {
  const query = GetAdminRoutesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(routesTable);
  const results = await db
    .select({ route: routesTable, company: companiesTable })
    .from(routesTable)
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .orderBy(routesTable.origin, routesTable.id)
    .limit(pageSize).offset(offset);

  res.json({
    items: results.map(({ route, company }) => ({
      id: route.id, origin: route.origin, destination: route.destination,
      durationMinutes: route.durationMinutes, companyId: route.companyId, companyName: company.name,
    })),
    total: count, page, pageSize,
  });
});

router.post("/admin/routes", async (req, res): Promise<void> => {
  const body = CreateRouteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [route] = await db.insert(routesTable).values(body.data).returning();
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, route.companyId)).limit(1);
  res.status(201).json({ id: route.id, origin: route.origin, destination: route.destination, durationMinutes: route.durationMinutes, companyId: route.companyId, companyName: company?.name ?? "" });
});

router.put("/admin/routes/:routeId", async (req, res): Promise<void> => {
  const params = UpdateRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateRouteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [route] = await db.update(routesTable).set(body.data).where(eq(routesTable.id, params.data.routeId)).returning();
  if (!route) { res.status(404).json({ error: "Route non trouvée" }); return; }
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, route.companyId)).limit(1);
  res.json({ id: route.id, origin: route.origin, destination: route.destination, durationMinutes: route.durationMinutes, companyId: route.companyId, companyName: company?.name ?? "" });
});

router.delete("/admin/routes/:routeId", async (req, res): Promise<void> => {
  const params = DeleteRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(routesTable).where(eq(routesTable.id, params.data.routeId));
  res.json({ success: true });
});

// ── Trips ──────────────────────────────────────────────────────────────────────

router.get("/admin/trips", async (req, res): Promise<void> => {
  const query = AdminTripsQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  let conditions: any[] = [];
  if (query.data.date) conditions.push(eq(tripsTable.departureDate, query.data.date));
  if (query.data.routeId) conditions.push(eq(tripsTable.routeId, query.data.routeId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(whereClause);

  const results = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(whereClause)
    .orderBy(tripsTable.departureDate, tripsTable.departureTime, tripsTable.id)
    .limit(pageSize).offset(offset);

  const trips = await Promise.all(results.map(async ({ trip, route, company }) => {
    const seatCounts = await db
      .select({ status: seatsTable.status, count: sql<number>`count(*)::int` })
      .from(seatsTable)
      .where(eq(seatsTable.tripId, trip.id))
      .groupBy(seatsTable.status);

    const totalSeats = seatCounts.reduce((s, r) => s + r.count, 0);
    const availableSeats = seatCounts.find(r => r.status === "available")?.count ?? 0;

    return {
      id: trip.id, origin: route.origin, destination: route.destination,
      departureDate: trip.departureDate, departureTime: trip.departureTime,
      price: parseFloat(trip.price), companyName: company.name,
      companyId: company.id, routeId: route.id,
      durationMinutes: route.durationMinutes, totalSeats, availableSeats,
      status: trip.status,
    };
  }));

  res.json({ items: trips, total: count, page, pageSize });
});

router.post("/admin/trips", async (req, res): Promise<void> => {
  const body = CreateTripBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [trip] = await db.insert(tripsTable).values({
    routeId: body.data.routeId,
    departureDate: body.data.departureDate.toISOString().split("T")[0],
    departureTime: body.data.departureTime,
    price: String(body.data.price),
  }).returning();

  // Create 40 seats for this trip
  const seats = Array.from({ length: 40 }, (_, i) => ({
    tripId: trip.id,
    seatNumber: i + 1,
    status: "available" as const,
  }));
  await db.insert(seatsTable).values(seats);

  const [result] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, trip.id))
    .limit(1);

  res.status(201).json({
    id: result.trip.id, origin: result.route.origin, destination: result.route.destination,
    departureDate: result.trip.departureDate, departureTime: result.trip.departureTime,
    price: parseFloat(result.trip.price), companyName: result.company.name,
    companyId: result.company.id, routeId: result.route.id,
    durationMinutes: result.route.durationMinutes, totalSeats: 40, availableSeats: 40,
    status: result.trip.status,
  });
});

router.put("/admin/trips/:tripId", async (req, res): Promise<void> => {
  const params = UpdateTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTripBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const updateData: any = {};
  if (body.data.departureDate !== undefined) updateData.departureDate = body.data.departureDate.toISOString().split("T")[0];
  if (body.data.departureTime !== undefined) updateData.departureTime = body.data.departureTime;
  if (body.data.price !== undefined) updateData.price = String(body.data.price);
  if (body.data.status !== undefined) updateData.status = body.data.status;

  const [trip] = await db.update(tripsTable).set(updateData).where(eq(tripsTable.id, params.data.tripId)).returning();
  if (!trip) { res.status(404).json({ error: "Trajet non trouvé" }); return; }

  const [result] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, trip.id))
    .limit(1);

  const seatCounts = await db
    .select({ status: seatsTable.status, count: sql<number>`count(*)::int` })
    .from(seatsTable).where(eq(seatsTable.tripId, trip.id)).groupBy(seatsTable.status);
  const totalSeats = seatCounts.reduce((s, r) => s + r.count, 0);
  const availableSeats = seatCounts.find(r => r.status === "available")?.count ?? 0;

  res.json({
    id: result.trip.id, origin: result.route.origin, destination: result.route.destination,
    departureDate: result.trip.departureDate, departureTime: result.trip.departureTime,
    price: parseFloat(result.trip.price), companyName: result.company.name,
    companyId: result.company.id, routeId: result.route.id,
    durationMinutes: result.route.durationMinutes, totalSeats, availableSeats,
    status: result.trip.status,
  });
});

router.delete("/admin/trips/:tripId", async (req, res): Promise<void> => {
  const params = DeleteTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(tripsTable).where(eq(tripsTable.id, params.data.tripId));
  res.json({ success: true });
});

// ── Dashboard stats ────────────────────────────────────────────────────────────

router.get("/admin/dashboard/stats", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";

  const { rows: [todayStats] } = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(t.price::numeric), 0)::float as revenue
    FROM tickets t
    WHERE t.payment_status = 'paid' AND DATE(t.created_at) = ${today}
  `) as any;

  const { rows: [monthStats] } = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(t.price::numeric), 0)::float as revenue
    FROM tickets t
    WHERE t.payment_status = 'paid' AND DATE(t.created_at) >= ${monthStart}
  `) as any;

  const { rows: byCompany } = await db.execute(sql`
    SELECT c.name as company_name, COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid'
    GROUP BY c.name
    ORDER BY ticket_count DESC
  `) as any;

  const { rows: byDay } = await db.execute(sql`
    SELECT DATE(created_at)::text as date, COUNT(*)::int as ticket_count, COALESCE(SUM(price::numeric), 0)::float as revenue
    FROM tickets
    WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `) as any;

  res.json({
    totalTicketsSoldToday: todayStats?.ticket_count ?? 0,
    totalRevenuToday: todayStats?.revenue ?? 0,
    totalTicketsSoldMonth: monthStats?.ticket_count ?? 0,
    totalRevenueMonth: monthStats?.revenue ?? 0,
    ticketsByCompany: byCompany.map((r: any) => ({
      companyName: r.company_name, ticketCount: r.ticket_count, revenue: r.revenue,
    })),
    salesByDay: byDay.map((r: any) => ({
      date: r.date, ticketCount: r.ticket_count, revenue: r.revenue,
    })),
  });
});

// ── Sales report ───────────────────────────────────────────────────────────────

router.get("/admin/reports/sales", async (req, res): Promise<void> => {
  const query = SalesReportQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const from = query.data.from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const to = query.data.to ?? new Date().toISOString().split("T")[0];
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  let fromWhere = sql`
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid'
      AND DATE(tk.created_at) >= ${from}
      AND DATE(tk.created_at) <= ${to}
  `;

  if (query.data.companyId) {
    fromWhere = sql`${fromWhere} AND c.id = ${query.data.companyId}`;
  }

  // Full date-range aggregate — unaffected by pagination.
  const { rows: [totals] } = await db.execute(sql`
    SELECT COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromWhere}
  `) as any;

  // Number of grouped rows, for pagination.
  const { rows: [countRow] } = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM (
      SELECT 1 ${fromWhere} GROUP BY DATE(tk.created_at), c.name, r.origin, r.destination
    ) sub
  `) as any;

  const { rows: rowsArray } = await db.execute(sql`
    SELECT DATE(tk.created_at)::text as date, c.name as company_name,
           r.origin, r.destination,
           COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromWhere}
    GROUP BY DATE(tk.created_at), c.name, r.origin, r.destination
    ORDER BY date DESC, c.name, r.origin, r.destination
    LIMIT ${pageSize} OFFSET ${offset}
  `) as any;

  res.json({
    from, to,
    totalTickets: totals?.ticket_count ?? 0,
    totalRevenue: totals?.revenue ?? 0,
    total: countRow?.count ?? 0,
    page, pageSize,
    rows: rowsArray.map((r: any) => ({
      date: r.date, companyName: r.company_name,
      origin: r.origin, destination: r.destination,
      ticketCount: r.ticket_count, revenue: r.revenue,
    })),
  });
});

// ── Hotels ─────────────────────────────────────────────────────────────────────

function formatHotel(h: typeof hotelsTable.$inferSelect) {
  return {
    id: h.id, name: h.name, city: h.city, address: h.address, description: h.description,
    pricePerNight: parseFloat(h.pricePerNight), totalRooms: h.totalRooms,
    rating: h.rating ? parseFloat(h.rating) : null, createdAt: h.createdAt.toISOString(),
  };
}

router.get("/admin/hotels", async (req, res): Promise<void> => {
  const query = GetAdminHotelsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(hotelsTable);
  const hotels = await db.select().from(hotelsTable).orderBy(hotelsTable.city, hotelsTable.id).limit(pageSize).offset(offset);

  res.json({ items: hotels.map(formatHotel), total: count, page, pageSize });
});

router.post("/admin/hotels", async (req, res): Promise<void> => {
  const body = CreateHotelBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [h] = await db.insert(hotelsTable).values({
    name: body.data.name, city: body.data.city, address: body.data.address,
    description: body.data.description ?? null,
    pricePerNight: String(body.data.pricePerNight), totalRooms: body.data.totalRooms,
    rating: body.data.rating != null ? String(body.data.rating) : null,
  }).returning();

  res.status(201).json(formatHotel(h));
});

router.put("/admin/hotels/:hotelId", async (req, res): Promise<void> => {
  const params = UpdateHotelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateHotelBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [h] = await db.update(hotelsTable).set({
    name: body.data.name, city: body.data.city, address: body.data.address,
    description: body.data.description ?? null,
    pricePerNight: String(body.data.pricePerNight), totalRooms: body.data.totalRooms,
    rating: body.data.rating != null ? String(body.data.rating) : null,
  }).where(eq(hotelsTable.id, params.data.hotelId)).returning();

  if (!h) { res.status(404).json({ error: "Hôtel non trouvé" }); return; }
  res.json(formatHotel(h));
});

router.delete("/admin/hotels/:hotelId", async (req, res): Promise<void> => {
  const params = DeleteHotelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(hotelsTable).where(eq(hotelsTable.id, params.data.hotelId));
  res.json({ success: true });
});

export default router;
