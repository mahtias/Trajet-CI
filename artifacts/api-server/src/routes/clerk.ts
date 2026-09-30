import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  db, tripsTable, companiesTable, seatsTable, ticketsTable,
  tourismSpotsTable, tourismBookingsTable, vehiclesTable, vehicleBookingsTable, hotelsTable, hotelBookingsTable,
  type User,
} from "@workspace/db";
import {
  GetClerkTripSeatsParams,
  GetClerkPassengersParams,
  ValidateTicketParams,
  UpdateClerkAgencyTourismBookingStatusParams,
  UpdateClerkAgencyTourismBookingStatusBody,
  UpdateClerkAgencyVehicleBookingStatusParams,
  UpdateClerkAgencyVehicleBookingStatusBody,
  UpdateClerkAgencyHotelBookingStatusParams,
  UpdateClerkAgencyHotelBookingStatusBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/require-role";
import {
  isAllowedForAgency,
  selectTourismBookings,
  selectVehicleBookings,
  formatTourismBooking,
  formatVehicleBooking,
  formatHotelBooking,
  checkStatusTransition,
  settlePendingPayment,
} from "../lib/agency-queries";
import { selectTrips, getTripDetails, getTripCompanyId, isAllowed, getSeatCounts, formatTripSummary, routeLabels } from "../lib/trip-queries";
import { releaseExpiredReservations } from "../lib/seat-reservations";

/**
 * Clerk area: a clerk never sells or collects money. The only way to buy a ticket is online, from a
 * passenger account, through PayDunya (/payments/initiate). Clerks see their company's trips and
 * passengers and validate tickets at boarding (plus agency bookings for agency clerks).
 */
const router: IRouter = Router();
// Scoped to /clerk so it doesn't also run on requests meant for routers mounted after this one
router.use("/clerk", requireRole("clerk", "admin"));

function currentUser(req: any): User {
  return req.currentUser;
}

// Get today's trips for clerk
router.get("/clerk/trips", async (req, res): Promise<void> => {
  const user = currentUser(req);
  if (user.role === "clerk" && !user.companyId) {
    res.json([]);
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const conditions = [eq(tripsTable.departureDate, today), eq(tripsTable.status, "active")];
  if (user.role === "clerk" && user.companyId) {
    conditions.push(eq(companiesTable.id, user.companyId));
  }

  const results = await selectTrips()
    .where(and(...conditions))
    .orderBy(tripsTable.departureTime, tripsTable.id);

  const trips = await Promise.all(
    results.map(async (row) => {
      const { availableSeats } = await getSeatCounts(row.trip.id);
      return formatTripSummary(row, availableSeats);
    })
  );

  res.json(trips);
});

// Real-time seat map for clerk
router.get("/clerk/trips/:tripId/seats", async (req, res): Promise<void> => {
  const params = GetClerkTripSeatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = currentUser(req);
  const tripCompanyId = await getTripCompanyId(params.data.tripId);
  if (!isAllowed(user, tripCompanyId)) {
    res.status(403).json({ error: "Ce trajet appartient à une autre compagnie" });
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

// Passenger list for a trip
router.get("/clerk/trips/:tripId/passengers", async (req, res): Promise<void> => {
  const params = GetClerkPassengersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = currentUser(req);
  const tripCompanyId = await getTripCompanyId(params.data.tripId);
  if (!isAllowed(user, tripCompanyId)) {
    res.status(403).json({ error: "Ce trajet appartient à une autre compagnie" });
    return;
  }

  const tickets = await db
    .select({ ticket: ticketsTable, seat: seatsTable })
    .from(ticketsTable)
    .innerJoin(seatsTable, eq(ticketsTable.seatId, seatsTable.id))
    .where(and(eq(ticketsTable.tripId, params.data.tripId), eq(ticketsTable.paymentStatus, "paid")));

  res.json(
    tickets.map(({ ticket, seat }) => ({
      ticketId: ticket.id,
      passengerName: ticket.passengerName,
      passengerPhone: ticket.passengerPhone,
      seatNumber: seat.seatNumber,
      paymentStatus: ticket.paymentStatus,
      validated: ticket.validated,
    }))
  );
});

// Validate a ticket (boarding)
router.post("/clerk/tickets/:ticketId/validate", async (req, res): Promise<void> => {
  const params = ValidateTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.ticketId)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket non trouvé" });
    return;
  }

  const user = currentUser(req);
  const tripCompanyId = await getTripCompanyId(ticket.tripId);
  if (!isAllowed(user, tripCompanyId)) {
    res.status(403).json({ error: "Ce billet appartient à une autre compagnie" });
    return;
  }

  if (ticket.paymentStatus !== "paid" || ticket.validated) {
    const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, ticket.seatId)).limit(1);
    const tripData = await getTripDetails(ticket.tripId);

    return res.json({
      valid: false,
      message: ticket.validated ? "Billet déjà utilisé" : "Paiement non confirmé",
      ticket: {
        id: ticket.id, tripId: ticket.tripId,
        seatNumber: seat?.seatNumber ?? 0,
        passengerName: ticket.passengerName, passengerPhone: ticket.passengerPhone,
        origin: tripData ? routeLabels(tripData).origin : "", destination: tripData ? routeLabels(tripData).destination : "",
        departureDate: tripData?.trip.departureDate ?? "", departureTime: tripData?.trip.departureTime ?? "",
        companyName: tripData?.company.name ?? "",
        price: parseFloat(ticket.price), qrCode: ticket.qrCode,
        paymentStatus: ticket.paymentStatus, validated: ticket.validated,
        createdAt: ticket.createdAt.toISOString(),
      },
    }) as any;
  }

  const [updated] = await db.update(ticketsTable).set({ validated: true }).where(eq(ticketsTable.id, params.data.ticketId)).returning();
  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, updated.seatId)).limit(1);
  const tripData = await getTripDetails(updated.tripId);

  res.json({
    valid: true,
    message: null,
    ticket: {
      id: updated.id, tripId: updated.tripId,
      seatNumber: seat?.seatNumber ?? 0,
      passengerName: updated.passengerName, passengerPhone: updated.passengerPhone,
      origin: tripData ? routeLabels(tripData).origin : "", destination: tripData ? routeLabels(tripData).destination : "",
      departureDate: tripData?.trip.departureDate ?? "", departureTime: tripData?.trip.departureTime ?? "",
      companyName: tripData?.company.name ?? "",
      price: parseFloat(updated.price), qrCode: updated.qrCode,
      paymentStatus: updated.paymentStatus, validated: updated.validated,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

// ── Agency bookings (hotel / tourism / vehicle rental) ─────────────────────────
// Agency clerks only manage bookings (confirm / cancel), never the catalog itself.

/** Agency filter for list endpoints: admins see every agency, clerks only their own; undefined = nothing to show. */
function agencyScope(user: User): { all: true } | { agencyId: number } | undefined {
  if (user.role === "admin") return { all: true };
  return user.agencyId ? { agencyId: user.agencyId } : undefined;
}

router.get("/clerk/agency/tourism-bookings", async (req, res): Promise<void> => {
  const scope = agencyScope(currentUser(req));
  if (!scope) { res.json([]); return; }

  const rows = await selectTourismBookings()
    .where("agencyId" in scope ? eq(tourismSpotsTable.agencyId, scope.agencyId) : undefined)
    .orderBy(desc(tourismBookingsTable.visitDate), desc(tourismBookingsTable.id));
  res.json(rows.map(formatTourismBooking));
});

router.put("/clerk/agency/tourism-bookings/:bookingId/status", async (req, res): Promise<void> => {
  const params = UpdateClerkAgencyTourismBookingStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateClerkAgencyTourismBookingStatusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await selectTourismBookings().where(eq(tourismBookingsTable.id, params.data.bookingId)).limit(1);
  if (!row) { res.status(404).json({ error: "Réservation non trouvée" }); return; }
  if (!isAllowedForAgency(currentUser(req), row.spot.agencyId)) {
    res.status(403).json({ error: "Cette réservation appartient à une autre agence" });
    return;
  }
  const transitionError = checkStatusTransition(row.booking.status, body.data.status);
  if (transitionError) { res.status(409).json({ error: transitionError }); return; }

  const [booking] = await db.update(tourismBookingsTable).set({ status: body.data.status }).where(eq(tourismBookingsTable.id, row.booking.id)).returning();
  await settlePendingPayment("tourism", booking.id, body.data.status);
  res.json(formatTourismBooking({ ...row, booking }));
});

router.get("/clerk/agency/vehicle-bookings", async (req, res): Promise<void> => {
  const scope = agencyScope(currentUser(req));
  if (!scope) { res.json([]); return; }

  const rows = await selectVehicleBookings()
    .where("agencyId" in scope ? eq(vehiclesTable.agencyId, scope.agencyId) : undefined)
    .orderBy(desc(vehicleBookingsTable.startDate), desc(vehicleBookingsTable.id));
  res.json(rows.map(formatVehicleBooking));
});

router.put("/clerk/agency/vehicle-bookings/:bookingId/status", async (req, res): Promise<void> => {
  const params = UpdateClerkAgencyVehicleBookingStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateClerkAgencyVehicleBookingStatusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await selectVehicleBookings().where(eq(vehicleBookingsTable.id, params.data.bookingId)).limit(1);
  if (!row) { res.status(404).json({ error: "Réservation non trouvée" }); return; }
  if (!isAllowedForAgency(currentUser(req), row.vehicle.agencyId)) {
    res.status(403).json({ error: "Cette réservation appartient à une autre agence" });
    return;
  }
  const transitionError = checkStatusTransition(row.booking.status, body.data.status);
  if (transitionError) { res.status(409).json({ error: transitionError }); return; }

  const [booking] = await db.update(vehicleBookingsTable).set({ status: body.data.status }).where(eq(vehicleBookingsTable.id, row.booking.id)).returning();
  await settlePendingPayment("vehicle", booking.id, body.data.status);
  res.json(formatVehicleBooking({ ...row, booking }));
});

router.get("/clerk/agency/hotel-bookings", async (req, res): Promise<void> => {
  const scope = agencyScope(currentUser(req));
  if (!scope) { res.json([]); return; }

  const rows = await db
    .select({ booking: hotelBookingsTable, hotel: hotelsTable })
    .from(hotelBookingsTable)
    .innerJoin(hotelsTable, eq(hotelBookingsTable.hotelId, hotelsTable.id))
    .where("agencyId" in scope ? eq(hotelsTable.agencyId, scope.agencyId) : undefined)
    .orderBy(desc(hotelBookingsTable.checkInDate), desc(hotelBookingsTable.id));
  res.json(rows.map(({ booking, hotel }) => formatHotelBooking(booking, hotel)));
});

router.put("/clerk/agency/hotel-bookings/:bookingId/status", async (req, res): Promise<void> => {
  const params = UpdateClerkAgencyHotelBookingStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = UpdateClerkAgencyHotelBookingStatusBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db
    .select({ booking: hotelBookingsTable, hotel: hotelsTable })
    .from(hotelBookingsTable)
    .innerJoin(hotelsTable, eq(hotelBookingsTable.hotelId, hotelsTable.id))
    .where(eq(hotelBookingsTable.id, params.data.bookingId))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Réservation non trouvée" }); return; }
  if (!isAllowedForAgency(currentUser(req), row.hotel.agencyId)) {
    res.status(403).json({ error: "Cette réservation appartient à une autre agence" });
    return;
  }
  const transitionError = checkStatusTransition(row.booking.status, body.data.status);
  if (transitionError) { res.status(409).json({ error: transitionError }); return; }

  // Only the booking status changes: paymentStatus stays owned by the payment flow
  const [booking] = await db.update(hotelBookingsTable).set({ status: body.data.status }).where(eq(hotelBookingsTable.id, row.booking.id)).returning();
  await settlePendingPayment("hotel", booking.id, body.data.status);
  res.json(formatHotelBooking(booking, row.hotel));
});

export default router;
