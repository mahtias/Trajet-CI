import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ticketsTable, tripsTable, seatsTable } from "@workspace/db";
import {
  GetTicketParams,
  CancelTicketParams,
  GetTicketPaymentStatusParams,
} from "@workspace/api-zod";
import { releaseExpiredReservations } from "../lib/seat-reservations";
import { getTripDetails, routeLabels } from "../lib/trip-queries";

const SAME_DAY_FEE_PERCENT = 25;
const ADVANCE_FEE_PERCENT = 5;

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
    qrCode: ticket.qrCode,
    paymentMethod: ticket.paymentMethod,
    paymentStatus: ticket.paymentStatus,
    validated: ticket.validated,
    cancelledAt: ticket.cancelledAt ? ticket.cancelledAt.toISOString() : null,
    refundAmount: ticket.refundAmount !== null && ticket.refundAmount !== undefined ? parseFloat(ticket.refundAmount) : null,
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

  const feePercent = hoursUntilDeparture >= 24 ? ADVANCE_FEE_PERCENT : SAME_DAY_FEE_PERCENT;
  const price = parseFloat(ticket.price);
  const refundAmount = Math.round(price * (1 - feePercent / 100) * 100) / 100;

  await db
    .update(ticketsTable)
    .set({ cancelledAt: new Date(), refundAmount: String(refundAmount) })
    .where(eq(ticketsTable.id, ticket.id));

  await db
    .update(seatsTable)
    .set({ status: "available", reservedAt: null, passengerName: null, passengerPhone: null })
    .where(eq(seatsTable.id, ticket.seatId));

  res.json({ success: true, refundAmount, feePercent });
});

export default router;
