import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, tripsTable, citiesTable, seatsTable } from "@workspace/db";
import {
  GetTripParams,
  GetTripSeatsParams,
} from "@workspace/api-zod";
import { z } from "zod";
import {
  selectTrips,
  getTripDetails,
  getSeatCounts,
  formatTripSummary,
  formatTripDetail,
  originStation,
  destinationStation,
} from "../lib/trip-queries";

// Generated SearchTripsQueryParams expects a Date for `date`; query strings need the YYYY-MM-DD form.
const SearchQuery = z.object({
  originCityId: z.coerce.number().int().positive(),
  destinationCityId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const router: IRouter = Router();

router.get("/cities", async (_req, res): Promise<void> => {
  const cities = await db.select().from(citiesTable).orderBy(citiesTable.name);
  res.json(cities.map((c) => ({ id: c.id, name: c.name })));
});

router.get("/trips/search", async (req, res): Promise<void> => {
  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { originCityId, destinationCityId, date } = parsed.data;

  const results = await selectTrips()
    .where(
      and(
        eq(originStation.cityId, originCityId),
        eq(destinationStation.cityId, destinationCityId),
        eq(tripsTable.departureDate, date),
        eq(tripsTable.status, "active"),
      )
    )
    .orderBy(tripsTable.departureTime, tripsTable.id);

  // Auto-release expired reservations (older than 10 min)
  await db.execute(
    sql`UPDATE seats SET status = 'available', reserved_at = NULL, passenger_name = NULL, passenger_phone = NULL
        WHERE status = 'reserved' AND reserved_at < NOW() - INTERVAL '10 minutes'`
  );

  const trips = await Promise.all(
    results.map(async (row) => {
      const { availableSeats } = await getSeatCounts(row.trip.id);
      return formatTripSummary(row, availableSeats);
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

  const result = await getTripDetails(params.data.tripId);
  if (!result) {
    res.status(404).json({ error: "Trajet non trouvé" });
    return;
  }

  const { totalSeats, availableSeats } = await getSeatCounts(params.data.tripId);
  res.json(formatTripDetail(result, availableSeats, totalSeats));
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
