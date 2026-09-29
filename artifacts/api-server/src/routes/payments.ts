import { Router, type IRouter } from "express";
import { eq, and, ne, sql } from "drizzle-orm";
import { db, seatsTable, ticketsTable, tripsTable, hotelsTable, hotelBookingsTable } from "@workspace/db";
import { InitiatePaymentBody, PaydunyaWebhookBody } from "@workspace/api-zod";
import { generateQrCode } from "../lib/qr";
import { logger } from "../lib/logger";
import { releaseExpiredReservations } from "../lib/seat-reservations";
import { computeAvailableRooms } from "../lib/hotel-availability";
import {
  getPaydunyaConfig,
  createCheckoutInvoice,
  confirmCheckoutInvoice,
  isPaydunyaHashValid,
  PaydunyaConfigError,
  type ConfirmedInvoice,
} from "../lib/paydunya";

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

/**
 * Starts an online ticket purchase:
 * 1. holds the seat (atomically, so two buyers can't both get it) and creates a "pending" ticket,
 * 2. creates a PayDunya invoice for the trip price read from the database (never from the client),
 * 3. returns the PayDunya page URL; the ticket only becomes "paid" through the webhook below.
 */
router.post("/payments/initiate", async (req, res): Promise<void> => {
  const body = InitiatePaymentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  let config;
  try {
    config = getPaydunyaConfig();
  } catch (err) {
    if (err instanceof PaydunyaConfigError) {
      req.log.error({ reason: err.message }, "Online payment requested but PayDunya is not configured");
      res.status(503).json({ error: "Le paiement en ligne est momentanément indisponible" });
      return;
    }
    throw err;
  }

  const { seatId, passengerName, passengerPhone, paymentMethod } = body.data;

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seatId)).limit(1);
  if (!seat) { res.status(404).json({ error: "Siège non trouvé" }); return; }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, seat.tripId)).limit(1);
  if (!trip || trip.status !== "active") { res.status(404).json({ error: "Trajet non trouvé" }); return; }

  // FCFA has no subunit: the invoiced amount is an integer, and it is exactly what the ticket records
  const amount = Math.round(parseFloat(trip.price));
  if (!Number.isFinite(amount) || amount <= 0) { res.status(409).json({ error: "Prix du trajet invalide" }); return; }

  await releaseExpiredReservations(seat.tripId);

  const ticket = await db.transaction(async (tx) => {
    // Claim the seat only if it's free, or held by this same user's unfinished purchase (retry after cancel)
    const [claimed] = await tx
      .update(seatsTable)
      .set({ status: "reserved", reservedAt: new Date(), passengerName, passengerPhone })
      .where(and(
        eq(seatsTable.id, seatId),
        sql`(${seatsTable.status} = 'available' OR (${seatsTable.status} = 'reserved' AND EXISTS (
          SELECT 1 FROM tickets t WHERE t.seat_id = ${seatId} AND t.user_id = ${userId} AND t.payment_status = 'pending'
        )))`,
      ))
      .returning();
    if (!claimed) return null;

    // A retry supersedes the user's previous unfinished purchase of this seat
    await tx
      .update(ticketsTable)
      .set({ paymentStatus: "failed" })
      .where(and(eq(ticketsTable.seatId, seatId), eq(ticketsTable.userId, userId), eq(ticketsTable.paymentStatus, "pending")));

    const [created] = await tx.insert(ticketsTable).values({
      tripId: seat.tripId,
      seatId: seat.id,
      userId,
      passengerName,
      passengerPhone,
      price: String(amount),
      qrCode: "",
      paymentMethod, // what the customer intends to use; the actual method is chosen on the PayDunya page
      paymentStatus: "pending",
    }).returning();
    return created;
  });

  if (!ticket) { res.status(409).json({ error: "Ce siège n'est plus disponible" }); return; }

  let invoice: { token: string; url: string };
  try {
    invoice = await createCheckoutInvoice(config, {
      amount,
      description: `Billet de bus ${trip.departureDate} ${trip.departureTime} – siège ${seat.seatNumber}`,
      itemName: `Billet siège ${seat.seatNumber}`,
      customer: { name: passengerName, phone: passengerPhone },
      customData: { ticket_id: ticket.id, seat_id: seat.id, trip_id: trip.id },
      returnUrl: `${config.appPublicUrl}/payment/return?ticketId=${ticket.id}`,
      cancelUrl: `${config.appPublicUrl}/payment/return?ticketId=${ticket.id}&cancelled=1`,
      callbackUrl: `${config.appPublicUrl}/api/payments/paydunya-webhook`,
    });
  } catch (err) {
    // No invoice: undo the hold right away instead of blocking the seat for 10 minutes
    req.log.error({ err, ticketId: ticket.id }, "PayDunya invoice creation failed");
    await db.update(ticketsTable).set({ paymentStatus: "failed" }).where(eq(ticketsTable.id, ticket.id));
    await db
      .update(seatsTable)
      .set({ status: "available", reservedAt: null, passengerName: null, passengerPhone: null })
      .where(and(eq(seatsTable.id, seat.id), eq(seatsTable.status, "reserved")));
    res.status(502).json({ error: "Le service de paiement est momentanément indisponible, réessayez dans quelques instants" });
    return;
  }

  await db.update(ticketsTable).set({ paymentId: invoice.token }).where(eq(ticketsTable.id, ticket.id));

  res.json({ paymentId: invoice.token, amount, status: "pending", redirectUrl: invoice.url, ticketId: ticket.id });
});

