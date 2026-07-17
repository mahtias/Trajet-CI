import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, tripsTable, routesTable, companiesTable, seatsTable } from "@workspace/db";
import {
  GetTripParams,
  GetTripSeatsParams,
} from "@workspace/api-zod";
import { z } from "zod";

const SearchQuery = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const router: IRouter = Router();

function formatTrip(trip: any, route: any, company: any, availableSeats: number, totalSeats: number) {
  return {
    id: trip.id,
    origin: route.origin,
    destination: route.destination,
    departureDate: trip.departureDate,
    departureTime: trip.departureTime,
    price: parseFloat(trip.price),
    companyName: company.name,
    companyId: company.id,
    routeId: route.id,
    durationMinutes: route.durationMinutes,
    totalSeats,
    availableSeats,
    status: trip.status,
  };
}

router.get("/trips/search", async (req, res): Promise<void> => {
  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { origin, destination, date } = parsed.data;

  const results = await db
    .select({
      trip: tripsTable,
      route: routesTable,
      company: companiesTable,
    })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(
      and(
        sql`lower(${routesTable.origin}) = lower(${origin})`,
        sql`lower(${routesTable.destination}) = lower(${destination})`,
        eq(tripsTable.departureDate, date),
        eq(tripsTable.status, "active"),
      )
    );

  // Auto-release expired reservations (older than 10 min)
  await db.execute(
    sql`UPDATE seats SET status = 'available', reserved_at = NULL, passenger_name = NULL, passenger_phone = NULL
        WHERE status = 'reserved' AND reserved_at < NOW() - INTERVAL '10 minutes'`
  );

  const trips = await Promise.all(
    results.map(async ({ trip, route, company }) => {
      const seatCounts = await db
        .select({ status: seatsTable.status, count: sql<number>`count(*)::int` })
        .from(seatsTable)
        .where(eq(seatsTable.tripId, trip.id))
        .groupBy(seatsTable.status);

      const totalSeats = seatCounts.reduce((s, r) => s + r.count, 0);
      const availableSeats = seatCounts.find(r => r.status === "available")?.count ?? 0;

      return {
        id: trip.id,
        origin: route.origin,
        destination: route.destination,
        departureDate: trip.departureDate,
        departureTime: trip.departureTime,
        price: parseFloat(trip.price),
        companyName: company.name,
        availableSeats,
        durationMinutes: route.durationMinutes,
      };
    })
  );

  res.json(trips);
});

router.get("/trips/:tripId", async (req, res): Promise<void> => {
  const params = GetTripParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [result] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, params.data.tripId))
    .limit(1);

  if (!result) {
    res.status(404).json({ error: "Trajet non trouvé" });
    return;
  }

  const seatCounts = await db
    .select({ status: seatsTable.status, count: sql<number>`count(*)::int` })
    .from(seatsTable)
    .where(eq(seatsTable.tripId, params.data.tripId))
    .groupBy(seatsTable.status);

  const totalSeats = seatCounts.reduce((s, r) => s + r.count, 0);
  const availableSeats = seatCounts.find(r => r.status === "available")?.count ?? 0;

  res.json(formatTrip(result.trip, result.route, result.company, availableSeats, totalSeats));
});

router.get("/trips/:tripId/seats", async (req, res): Promise<void> => {
  const params = GetTripSeatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Auto-release expired reservations
  await db.execute(
    sql`UPDATE seats SET status = 'available', reserved_at = NULL, passenger_name = NULL, passenger_phone = NULL
        WHERE trip_id = ${params.data.tripId} AND status = 'reserved' AND reserved_at < NOW() - INTERVAL '10 minutes'`
  );

  const seats = await db
    .select()
    .from(seatsTable)
    .where(eq(seatsTable.tripId, params.data.tripId))
    .orderBy(seatsTable.seatNumber);

  res.json(
    seats.map((s) => ({
      id: s.id,
      tripId: s.tripId,
      seatNumber: s.seatNumber,
      status: s.status,
      reservedAt: s.reservedAt?.toISOString() ?? null,
      passengerName: s.passengerName,
    }))
  );
});

export default router;
