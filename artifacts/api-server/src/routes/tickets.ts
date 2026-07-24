import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, ticketsTable, tripsTable, routesTable, companiesTable, seatsTable } from "@workspace/db";
import {
  GetTicketParams,
} from "@workspace/api-zod";

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

export default router;