/** Applies the state PayDunya confirmed (server-to-server) to the ticket and its seat. Idempotent. */
async function applyPaymentOutcome(ticketId: number, invoice: ConfirmedInvoice): Promise<string> {
  return db.transaction(async (tx) => {
    const [ticket] = await tx.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId)).for("update");
    if (!ticket) return "unknown_ticket";

    if (invoice.status === "pending") return ticket.paymentStatus;

    if (invoice.status === "cancelled" || invoice.status === "failed") {
      if (ticket.paymentStatus !== "pending") return ticket.paymentStatus; // never undo a paid ticket
      await tx.update(ticketsTable).set({ paymentStatus: "failed" }).where(eq(ticketsTable.id, ticket.id));
      // Free the seat now, unless another purchase is in progress on it
      await tx.execute(sql`
        UPDATE seats SET status = 'available', reserved_at = NULL, passenger_name = NULL, passenger_phone = NULL
        WHERE id = ${ticket.seatId} AND status = 'reserved'
          AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.seat_id = ${ticket.seatId} AND t.payment_status = 'pending' AND t.id <> ${ticket.id})
      `);
      return "failed";
    }

    // completed
    if (ticket.paymentStatus === "paid" || ticket.paymentStatus === "refund_required") return ticket.paymentStatus;

    if (Math.round(invoice.totalAmount) !== Math.round(parseFloat(ticket.price))) {
      logger.error({ ticketId, paid: invoice.totalAmount, expected: ticket.price }, "PayDunya amount does not match the ticket price");
      await tx.update(ticketsTable).set({ paymentStatus: "refund_required" }).where(eq(ticketsTable.id, ticket.id));
      return "refund_required";
    }

    const [seat] = await tx.select().from(seatsTable).where(eq(seatsTable.id, ticket.seatId)).for("update");
    if (!seat || seat.status === "sold") {
      // Paid after the hold expired and someone else bought the seat meanwhile: money must be returned
      logger.error({ ticketId, seatId: ticket.seatId }, "Payment completed but the seat was already sold: refund required");
      await tx.update(ticketsTable).set({ paymentStatus: "refund_required" }).where(eq(ticketsTable.id, ticket.id));
      return "refund_required";
    }

    await tx
      .update(seatsTable)
      .set({ status: "sold", reservedAt: null, passengerName: ticket.passengerName, passengerPhone: ticket.passengerPhone })
      .where(eq(seatsTable.id, seat.id));
    // Anyone else still paying for this seat will get "refund_required" if their payment completes
    await tx
      .update(ticketsTable)
      .set({ paymentStatus: "expired" })
      .where(and(eq(ticketsTable.seatId, seat.id), eq(ticketsTable.paymentStatus, "pending"), ne(ticketsTable.id, ticket.id)));

    const qrCode = await generateQrCode(JSON.stringify({ ticketId: ticket.id, paymentId: ticket.paymentId }));
    await tx.update(ticketsTable).set({ paymentStatus: "paid", qrCode }).where(eq(ticketsTable.id, ticket.id));
    return "paid";
  });
}

