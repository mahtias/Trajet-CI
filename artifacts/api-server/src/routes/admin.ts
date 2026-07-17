import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, companiesTable, routesTable, tripsTable, seatsTable, ticketsTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const AdminTripsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  routeId: z.coerce.number().int().optional(),
});

const SalesReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  companyId: z.coerce.number().int().optional(),
});

const router: IRouter = Router();

// ── Companies ──────────────────────────────────────────────────────────────────

router.get("/admin/companies", async (_req, res): Promise<void> => {
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  res.json(companies.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() })));
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

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get("/admin/routes", async (_req, res): Promise<void> => {
  const results = await db
    .select({ route: routesTable, company: companiesTable })
    .from(routesTable)
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .orderBy(routesTable.origin);
  res.json(results.map(({ route, company }) => ({
    id: route.id, origin: route.origin, destination: route.destination,
    durationMinutes: route.durationMinutes, companyId: route.companyId, companyName: company.name,
  })));
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

  let conditions: any[] = [];
  if (query.data.date) conditions.push(eq(tripsTable.departureDate, query.data.date));
  if (query.data.routeId) conditions.push(eq(tripsTable.routeId, query.data.routeId));

  const results = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(tripsTable.departureDate, tripsTable.departureTime);

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

  res.json(trips);
});

router.post("/admin/trips", async (req, res): Promise<void> => {
  const body = CreateTripBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [trip] = await db.insert(tripsTable).values({
    routeId: body.data.routeId,
    departureDate: body.data.departureDate,
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
  if (body.data.departureDate !== undefined) updateData.departureDate = body.data.departureDate;
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

  const [todayStats] = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(t.price::numeric), 0)::float as revenue
    FROM tickets t
    WHERE t.payment_status = 'paid' AND DATE(t.created_at) = ${today}
  `) as any;

  const [monthStats] = await db.execute(sql`
    SELECT COUNT(*)::int as ticket_count, COALESCE(SUM(t.price::numeric), 0)::float as revenue
    FROM tickets t
    WHERE t.payment_status = 'paid' AND DATE(t.created_at) >= ${monthStart}
  `) as any;

  const byCompany = await db.execute(sql`
    SELECT c.name as company_name, COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid'
    GROUP BY c.name
    ORDER BY ticket_count DESC
  `) as any;

  const byDay = await db.execute(sql`
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
    ticketsByCompany: (Array.isArray(byCompany) ? byCompany : []).map((r: any) => ({
      companyName: r.company_name, ticketCount: r.ticket_count, revenue: r.revenue,
    })),
    salesByDay: (Array.isArray(byDay) ? byDay : []).map((r: any) => ({
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

  let baseQuery = sql`
    SELECT DATE(tk.created_at)::text as date, c.name as company_name,
           r.origin, r.destination,
           COUNT(tk.id)::int as ticket_count, COALESCE(SUM(tk.price::numeric), 0)::float as revenue
    FROM tickets tk
    JOIN trips tr ON tk.trip_id = tr.id
    JOIN routes r ON tr.route_id = r.id
    JOIN companies c ON r.company_id = c.id
    WHERE tk.payment_status = 'paid'
      AND DATE(tk.created_at) >= ${from}
      AND DATE(tk.created_at) <= ${to}
  `;

  if (query.data.companyId) {
    baseQuery = sql`${baseQuery} AND c.id = ${query.data.companyId}`;
  }

  baseQuery = sql`${baseQuery} GROUP BY DATE(tk.created_at), c.name, r.origin, r.destination ORDER BY date DESC`;

  const rows = await db.execute(baseQuery) as any;
  const rowsArray = Array.isArray(rows) ? rows : [];

  const totalTickets = rowsArray.reduce((s: number, r: any) => s + r.ticket_count, 0);
  const totalRevenue = rowsArray.reduce((s: number, r: any) => s + r.revenue, 0);

  res.json({
    from, to, totalTickets, totalRevenue,
    rows: rowsArray.map((r: any) => ({
      date: r.date, companyName: r.company_name,
      origin: r.origin, destination: r.destination,
      ticketCount: r.ticket_count, revenue: r.revenue,
    })),
  });
});

export default router;
