import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, seatsTable } from "@workspace/db";
import {
  ReserveSeatParams,
  ReserveSeatBody,
  ReleaseSeatParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/seats/:seatId/reserve", async (req, res): Promise<void> => {
  const params = ReserveSeatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ReserveSeatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, params.data.seatId)).limit(1);
  if (!seat) {
    res.status(404).json({ error: "Siège non trouvé" });
    return;
  }

  if (seat.status !== "available") {
    res.status(409).json({ error: "Ce siège n'est plus disponible" });
    return;
  }

  const [updated] = await db
    .update(seatsTable)
    .set({
      status: "reserved",
      reservedAt: new Date(),
      passengerName: body.data.passengerName,
      passengerPhone: body.data.passengerPhone,
    })
    .where(eq(seatsTable.id, params.data.seatId))
    .returning();

  res.json({
    id: updated.id,
    tripId: updated.tripId,
    seatNumber: updated.seatNumber,
    status: updated.status,
    reservedAt: updated.reservedAt?.toISOString() ?? null,
    passengerName: updated.passengerName,
  });
});

router.delete("/seats/:seatId/reserve", async (req, res): Promise<void> => {
  const params = ReleaseSeatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [seat] = await db.select().from(seatsTable).where(eq(seatsTable.id, params.data.seatId)).limit(1);
  if (!seat) {
    res.status(404).json({ error: "Siège non trouvé" });
    return;
  }

  const [updated] = await db
    .update(seatsTable)
    .set({ status: "available", reservedAt: null, passengerName: null, passengerPhone: null })
    .where(eq(seatsTable.id, params.data.seatId))
    .returning();

  res.json({
    id: updated.id,
    tripId: updated.tripId,
    seatNumber: updated.seatNumber,
    status: updated.status,
    reservedAt: null,
    passengerName: null,
  });
});

export default router;
