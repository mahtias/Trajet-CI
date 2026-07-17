import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, tripsTable, routesTable, companiesTable, seatsTable, ticketsTable } from "@workspace/db";
import {
  GetClerkTripSeatsParams,
  ClerkSellSeatParams,
  ClerkSellSeatBody,
  GetClerkPassengersParams,
  ValidateTicketParams,
} from "@workspace/api-zod";
import { generateQrCode } from "../lib/qr";

const router: IRouter = Router();

// Get today's trips for clerk
router.get("/clerk/trips", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const results = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(and(eq(tripsTable.departureDate, today), eq(tripsTable.status, "active")));

  const trips = await Promise.all(
    results.map(async ({ trip, route, company }) => {
      const seatCounts = await db
        .select({ status: seatsTable.status, count: sql<number>`count(*)::int` })
        .from(seatsTable)
        .where(eq(seatsTable.tripId, trip.id))
        .groupBy(seatsTable.status);

      const availableSeats = seatCounts.find(r => r.status === "available")?.count ?? 0;
      const totalSeats = seatCounts.reduce((s, r) => s + r.count, 0);

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

// Real-time seat map for clerk
router.get("/clerk/trips/:tripId/seats", async (req, res): Promise<void> => {
  const params = GetClerkTripSeatsParams.safeParse(req.params);
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

// Manually sell a seat (cash at station)
router.post("/clerk/seats/:seatId/sell", async (req, res): Promise<void> => {
  const params = ClerkSellSeatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ClerkSellSeatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, params.data.seatId)).limit(1);
  if (!seat) {
    res.status(404).json({ error: "Siège non trouvé" });
    return;
  }

  if (seat.status === "sold") {
    res.status(409).json({ error: "Ce siège est déjà vendu" });
    return;
  }

  const [trip] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, seat.tripId))
    .limit(1);

  const paymentId = `CASH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const qrCode = await generateQrCode(JSON.stringify({ seatId: seat.id, tripId: seat.tripId, paymentId }));

  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      tripId: seat.tripId,
      seatId: seat.id,
      userId: null,
      passengerName: body.data.passengerName,
      passengerPhone: body.data.passengerPhone,
      price: trip?.trip.price ?? "0",
      qrCode,
      paymentStatus: "paid",
      paymentId,
    })
    .returning();

  await db
    .update(seatsTable)
    .set({ status: "sold", passengerName: body.data.passengerName, passengerPhone: body.data.passengerPhone })
    .where(eq(seatsTable.id, params.data.seatId));

  res.json({
    id: ticket.id,
    tripId: ticket.tripId,
    seatNumber: seat.seatNumber,
    passengerName: ticket.passengerName,
    passengerPhone: ticket.passengerPhone,
    origin: trip?.route.origin ?? "",
    destination: trip?.route.destination ?? "",
    departureDate: trip?.trip.departureDate ?? "",
    departureTime: trip?.trip.departureTime ?? "",
    companyName: trip?.company.name ?? "",
    price: parseFloat(ticket.price),
    qrCode: ticket.qrCode,
    paymentStatus: ticket.paymentStatus,
    validated: ticket.validated,
    createdAt: ticket.createdAt.toISOString(),
  });
});

// Passenger list for a trip
router.get("/clerk/trips/:tripId/passengers", async (req, res): Promise<void> => {
  const params = GetClerkPassengersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  if (ticket.paymentStatus !== "paid") {
    const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, ticket.seatId)).limit(1);
    const [tripData] = await db
      .select({ trip: tripsTable, route: routesTable, company: companiesTable })
      .from(tripsTable)
      .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
      .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
      .where(eq(tripsTable.id, ticket.tripId))
      .limit(1);

    return res.json({
      valid: false,
      message: "Paiement non confirmé",
      ticket: {
        id: ticket.id, tripId: ticket.tripId,
        seatNumber: seat?.seatNumber ?? 0,
        passengerName: ticket.passengerName, passengerPhone: ticket.passengerPhone,
        origin: tripData?.route.origin ?? "", destination: tripData?.route.destination ?? "",
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
  const [tripData] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, updated.tripId))
    .limit(1);

  res.json({
    valid: true,
    message: null,
    ticket: {
      id: updated.id, tripId: updated.tripId,
      seatNumber: seat?.seatNumber ?? 0,
      passengerName: updated.passengerName, passengerPhone: updated.passengerPhone,
      origin: tripData?.route.origin ?? "", destination: tripData?.route.destination ?? "",
      departureDate: tripData?.trip.departureDate ?? "", departureTime: tripData?.trip.departureTime ?? "",
      companyName: tripData?.company.name ?? "",
      price: parseFloat(updated.price), qrCode: updated.qrCode,
      paymentStatus: updated.paymentStatus, validated: updated.validated,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

export default router;