/** Same as applyPaymentOutcome, for a hotel booking. Rooms are not held while paying, so they are re-checked here. */
async function applyHotelPaymentOutcome(bookingId: number, invoice: ConfirmedInvoice): Promise<string> {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.id, bookingId)).for("update");
    if (!booking) return "unknown_booking";

    if (invoice.status === "pending") return booking.paymentStatus;

    if (invoice.status === "cancelled" || invoice.status === "failed") {
      if (booking.paymentStatus !== "pending") return booking.paymentStatus; // never undo a paid booking
      await tx.update(hotelBookingsTable).set({ paymentStatus: "failed" }).where(eq(hotelBookingsTable.id, booking.id));
      return "failed";
    }

    // completed
    if (booking.paymentStatus === "paid" || booking.paymentStatus === "refund_required") return booking.paymentStatus;

    if (Math.round(invoice.totalAmount) !== Math.round(parseFloat(booking.totalPrice))) {
      logger.error({ bookingId, paid: invoice.totalAmount, expected: booking.totalPrice }, "PayDunya amount does not match the hotel booking price");
      await tx.update(hotelBookingsTable).set({ paymentStatus: "refund_required" }).where(eq(hotelBookingsTable.id, booking.id));
      return "refund_required";
    }

    // Lock the hotel so two payments completing at the same time can't both take the last rooms
    const [hotel] = await tx.select().from(hotelsTable).where(eq(hotelsTable.id, booking.hotelId)).for("update");
    const free = hotel
      ? await computeAvailableRooms(hotel.id, hotel.totalRooms, booking.checkInDate, booking.checkOutDate, { excludeBookingId: booking.id, executor: tx })
      : 0;
    if (free < booking.rooms) {
      logger.error({ bookingId, free, wanted: booking.rooms }, "Hotel payment completed but the rooms are no longer free: refund required");
      await tx.update(hotelBookingsTable).set({ paymentStatus: "refund_required" }).where(eq(hotelBookingsTable.id, booking.id));
      return "refund_required";
    }

    const qrCode = await generateQrCode(JSON.stringify({ bookingId: booking.id, paymentId: booking.paymentId }));
    await tx.update(hotelBookingsTable).set({ paymentStatus: "paid", qrCode }).where(eq(hotelBookingsTable.id, booking.id));
    return "paid";
  });
}

/**
 * PayDunya IPN (callback_url), shared by bus tickets and hotel bookings (the invoice token tells which). Public: PayDunya calls it without a session cookie.
 * The notification itself is never trusted: only the invoice token is taken from it, and the real
 * state is fetched from PayDunya (confirm) before anything changes. A forged call can at most make
 * us re-check a genuine invoice.
 * Format (docs): POST application/x-www-form-urlencoded, field "data" = the confirm object
 * ({ status, hash, invoice: { token, total_amount }, custom_data, ... }).
 */
router.post("/payments/paydunya-webhook", async (req, res): Promise<void> => {
  let data: any = req.body?.data ?? req.body;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  const parsed = PaydunyaWebhookBody.safeParse({ data });
  const token = parsed.success ? (parsed.data.data.invoice as { token?: unknown } | undefined)?.token : undefined;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(token)) {
    res.status(400).json({ error: "Notification invalide" });
    return;
  }

  let config;
  try {
    config = getPaydunyaConfig();
  } catch (err) {
    req.log.error({ reason: (err as Error).message }, "PayDunya webhook received but PayDunya is not configured");
    res.status(503).json({ error: "Paiement en ligne non configuré" });
    return;
  }

  // Extra signal only: the confirm() call below is what we rely on
  if (!isPaydunyaHashValid(config, data?.hash)) {
    req.log.warn({ token }, "PayDunya webhook hash missing or invalid (still verified through confirm)");
  }

  // Invoice tokens are unique: the token belongs either to a bus ticket or to a hotel booking
  const [ticket] = await db.select({ id: ticketsTable.id }).from(ticketsTable).where(eq(ticketsTable.paymentId, token)).limit(1);
  const [hotelBooking] = ticket
    ? []
    : await db.select({ id: hotelBookingsTable.id }).from(hotelBookingsTable).where(eq(hotelBookingsTable.paymentId, token)).limit(1);
  if (!ticket && !hotelBooking) { res.status(404).json({ error: "Facture inconnue" }); return; }

  let invoice: ConfirmedInvoice;
  try {
    invoice = await confirmCheckoutInvoice(config, token);
  } catch (err) {
    // 5xx so PayDunya retries later
    req.log.error({ err, token }, "PayDunya confirm failed");
    res.status(502).json({ error: "Vérification du paiement impossible pour le moment" });
    return;
  }
  if (invoice.token !== token) { res.status(400).json({ error: "Notification invalide" }); return; }

  if (ticket) {
    const status = await applyPaymentOutcome(ticket.id, invoice);
    req.log.info({ ticketId: ticket.id, invoiceStatus: invoice.status, ticketStatus: status }, "PayDunya webhook processed");
  } else {
    const status = await applyHotelPaymentOutcome(hotelBooking!.id, invoice);
    req.log.info({ hotelBookingId: hotelBooking!.id, invoiceStatus: invoice.status, bookingStatus: status }, "PayDunya webhook processed");
  }
  res.json({ success: true });
});

export default router;
