import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ticketsTable, tripsTable, routesTable, companiesTable, seatsTable } from "@workspace/db";
import {
  GetTicketParams,
  CancelTicketParams,
} from "@workspace/api-zod";

const SAME_DAY_FEE_PERCENT = 25;
const ADVANCE_FEE_PERCENT = 5;

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

async function buildTicket(ticket: any) {
  const [tripData] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, ticket.tripId))
    .limit(1);

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, ticket.seatId)).limit(1);

  return {
    id: ticket.id,
    tripId: ticket.tripId,
    seatNumber: seat?.seatNumber ?? 0,
    passengerName: ticket.passengerName,
    passengerPhone: ticket.passengerPhone,
    origin: tripData?.route.origin ?? "",
    destination: tripData?.route.destination ?? "",
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

router.get("/tickets/:ticketId", async (req, res): Promise<void> => {
  const params = GetTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.ticketId)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket non trouvé" });
    return;
  }

  res.json(await buildTicket(ticket));
});

router.post("/tickets/:ticketId/cancel", async (req, res): Promise<void> => {
  const params = CancelTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = getSession(req);
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, params.data.ticketId)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Billet non trouvé" });
    return;
  }
  if (!userId || ticket.userId !== userId) {
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
