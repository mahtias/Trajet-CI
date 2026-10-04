import { Router, type IRouter } from "express";
import { eq, and, or, ne, gt, inArray, sql } from "drizzle-orm";
import {
  db, companiesTable, routesTable, tripsTable, seatsTable,
  citiesTable, stationsTable, companyStationsTable, busesTable, usersTable, ticketsTable, companyRatingsTable, type User,
} from "@workspace/db";
import { z } from "zod";
import {
  GetAdminCompaniesQueryParams,
  CreateRouteBody,
  UpdateRouteParams,
  UpdateRouteBody,
  DeleteRouteParams,
  CreateTripBody,
  UpdateTripParams,
  UpdateTripBody,
  DeleteTripParams,
  GetAdminRoutesQueryParams,
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
  GetCompanyRatingsQueryParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";
import { parsePagination } from "../lib/pagination";
import { matchesSearch, routeIdsMatching } from "../lib/search";
import { formatStation } from "../lib/stations";
import { getPlatformSettings } from "../lib/pricing";
import { managedCompanyId, canManageCompany, OTHER_COMPANY_ERROR } from "../lib/company-scope";
import {
  selectRoutes,
  selectTrips,
  getTripDetails,
  getTripCompanyId,
  getSeatCounts,
  isBusBusy,
  routeLabels,
  formatTripDetail,
  originStation,
  originCity,
  type RouteRow,
} from "../lib/trip-queries";

/**
 * Admin screens shared by the super admin and company admins (buses, routes, trips, company
 * stations, figures). A company_admin is limited to users.companyId: every route below checks
 * the company of the resource it touches (403 otherwise). Everything else under /admin
 * (users, cities/stations, agencies, commission…) stays in admin.ts, super admin only.
 */
const router: IRouter = Router();
router.use("/admin", requireRole("admin", "company_admin"));
router.use("/admin", (req, res, next) => {
  const user = currentUser(req);
  if (user.role === "company_admin" && !user.companyId) {
    res.status(403).json({ error: "Aucune compagnie n'est rattachée à votre compte" });
    return;
  }
  next();
});

function currentUser(req: any): User {
  return req.currentUser;
}

const AdminTripsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  routeId: z.coerce.number().int().optional(),
  search: z.string().optional(),
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


// ── Companies (read) ──────────────────────────────────────────────────────────

router.get("/admin/companies", async (req, res): Promise<void> => {
  const query = GetAdminCompaniesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  // Company admins only see their own company (used by the company pickers of the shared screens)
  const scope = managedCompanyId(currentUser(req));
  const search = query.data.search?.trim();
  const where = and(
    scope === null ? undefined : eq(companiesTable.id, scope),
    search ? matchesSearch(sql`${companiesTable.name}`, search) : undefined,
  );
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(companiesTable).where(where);
  const companies = await db.select().from(companiesTable).where(where).orderBy(companiesTable.name, companiesTable.id).limit(pageSize).offset(offset);

  res.json({
    items: companies.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() })),
    total: count, page, pageSize,
  });
});


// ── Stations (read) ───────────────────────────────────────────────────────────
// Needed to link stations to a company; creating/deleting stations stays super admin only.

router.get("/admin/stations", async (_req, res): Promise<void> => {
  const results = await db
    .select({ station: stationsTable, city: citiesTable })
    .from(stationsTable)
    .innerJoin(citiesTable, eq(stationsTable.cityId, citiesTable.id))
    .orderBy(citiesTable.name, stationsTable.name, stationsTable.id);
  res.json(results.map(({ station, city }) => formatStation(station, city)));
});


// ── Company stations ───────────────────────────────────────────────────────────

