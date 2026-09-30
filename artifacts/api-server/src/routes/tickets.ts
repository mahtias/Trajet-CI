import { Router, type IRouter } from "express";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db, ticketsTable, tripsTable, seatsTable } from "@workspace/db";
import {
  GetTicketParams,
  CancelTicketParams,
  GetTicketPaymentStatusParams,
} from "@workspace/api-zod";
import { releaseExpiredReservations } from "../lib/seat-reservations";
import { getTripDetails, routeLabels } from "../lib/trip-queries";
import { refundableBase, cancellationFeePercent, afterCancellationFee } from "../lib/pricing";
import { initialRefundState, startRefund } from "../lib/refunds";

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

async function buildTicket(ticket: any) {
  const tripData = await getTripDetails(ticket.tripId);

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, ticket.seatId)).limit(1);

  return {
    id: ticket.id,
    tripId: ticket.tripId,
    seatNumber: seat?.seatNumber ?? 0,
    passengerName: ticket.passengerName,
    passengerPhone: ticket.passengerPhone,
    origin: tripData ? routeLabels(tripData).origin : "",
    destination: tripData ? routeLabels(tripData).destination : "",
    departureDate: tripData?.trip.departureDate ?? "",
    departureTime: tripData?.trip.departureTime ?? "",
    companyName: tripData?.company.name ?? "",
    price: parseFloat(ticket.price),
    farePrice: ticket.farePrice !== null && ticket.farePrice !== undefined ? parseFloat(ticket.farePrice) : null,
    // What was paid on top of the fare and seat fee: 0 on tickets from when the commission was deducted
    serviceFee: ticket.farePrice !== null && ticket.farePrice !== undefined
      ? Math.round(parseFloat(ticket.price) - parseFloat(ticket.farePrice) - parseFloat(ticket.seatSelectionFeePaid ?? "0"))
      : null,
    seatSelectionFeePaid: ticket.seatSelectionFeePaid !== null && ticket.seatSelectionFeePaid !== undefined ? parseFloat(ticket.seatSelectionFeePaid) : null,
    qrCode: ticket.qrCode,
    paymentMethod: ticket.paymentMethod,
    paymentStatus: ticket.paymentStatus,
    validated: ticket.validated,
    cancelledAt: ticket.cancelledAt ? ticket.cancelledAt.toISOString() : null,
    refundAmount: ticket.refundAmount !== null && ticket.refundAmount !== undefined ? parseFloat(ticket.refundAmount) : null,
    refundStatus: ticket.refundStatus,
    createdAt: ticket.createdAt.toISOString(),
  };
}

router.get("/tickets", async (req, res): Promise<void> => {
  const { userId } = getSession(req);

  let tickets;
  if (userId) {
    tickets = await db.select().from(ticketsTable).where(eq(ticketsTable.userId, userId));
  } else {
    // Return empty list for unauthenticated users
    res.json([]);
    return;
  }

  const result = await Promise.all(tickets.map(buildTicket));
  res.json(result);
});

// Passenger data (name, phone, trip): only the ticket's owner may read it.
// Same order as the other routes of this file: 401 (not logged in) → 404 (unknown) → 403 (someone else's).
router.get("/tickets/:ticketId", async (req, res): Promise<void> => {
  const params = GetTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.ticketId)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket non trouvé" });
    return;
  }
  if (ticket.userId !== userId) { res.status(403).json({ error: "Ce billet ne vous appartient pas" }); return; }

  res.json(await buildTicket(ticket));
});

// Polled by the page the customer lands on after PayDunya. Read-only: only the webhook marks a ticket paid.
router.get("/tickets/:ticketId/payment-status", async (req, res): Promise<void> => {
  const params = GetTicketPaymentStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  const [found] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.ticketId)).limit(1);
  if (!found) { res.status(404).json({ error: "Billet non trouvé" }); return; }
  if (found.userId !== userId) { res.status(403).json({ error: "Ce billet ne vous appartient pas" }); return; }

  // A purchase that never completed turns "expired" here instead of staying "pending" forever
  await releaseExpiredReservations(found.tripId);
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, found.id)).limit(1);

  res.json({ ticketId: ticket.id, paymentStatus: ticket.paymentStatus });
});

router.post("/tickets/:ticketId/cancel", async (req, res): Promise<void> => {
  const params = CancelTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.ticketId)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Billet non trouvé" });
    return;
  }
  if (ticket.userId !== userId) {
    res.status(403).json({ error: "Ce billet ne vous appartient pas" });
    return;
  }
  if (ticket.paymentStatus !== "paid") {
    res.status(400).json({ error: "Ce billet n'est pas payé" });
    return;
  }
  if (ticket.validated) {
    res.status(400).json({ error: "Ce billet a déjà été utilisé à l'embarquement" });
    return;
  }
  if (ticket.cancelledAt) {
    res.status(400).json({ error: "Ce billet est déjà annulé" });
    return;
  }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, ticket.tripId)).limit(1);
  if (!trip) {
    res.status(404).json({ error: "Trajet non trouvé" });
    return;
  }

  const departureAt = new Date(`${trip.departureDate}T${trip.departureTime}`);
  const hoursUntilDeparture = (departureAt.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilDeparture <= 0) {
    res.status(400).json({ error: "Ce voyage a déjà eu lieu" });
    return;
  }

  // One fee tier for the whole cancellation: the passenger's refund and the company's share taken back.
  // The percentage applies to fare + seat selection fee only: the service fee is never refunded.
  const feePercent = cancellationFeePercent(hoursUntilDeparture);
  const refundAmount = afterCancellationFee(refundableBase(ticket), feePercent);
  const refund = await initialRefundState(ticket, refundAmount);

  const cancelled = await db.transaction(async (tx) => {
    // Only the first cancellation goes through (two clicks at once can't refund twice)
    const [row] = await tx
      .update(ticketsTable)
      .set({ cancelledAt: new Date(), cancellationFeePercent: String(feePercent), refundAmount: String(refundAmount), refundStatus: refund.status, refundError: refund.error })
      .where(and(eq(ticketsTable.id, ticket.id), isNull(ticketsTable.cancelledAt)))
      .returning();
    if (!row) return null;

    // The company was already paid its share for this ticket: take it back from its next transfers,
    // minus the same cancellation fee percentage as the passenger (the company keeps that part)
    if (row.companyPayoutStatus === "success") {
      const takenBack = afterCancellationFee(parseFloat(row.companyPayoutAmount ?? "0"), feePercent);
      await tx.execute(sql`
        UPDATE companies SET pending_clawback = pending_clawback + ${takenBack}
        WHERE id = (SELECT r.company_id FROM trips tr JOIN routes r ON r.id = tr.route_id WHERE tr.id = ${row.tripId})
      `);
    }

    await tx
      .update(seatsTable)
      .set({ status: "available", reservedAt: null, passengerName: null, passengerPhone: null })
      .where(eq(seatsTable.id, row.seatId));
    return row;
  });
  if (!cancelled) {
    res.status(400).json({ error: "Ce billet est déjà annulé" });
    return;
  }

  // The ticket is cancelled whatever happens next; the answer tells the real state of the refund
  const refundStatus = refund.status === "created" ? await startRefund(ticket.id) : refund.status;
  res.json({ success: true, refundAmount, feePercent, refundStatus });
});

export default router;
