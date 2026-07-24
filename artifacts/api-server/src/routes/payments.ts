import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, seatsTable, ticketsTable, tripsTable, routesTable, companiesTable } from "@workspace/db";
import {
  InitiatePaymentBody,
  PaymentCallbackBody,
} from "@workspace/api-zod";
import { generateQrCode } from "../lib/qr";

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

router.post("/payments/initiate", async (req, res): Promise<void> => {
  const body = InitiatePaymentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { seatId, passengerName, passengerPhone, paymentMethod } = body.data;

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, seatId)).limit(1);
  if (!seat) {
    res.status(404).json({ error: "Siège non trouvé" });
    return;
  }

  if (seat.status === "sold") {
    res.status(409).json({ error: "Ce siège est déjà vendu" });
    return;
  }

  const [tripData] = await db
    .select({ trip: tripsTable, route: routesTable, company: companiesTable })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .where(eq(tripsTable.id, seat.tripId))
    .limit(1);

  if (!tripData) {
    res.status(404).json({ error: "Trajet non trouvé" });
    return;
  }

  const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { userId } = getSession(req);

  // Reserve the seat immediately during payment initiation
  await db
    .update(seatsTable)
    .set({ status: "reserved", reservedAt: new Date(), passengerName, passengerPhone })
    .where(eq(seatsTable.id, seatId));

  // Create a pending ticket
  const qrCode = await generateQrCode(paymentId);
  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      tripId: seat.tripId,
      seatId: seat.id,
      userId: userId ?? null,
      passengerName,
      passengerPhone,
      price: tripData.trip.price,
      qrCode,
      paymentMethod,
      paymentStatus: "pending",
      paymentId,
    })
    .returning();

  res.json({
    paymentId,
    amount: parseFloat(tripData.trip.price),
    status: "pending",
    redirectUrl: null,
    ticketId: ticket.id,
  });
});

router.post("/payments/callback", async (req, res): Promise<void> => {
  const body = PaymentCallbackBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { paymentId, status } = body.data;

  if (status !== "success") {
    // Release seat on failure
    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.paymentId, paymentId)).limit(1);
    if (ticket) {
      await db.update(seatsTable).set({ status: "available", reservedAt: null }).where(eq(seatsTable.id, ticket.seatId));
      await db.delete(ticketsTable).where(eq(ticketsTable.paymentId, paymentId));
    }
    res.json({ success: false });
    return;
  }

  // Mark seat as sold
  const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.paymentId, paymentId)).limit(1);
  if (!ticket) {
    res.status(404).json({ error: "Ticket non trouvé" });
    return;
  }

  // Generate final QR code with ticket ID
  const qrCode = await generateQrCode(JSON.stringify({ ticketId: ticket.id, paymentId }));

  await db.update(ticketsTable).set({ paymentStatus: "paid", qrCode }).where(eq(ticketsTable.paymentId, paymentId));
  await db.update(seatsTable).set({ status: "sold" }).where(eq(seatsTable.id, ticket.seatId));

  res.json({ success: true });
});

export default router;