router.get("/admin/companies/:companyId/stations", async (req, res): Promise<void> => {
  const params = GetCompanyStationsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!canManageCompany(currentUser(req), params.data.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const results = await db
    .select({ station: stationsTable, city: citiesTable })
    .from(companyStationsTable)
    .innerJoin(stationsTable, eq(companyStationsTable.stationId, stationsTable.id))
    .innerJoin(citiesTable, eq(stationsTable.cityId, citiesTable.id))
    .where(eq(companyStationsTable.companyId, params.data.companyId))
    .orderBy(citiesTable.name, stationsTable.name, stationsTable.id);
  res.json(results.map(({ station, city }) => formatStation(station, city)));
});

router.post("/admin/companies/:companyId/stations", async (req, res): Promise<void> => {
  const params = AddCompanyStationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = AddCompanyStationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!canManageCompany(currentUser(req), params.data.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }

  const [result] = await db
    .select({ station: stationsTable, city: citiesTable })
    .from(stationsTable)
    .innerJoin(citiesTable, eq(stationsTable.cityId, citiesTable.id))
    .where(eq(stationsTable.id, body.data.stationId))
    .limit(1);
  if (!result) { res.status(404).json({ error: "Gare non trouvée" }); return; }

  await db
    .insert(companyStationsTable)
    .values({ companyId: company.id, stationId: result.station.id })
    .onConflictDoNothing();
  res.status(201).json(formatStation(result.station, result.city));
});

router.delete("/admin/companies/:companyId/stations/:stationId", async (req, res): Promise<void> => {
  const params = RemoveCompanyStationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const { companyId, stationId } = params.data;
  if (!canManageCompany(currentUser(req), companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const [route] = await db
    .select({ id: routesTable.id })
    .from(routesTable)
    .where(and(
      eq(routesTable.companyId, companyId),
      or(eq(routesTable.originStationId, stationId), eq(routesTable.destinationStationId, stationId)),
    ))
    .limit(1);
  if (route) { res.status(409).json({ error: "Cette gare est utilisée par des lignes de la compagnie" }); return; }

  await db
    .delete(companyStationsTable)
    .where(and(eq(companyStationsTable.companyId, companyId), eq(companyStationsTable.stationId, stationId)));
  res.json({ success: true });
});

// ── Buses ──────────────────────────────────────────────────────────────────────

function formatBus(b: typeof busesTable.$inferSelect) {
  return { id: b.id, companyId: b.companyId, name: b.name, capacity: b.capacity, isActive: b.isActive };
}

function isValidCapacity(capacity: number) {
  return Number.isInteger(capacity) && capacity >= 1 && capacity <= 100;
}

router.get("/admin/companies/:companyId/buses", async (req, res): Promise<void> => {
  const params = GetCompanyBusesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!canManageCompany(currentUser(req), params.data.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }
  const buses = await db.select().from(busesTable).where(eq(busesTable.companyId, params.data.companyId)).orderBy(busesTable.name, busesTable.id);
  res.json(buses.map(formatBus));
});

router.post("/admin/companies/:companyId/buses", async (req, res): Promise<void> => {
  const params = CreateBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = CreateBusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!isValidCapacity(body.data.capacity)) { res.status(400).json({ error: "La capacité doit être un entier entre 1 et 100" }); return; }
  if (!canManageCompany(currentUser(req), params.data.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, params.data.companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }

  const [b] = await db.insert(busesTable).values({
    companyId: company.id, name: body.data.name, capacity: body.data.capacity, isActive: body.data.isActive ?? true,
  }).returning();
  res.status(201).json(formatBus(b));
});

router.put("/admin/buses/:busId", async (req, res): Promise<void> => {
  const params = UpdateBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateBusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!isValidCapacity(body.data.capacity)) { res.status(400).json({ error: "La capacité doit être un entier entre 1 et 100" }); return; }

  const [existing] = await db.select().from(busesTable).where(eq(busesTable.id, params.data.busId)).limit(1);
  if (!existing) { res.status(404).json({ error: "Bus non trouvé" }); return; }
  if (!canManageCompany(currentUser(req), existing.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  // Capacity changes only apply to trips created afterwards: existing trips keep their seats.
  const [b] = await db.update(busesTable).set({
    name: body.data.name, capacity: body.data.capacity,
    ...(body.data.isActive !== undefined ? { isActive: body.data.isActive } : {}),
  }).where(eq(busesTable.id, params.data.busId)).returning();
  if (!b) { res.status(404).json({ error: "Bus non trouvé" }); return; }
  res.json(formatBus(b));
});

router.delete("/admin/buses/:busId", async (req, res): Promise<void> => {
  const params = DeleteBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [bus] = await db.select().from(busesTable).where(eq(busesTable.id, params.data.busId)).limit(1);
  if (!bus) { res.status(404).json({ error: "Bus non trouvé" }); return; }
  if (!canManageCompany(currentUser(req), bus.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const [trip] = await db.select({ id: tripsTable.id }).from(tripsTable).where(eq(tripsTable.busId, params.data.busId)).limit(1);
  if (trip) { res.status(409).json({ error: "Ce bus est affecté à des voyages, désactivez-le plutôt" }); return; }

  await db.delete(busesTable).where(eq(busesTable.id, params.data.busId));
  res.json({ success: true });
});

// ── Routes ─────────────────────────────────────────────────────────────────────

function formatRoute(row: RouteRow) {
  const { route, company } = row;
  return {
    id: route.id,
    originStationId: route.originStationId, destinationStationId: route.destinationStationId,
    ...routeLabels(row),
    durationMinutes: route.durationMinutes, companyId: route.companyId, companyName: company.name,
  };
}

/** Error message if the route's stations are invalid for this company, or null if they're fine. */
async function checkRouteStations(companyId: number, originStationId: number, destinationStationId: number): Promise<string | null> {
  if (originStationId === destinationStationId) return "La gare de départ et la gare d'arrivée doivent être différentes";

  const linked = await db
    .select({ stationId: companyStationsTable.stationId })
    .from(companyStationsTable)
    .where(and(
      eq(companyStationsTable.companyId, companyId),
      inArray(companyStationsTable.stationId, [originStationId, destinationStationId]),
    ));
  if (linked.length < 2) return "Les deux gares doivent être rattachées à la compagnie";
  return null;
}

router.get("/admin/routes", async (req, res): Promise<void> => {
  const query = GetAdminRoutesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  // A company admin only ever sees its own company's routes
  const scope = managedCompanyId(currentUser(req));
  const search = query.data.search?.trim();
  const where = and(
    scope === null ? undefined : eq(routesTable.companyId, scope),
    search ? sql`${routesTable.id} IN ${routeIdsMatching(search)}` : undefined,
  );
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(routesTable).where(where);
  const results = await selectRoutes()
    .where(where)
    .orderBy(originCity.name, originStation.name, routesTable.id)
    .limit(pageSize).offset(offset);

  res.json({ items: results.map(formatRoute), total: count, page, pageSize });
});

router.post("/admin/routes", async (req, res): Promise<void> => {
  const body = CreateRouteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!canManageCompany(currentUser(req), body.data.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const stationError = await checkRouteStations(body.data.companyId, body.data.originStationId, body.data.destinationStationId);
  if (stationError) { res.status(400).json({ error: stationError }); return; }

  const [route] = await db.insert(routesTable).values(body.data).returning();
  const [row] = await selectRoutes().where(eq(routesTable.id, route.id)).limit(1);
  res.status(201).json(formatRoute(row));
});

router.put("/admin/routes/:routeId", async (req, res): Promise<void> => {
  const params = UpdateRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateRouteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Both the route's current company and the one it would move to must be the admin's own
  const [current] = await db.select().from(routesTable).where(eq(routesTable.id, params.data.routeId)).limit(1);
  if (!current) { res.status(404).json({ error: "Route non trouvée" }); return; }
  if (!canManageCompany(currentUser(req), current.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }
  if (!canManageCompany(currentUser(req), body.data.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const stationError = await checkRouteStations(body.data.companyId, body.data.originStationId, body.data.destinationStationId);
  if (stationError) { res.status(400).json({ error: stationError }); return; }

  const [route] = await db.update(routesTable).set(body.data).where(eq(routesTable.id, params.data.routeId)).returning();
  if (!route) { res.status(404).json({ error: "Route non trouvée" }); return; }
  const [row] = await selectRoutes().where(eq(routesTable.id, route.id)).limit(1);
  res.json(formatRoute(row));
});

router.delete("/admin/routes/:routeId", async (req, res): Promise<void> => {
  const params = DeleteRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, params.data.routeId)).limit(1);
  if (!route) { res.status(404).json({ error: "Route non trouvée" }); return; }
  if (!canManageCompany(currentUser(req), route.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }
  await db.delete(routesTable).where(eq(routesTable.id, params.data.routeId));
  res.json({ success: true });
});

// ── Trips ──────────────────────────────────────────────────────────────────────

/** Error message if the bus can't be used on this route, or null if it can. */
function checkBusForRoute(bus: typeof busesTable.$inferSelect | undefined, route: typeof routesTable.$inferSelect): string | null {
  if (!bus) return "Bus non trouvé";
  if (bus.companyId !== route.companyId) return "Ce bus n'appartient pas à la compagnie de la ligne";
  if (!bus.isActive) return "Ce bus est désactivé";
  return null;
}

router.get("/admin/trips", async (req, res): Promise<void> => {
  const query = AdminTripsQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  let conditions: any[] = [];
  if (query.data.date) conditions.push(eq(tripsTable.departureDate, query.data.date));
  if (query.data.routeId) conditions.push(eq(tripsTable.routeId, query.data.routeId));
  const scope = managedCompanyId(currentUser(req));
  if (scope !== null) conditions.push(sql`${tripsTable.routeId} IN (SELECT id FROM routes WHERE company_id = ${scope})`);
  const search = query.data.search?.trim();
  if (search) {
    conditions.push(or(
      sql`${tripsTable.routeId} IN ${routeIdsMatching(search)}`,
      sql`${tripsTable.busId} IN (SELECT id FROM buses WHERE ${matchesSearch(sql.raw("name"), search)})`,
    ));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tripsTable).where(whereClause);

  const results = await selectTrips()
    .where(whereClause)
    .orderBy(tripsTable.departureDate, tripsTable.departureTime, tripsTable.id)
    .limit(pageSize).offset(offset);

  const trips = await Promise.all(results.map(async (row) => {
    const { totalSeats, availableSeats } = await getSeatCounts(row.trip.id);
    return formatTripDetail(row, availableSeats, totalSeats);
  }));

  res.json({ items: trips, total: count, page, pageSize });
});

router.post("/admin/trips", async (req, res): Promise<void> => {
  const body = CreateTripBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const departureDate = body.data.departureDate.toISOString().split("T")[0];

  const [route] = await db.select().from(routesTable).where(eq(routesTable.id, body.data.routeId)).limit(1);
  if (!route) { res.status(404).json({ error: "Route non trouvée" }); return; }
  if (!canManageCompany(currentUser(req), route.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const [bus] = await db.select().from(busesTable).where(eq(busesTable.id, body.data.busId)).limit(1);
  const busError = checkBusForRoute(bus, route);
  if (busError) { res.status(400).json({ error: busError }); return; }

  if (await isBusBusy(bus.id, departureDate, body.data.departureTime)) {
    res.status(409).json({ error: "Ce bus est déjà affecté à un autre voyage sur ce créneau" });
    return;
  }

  const trip = await db.transaction(async (tx) => {
    const [trip] = await tx.insert(tripsTable).values({
      routeId: route.id,
      busId: bus.id,
      departureDate,
      departureTime: body.data.departureTime,
      price: String(body.data.price),
    }).returning();

    // One seat per place in the bus
    await tx.insert(seatsTable).values(Array.from({ length: bus.capacity }, (_, i) => ({
      tripId: trip.id,
      seatNumber: i + 1,
      status: "available" as const,
    })));

    return trip;
  });

  const row = await getTripDetails(trip.id);
  res.status(201).json(formatTripDetail(row!, bus.capacity, bus.capacity));
});

router.put("/admin/trips/:tripId", async (req, res): Promise<void> => {
  const params = UpdateTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateTripBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const existing = await getTripDetails(params.data.tripId);
  if (!existing) { res.status(404).json({ error: "Trajet non trouvé" }); return; }
  if (!canManageCompany(currentUser(req), existing.route.companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }

  const updateData: any = {};
  if (body.data.departureDate !== undefined) updateData.departureDate = body.data.departureDate.toISOString().split("T")[0];
  if (body.data.departureTime !== undefined) updateData.departureTime = body.data.departureTime;
  if (body.data.price !== undefined) updateData.price = String(body.data.price);
  if (body.data.status !== undefined) updateData.status = body.data.status;

  let newBus: typeof busesTable.$inferSelect | undefined;
  if (body.data.busId !== undefined && body.data.busId !== existing.trip.busId) {
    [newBus] = await db.select().from(busesTable).where(eq(busesTable.id, body.data.busId)).limit(1);
    const busError = checkBusForRoute(newBus, existing.route);
    if (busError) { res.status(400).json({ error: busError }); return; }

    // Seats above the new capacity can only be dropped if nobody holds them.
    const [taken] = await db
      .select({ id: seatsTable.id })
      .from(seatsTable)
      .where(and(eq(seatsTable.tripId, existing.trip.id), gt(seatsTable.seatNumber, newBus!.capacity), ne(seatsTable.status, "available")))
      .limit(1);
    if (taken) { res.status(409).json({ error: "Des sièges au-delà de la capacité du nouveau bus sont déjà réservés ou vendus" }); return; }

    updateData.busId = newBus!.id;
  }

  const busId = updateData.busId ?? existing.trip.busId;
  const departureDate = updateData.departureDate ?? existing.trip.departureDate;
  const departureTime = updateData.departureTime ?? existing.trip.departureTime;
  const status = updateData.status ?? existing.trip.status;
  if (status === "active" && await isBusBusy(busId, departureDate, departureTime, existing.trip.id)) {
    res.status(409).json({ error: "Ce bus est déjà affecté à un autre voyage sur ce créneau" });
    return;
  }

  const { totalSeats: currentSeats } = await getSeatCounts(existing.trip.id);
  await db.transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.update(tripsTable).set(updateData).where(eq(tripsTable.id, existing.trip.id));
    }

    // Resize the seat map to the new bus
    if (newBus && newBus.capacity < currentSeats) {
      await tx.delete(seatsTable).where(and(eq(seatsTable.tripId, existing.trip.id), gt(seatsTable.seatNumber, newBus.capacity)));
    } else if (newBus && newBus.capacity > currentSeats) {
      await tx.insert(seatsTable).values(Array.from({ length: newBus.capacity - currentSeats }, (_, i) => ({
        tripId: existing.trip.id,
        seatNumber: currentSeats + i + 1,
        status: "available" as const,
      })));
    }
  });

  const row = await getTripDetails(existing.trip.id);
  const { totalSeats, availableSeats } = await getSeatCounts(existing.trip.id);
  res.json(formatTripDetail(row!, availableSeats, totalSeats));
});

router.delete("/admin/trips/:tripId", async (req, res): Promise<void> => {
  const params = DeleteTripParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const tripCompanyId = await getTripCompanyId(params.data.tripId);
  if (tripCompanyId === null) { res.status(404).json({ error: "Trajet non trouvé" }); return; }
  if (!canManageCompany(currentUser(req), tripCompanyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }
  await db.delete(tripsTable).where(eq(tripsTable.id, params.data.tripId));
  res.json({ success: true });
});

// ── Dashboard stats ────────────────────────────────────────────────────────────

router.get("/admin/dashboard/stats", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";

  // Company admins only see their company; the filter comes from the account, never from the request
  const scope = managedCompanyId(currentUser(req));
  const companyFilter = scope === null ? sql`` : sql`AND c.id = ${scope}`;
  const fromPaid = sql`
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid' AND tk.cancelled_at IS NULL ${companyFilter}
  `;

  const { rows: [todayStats] } = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromPaid} AND DATE(tk.created_at) = ${today}
  `) as any;

  const { rows: [monthStats] } = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromPaid} AND DATE(tk.created_at) >= ${monthStart}
  `) as any;

  const { rows: byCompany } = await db.execute(sql`
    SELECT c.name as company_name, COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromPaid}
    GROUP BY c.name
    ORDER BY ticket_count DESC
  `) as any;

  const { rows: byDay } = await db.execute(sql`
    SELECT DATE(tk.created_at)::text as date, COUNT(*)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromPaid} AND tk.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(tk.created_at)
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
    JOIN stations os ON r.origin_station_id = os.id
    JOIN cities oc ON os.city_id = oc.id
    JOIN stations ds ON r.destination_station_id = ds.id
    JOIN cities dc ON ds.city_id = dc.id
    WHERE tk.payment_status = 'paid' AND tk.cancelled_at IS NULL
      AND DATE(tk.created_at) >= ${from}
      AND DATE(tk.created_at) <= ${to}
  `;

  // Company admins: always their own company (asking for another one is refused, not silently widened)
  const scope = managedCompanyId(currentUser(req));
  if (scope !== null && query.data.companyId !== undefined && query.data.companyId !== scope) {
    res.status(403).json({ error: OTHER_COMPANY_ERROR });
    return;
  }
  const companyId = scope ?? query.data.companyId;
  if (companyId) {
    fromWhere = sql`${fromWhere} AND c.id = ${companyId}`;
  }

  // Full date-range aggregate — unaffected by pagination.
  const { rows: [totals] } = await db.execute(sql`
    SELECT COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromWhere}
  `) as any;

  // Number of grouped rows, for pagination.
  const { rows: [countRow] } = await db.execute(sql`
    SELECT COUNT(*)::int as count FROM (
      SELECT 1 ${fromWhere} GROUP BY DATE(tk.created_at), c.name, os.name, oc.name, ds.name, dc.name
    ) sub
  `) as any;

  const { rows: rowsArray } = await db.execute(sql`
    SELECT DATE(tk.created_at)::text as date, c.name as company_name,
           os.name || ', ' || oc.name as origin, ds.name || ', ' || dc.name as destination,
           COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    ${fromWhere}
    GROUP BY DATE(tk.created_at), c.name, os.name, oc.name, ds.name, dc.name
    ORDER BY date DESC, c.name, origin, destination
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


// ── Revenue split ──────────────────────────────────────────────────────────────

const RevenueSplitQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().optional(),
  pageSize: z.coerce.number().int().optional(),
});

/**
 * Per company: what customers paid, fares sold, platform commission, company share and the seat
 * selection fees split. Uses the amounts frozen on each ticket (paid, not cancelled), so for every
 * ticket price = company_share + platform_commission + seat_selection_fee_paid: on new tickets the
 * commission is on top of the fare (company_share = fare), on tickets sold before that change it was
 * deducted (company_share = fare - commission). Tickets sold before the split existed
 * (fare_price IS NULL) are left out: their split was never recorded.
 */
router.get("/admin/reports/revenue-split", async (req, res): Promise<void> => {
  const query = RevenueSplitQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const from = query.data.from ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const to = query.data.to ?? new Date().toISOString().split("T")[0];
  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);

  // Company admins only ever get their own company; the scope comes from the account
  const scope = managedCompanyId(currentUser(req));
  const fromWhere = sql`
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid' AND tk.cancelled_at IS NULL AND tk.fare_price IS NOT NULL
      AND DATE(tk.created_at) >= ${from} AND DATE(tk.created_at) <= ${to}
      ${scope === null ? sql`` : sql`AND c.id = ${scope}`}
  `;
  const sums = sql`
    COUNT(tk.id)::int as ticket_count,
    COALESCE(SUM(tk.price), 0)::float as total_paid,
    COALESCE(SUM(tk.fare_price), 0)::float as fare_price,
    COALESCE(SUM(tk.platform_commission), 0)::float as platform_commission,
    COALESCE(SUM(tk.company_share), 0)::float as company_share,
    COALESCE(SUM(tk.seat_selection_fee_paid), 0)::float as seat_selection_fee_paid,
    COALESCE(SUM(tk.seat_fee_platform_share), 0)::float as seat_fee_platform_share,
    COALESCE(SUM(tk.seat_fee_company_share), 0)::float as seat_fee_company_share
  `;

  const { rows: [totals] } = await db.execute(sql`SELECT ${sums} ${fromWhere}`) as any;
  const { rows: [countRow] } = await db.execute(sql`SELECT COUNT(DISTINCT c.id)::int as count ${fromWhere}`) as any;
  const { rows } = await db.execute(sql`
    SELECT c.id as company_id, c.name as company_name, ${sums}
    ${fromWhere}
    GROUP BY c.id, c.name
    ORDER BY fare_price DESC, c.name
    LIMIT ${pageSize} OFFSET ${offset}
  `) as any;

  const formatAmounts = (r: any) => ({
    ticketCount: r?.ticket_count ?? 0,
    totalPaid: r?.total_paid ?? 0,
    farePrice: r?.fare_price ?? 0,
    platformCommission: r?.platform_commission ?? 0,
    companyShare: r?.company_share ?? 0,
    seatSelectionFeePaid: r?.seat_selection_fee_paid ?? 0,
    seatFeePlatformShare: r?.seat_fee_platform_share ?? 0,
    seatFeeCompanyShare: r?.seat_fee_company_share ?? 0,
  });

  res.json({
    from, to,
    totals: formatAmounts(totals),
    rows: rows.map((r: any) => ({ companyId: r.company_id, companyName: r.company_name, ...formatAmounts(r) })),
    total: countRow?.count ?? 0,
    page, pageSize,
  });
});

// ── Commission change banner (company admins) ───────────────────────────────────

// The announced change, until it applies or the company admin dismisses it (shown again for a newer one)
router.get("/admin/commission-notice", async (req, res): Promise<void> => {
  const user = currentUser(req);
  const settings = await getPlatformSettings(); // a change that came due is applied here, so no banner for it
  const { commissionPercentPending: pending, commissionEffectiveAt: effectiveAt, commissionAnnouncedAt: announcedAt } = settings;
  const dismissed = !!user.commissionNoticeSeenAt && !!announcedAt && user.commissionNoticeSeenAt >= announcedAt;
  if (user.role !== "company_admin" || pending === null || !effectiveAt || !announcedAt || effectiveAt.getTime() <= Date.now() || dismissed) {
    res.json({ notice: null });
    return;
  }
  res.json({
    notice: {
      currentPercent: parseFloat(settings.commissionPercent),
      newPercent: parseFloat(pending),
      effectiveAt: effectiveAt.toISOString(),
      announcedAt: announcedAt.toISOString(),
    },
  });
});

router.post("/admin/commission-notice/acknowledge", async (req, res): Promise<void> => {
  await db.update(usersTable).set({ commissionNoticeSeenAt: new Date() }).where(eq(usersTable.id, currentUser(req).id));
  res.json({ success: true });
});

// ── Ratings received (company admin: its own company; super admin: the company asked for) ──

/** "Awa Kouassi Marie" → "Awa M.": enough to tell reviews apart, not to identify the passenger. */
function authorName(passengerName: string): string {
  const parts = passengerName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Passager";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

router.get("/admin/ratings", async (req, res): Promise<void> => {
  const query = GetCompanyRatingsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const user = currentUser(req);

  const scope = managedCompanyId(user);
  // A company admin asking explicitly for another company: refused, like the sales report
  if (scope !== null && query.data.companyId !== undefined && query.data.companyId !== scope) {
    res.status(403).json({ error: OTHER_COMPANY_ERROR });
    return;
  }
  const companyId = scope ?? query.data.companyId;
  if (!companyId) { res.status(400).json({ error: "Précisez la compagnie (companyId)" }); return; }
  if (!canManageCompany(user, companyId)) { res.status(403).json({ error: OTHER_COMPANY_ERROR }); return; }
  const [company] = await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Compagnie non trouvée" }); return; }

  const { page, pageSize, offset } = parsePagination(query.data.page, query.data.pageSize);
  const [stats] = await db
    .select({ average: sql<string | null>`round(avg(${companyRatingsTable.rating}), 1)`, count: sql<number>`count(*)::int` })
    .from(companyRatingsTable)
    .where(eq(companyRatingsTable.companyId, companyId));
  const rows = await db
    .select({ rating: companyRatingsTable, passengerName: ticketsTable.passengerName, tripId: ticketsTable.tripId })
    .from(companyRatingsTable)
    .innerJoin(ticketsTable, eq(companyRatingsTable.ticketId, ticketsTable.id))
    .where(eq(companyRatingsTable.companyId, companyId))
    .orderBy(sql`${companyRatingsTable.createdAt} desc`, sql`${companyRatingsTable.id} desc`)
    .limit(pageSize).offset(offset);

  const items = await Promise.all(rows.map(async ({ rating, passengerName, tripId }) => {
    const trip = await getTripDetails(tripId);
    const labels = trip ? routeLabels(trip) : { origin: "", destination: "" };
    return {
      id: rating.id,
      ticketId: rating.ticketId,
      rating: rating.rating,
      comment: rating.comment,
      authorName: authorName(passengerName),
      origin: labels.origin,
      destination: labels.destination,
      departureDate: trip?.trip.departureDate ?? "",
      createdAt: rating.createdAt.toISOString(),
    };
  }));

  res.json({
    companyId: company.id,
    companyName: company.name,
    averageRating: stats.average !== null ? parseFloat(stats.average) : null,
    ratingsCount: stats.count,
    items,
    total: stats.count,
    page, pageSize,
  });
});

export default router;
