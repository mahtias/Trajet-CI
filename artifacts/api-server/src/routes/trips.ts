import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, tripsTable, citiesTable, seatsTable, companiesTable } from "@workspace/db";
import {
  GetTripParams,
  GetTripSeatsParams,
  GetTripPricingParams,
  GetTripLocationParams,
} from "@workspace/api-zod";
import { z } from "zod";
import { getUserById, getTrackingAccess, getLastLocation, formatTripLocation } from "../lib/trip-tracking";
import {
  selectTrips,
  getTripDetails,
  getSeatCounts,
  formatTripSummary,
  formatTripDetail,
  originStation,
  destinationStation,
} from "../lib/trip-queries";
import { releaseExpiredReservations } from "../lib/seat-reservations";
import { computePriceBreakdown, getPricingSettings } from "../lib/pricing";

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
        // A suspended company never shows up in the search, whatever the state of its trips
        eq(companiesTable.status, "active"),
      )
    )
    .orderBy(tripsTable.departureTime, tripsTable.id);

  // Expire stale online purchases and free their seats
  await releaseExpiredReservations();

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

// What the customer will pay (online, or cash at the counter), for the summary before payment.
// Display only: /payments/initiate and the counter sale recompute it.
router.get("/trips/:tripId/pricing", async (req, res): Promise<void> => {
  const params = GetTripPricingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [trip] = await db.select({ id: tripsTable.id, price: tripsTable.price }).from(tripsTable).where(eq(tripsTable.id, params.data.tripId)).limit(1);
  if (!trip) { res.status(404).json({ error: "Trajet non trouvé" }); return; }

  const settings = await getPricingSettings();
  const pricing = computePriceBreakdown(parseFloat(trip.price), false, settings);
  res.json({
    tripId: trip.id,
    farePrice: pricing.farePrice,
    platformCommission: pricing.platformCommission,
    seatSelectionFee: Math.round(settings.seatSelectionFee),
    totalPrice: pricing.totalPrice,
  });
});

router.get("/trips/:tripId/seats", async (req, res): Promise<void> => {
  const params = GetTripSeatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Expire stale online purchases and free their seats
  await releaseExpiredReservations(params.data.tripId);

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

// First display for the tracking page; live updates then come through Socket.io (lib/socket.ts)
router.get("/trips/:tripId/location", async (req, res): Promise<void> => {
  const params = GetTripLocationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const userId = (req.session as { userId?: number }).userId;
  const user = userId ? await getUserById(userId) : undefined;
  if (!user) { res.status(401).json({ error: "Authentification requise" }); return; }

  if (!(await getTrackingAccess(user, params.data.tripId))) {
    res.status(403).json({ error: "Vous n'avez pas de billet payé pour ce voyage" });
    return;
  }

  const location = await getLastLocation(params.data.tripId);
  if (!location) { res.status(404).json({ error: "Le chauffeur n'a pas encore démarré le partage de position" }); return; }

  res.json(formatTripLocation(location));
});

export default router;
