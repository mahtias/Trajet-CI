import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, tourismSpotsTable, tourismBookingsTable, paymentsTable } from "@workspace/db";
import {
  ListTourismSpotsQueryParams,
  GetTourismSpotParams,
  CreateTourismBookingBody,
} from "@workspace/api-zod";
import {
  selectTourismSpots,
  selectTourismBookings,
  formatTourismSpot,
  formatTourismBooking,
  bookedPeople,
  todayDate,
  roundPrice,
} from "../lib/agency-queries";

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

router.get("/tourism-spots", async (req, res): Promise<void> => {
  const query = ListTourismSpotsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [eq(tourismSpotsTable.isActive, true)];
  if (query.data.location) {
    conditions.push(sql`${tourismSpotsTable.location} ILIKE ${"%" + query.data.location + "%"}`);
  }

  const results = await selectTourismSpots()
    .where(and(...conditions))
    .orderBy(tourismSpotsTable.location, tourismSpotsTable.name, tourismSpotsTable.id);
  res.json(results.map(({ spot, agency }) => formatTourismSpot(spot, agency)));
});

router.get("/tourism-spots/:spotId", async (req, res): Promise<void> => {
  const params = GetTourismSpotParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [result] = await selectTourismSpots()
    .where(and(eq(tourismSpotsTable.id, params.data.spotId), eq(tourismSpotsTable.isActive, true)))
    .limit(1);
  if (!result) { res.status(404).json({ error: "Site touristique non trouvé" }); return; }

  res.json(formatTourismSpot(result.spot, result.agency));
});

router.post("/tourism-bookings", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  const body = CreateTourismBookingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { spotId, nbPeople } = body.data;
  const visitDate = body.data.visitDate.toISOString().split("T")[0];
  if (!Number.isInteger(nbPeople) || nbPeople < 1) {
    res.status(400).json({ error: "Le nombre de personnes doit être un entier positif" });
    return;
  }
  if (visitDate < todayDate()) {
    res.status(400).json({ error: "La date de visite est déjà passée" });
    return;
  }

  // Lock the spot row so concurrent bookings for the same spot are checked one at a time
  const result = await db.transaction(async (tx) => {
    const [spot] = await tx.select().from(tourismSpotsTable).where(eq(tourismSpotsTable.id, spotId)).for("update");
    if (!spot || !spot.isActive) return { ok: false, status: 404, error: "Site touristique non trouvé" } as const;

    const taken = await bookedPeople(spot.id, visitDate, tx);
    if (taken + nbPeople > spot.capacityPerDay) {
      return { ok: false, status: 409, error: `Plus que ${Math.max(0, spot.capacityPerDay - taken)} place(s) disponible(s) ce jour-là` } as const;
    }

    // Price always computed server-side
    const totalPrice = roundPrice(parseFloat(spot.price) * nbPeople);
    const [booking] = await tx.insert(tourismBookingsTable).values({
      spotId: spot.id, userId, visitDate, nbPeople, totalPrice: String(totalPrice), status: "pending",
    }).returning();
    await tx.insert(paymentsTable).values({
      bookingType: "tourism", bookingId: booking.id, userId, amount: String(totalPrice), status: "pending",
    });
    return { ok: true, booking } as const;
  });

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

  const [row] = await selectTourismBookings().where(eq(tourismBookingsTable.id, result.booking.id)).limit(1);
  res.status(201).json(formatTourismBooking(row));
});

router.get("/tourism-bookings", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.json([]); return; }

  const rows = await selectTourismBookings()
    .where(eq(tourismBookingsTable.userId, userId))
    .orderBy(desc(tourismBookingsTable.createdAt));
  res.json(rows.map(formatTourismBooking));
});

export default router;
