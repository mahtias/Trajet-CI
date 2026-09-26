import { Router, type IRouter } from "express";
import { eq, and, or, ne, gt, inArray, sql } from "drizzle-orm";
import {
  db, companiesTable, routesTable, tripsTable, seatsTable, usersTable, hotelsTable,
  citiesTable, stationsTable, companyStationsTable, busesTable,
} from "@workspace/db";
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
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";
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
  const results = await db
    .select({ user: usersTable, company: companiesTable })
    .from(usersTable)
    .leftJoin(companiesTable, eq(usersTable.companyId, companiesTable.id))
    .orderBy(usersTable.createdAt, usersTable.id)
    .limit(pageSize).offset(offset);

  res.json({
    items: results.map(({ user: u, company }) => ({
      id: u.id, phone: u.phone, name: u.name, role: u.role,
      companyId: u.companyId, companyName: company?.name ?? null,
      createdAt: u.createdAt.toISOString(),
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

  const [u] = await db
    .update(usersTable)
    .set({ role: body.data.role, companyId: body.data.companyId ?? null })
    .where(eq(usersTable.id, params.data.userId))
    .returning();
  if (!u) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }

  const [company] = u.companyId
    ? await db.select().from(companiesTable).where(eq(companiesTable.id, u.companyId)).limit(1)
    : [undefined];

  res.json({
    id: u.id, phone: u.phone, name: u.name, role: u.role,
    companyId: u.companyId, companyName: company?.name ?? null,
    createdAt: u.createdAt.toISOString(),
  });
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

function formatStation(station: typeof stationsTable.$inferSelect, city: typeof citiesTable.$inferSelect) {
  return { id: station.id, name: station.name, cityId: station.cityId, cityName: city.name };
}

router.get("/admin/stations", async (_req, res): Promise<void> => {
  const results = await db
    .select({ station: stationsTable, city: citiesTable })
    .from(stationsTable)
    .innerJoin(citiesTable, eq(stationsTable.cityId, citiesTable.id))
    .orderBy(citiesTable.name, stationsTable.name, stationsTable.id);
  res.json(results.map(({ station, city }) => formatStation(station, city)));
});

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

// ── Company stations ───────────────────────────────────────────────────────────

router.get("/admin/companies/:companyId/stations", async (req, res): Promise<void> => {
  const params = GetCompanyStationsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

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
  const buses = await db.select().from(busesTable).where(eq(busesTable.companyId, params.data.companyId)).orderBy(busesTable.name, busesTable.id);
  res.json(buses.map(formatBus));
});

router.post("/admin/companies/:companyId/buses", async (req, res): Promise<void> => {
  const params = CreateBusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = CreateBusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!isValidCapacity(body.data.capacity)) { res.status(400).json({ error: "La capacité doit être un entier entre 1 et 100" }); return; }

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

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(routesTable);
  const results = await selectRoutes()
    .orderBy(originCity.name, originStation.name, routesTable.id)
    .limit(pageSize).offset(offset);

  res.json({ items: results.map(formatRoute), total: count, page, pageSize });
});

router.post("/admin/routes", async (req, res): Promise<void> => {
  const body = CreateRouteBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

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
    WHERE t.payment_status = 'paid' AND t.cancelled_at IS NULL AND DATE(t.created_at) = ${today}
  `) as any;

  const { rows: [monthStats] } = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(t.price::numeric), 0)::float as revenue
    FROM tickets t
    WHERE t.payment_status = 'paid' AND t.cancelled_at IS NULL AND DATE(t.created_at) >= ${monthStart}
  `) as any;

  const { rows: byCompany } = await db.execute(sql`
    SELECT c.name as company_name, COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid' AND tk.cancelled_at IS NULL
    GROUP BY c.name
    ORDER BY ticket_count DESC
  `) as any;

  const { rows: byDay } = await db.execute(sql`
    SELECT DATE(created_at)::text as date, COUNT(*)::int as ticket_count, COALESCE(SUM(price::numeric), 0)::float as revenue
    FROM tickets
    WHERE payment_status = 'paid' AND cancelled_at IS NULL AND created_at >= NOW() - INTERVAL '14 days'
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
    JOIN stations os ON r.origin_station_id = os.id
    JOIN cities oc ON os.city_id = oc.id
    JOIN stations ds ON r.destination_station_id = ds.id
    JOIN cities dc ON ds.city_id = dc.id
    WHERE tk.payment_status = 'paid' AND tk.cancelled_at IS NULL
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
