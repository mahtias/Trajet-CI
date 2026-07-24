import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, hotelsTable, hotelBookingsTable } from "@workspace/db";
import { z } from "zod";
import {
  GetHotelParams,
  InitiateHotelBookingBody,
  HotelBookingCallbackBody,
  GetHotelBookingParams,
} from "@workspace/api-zod";
import { generateQrCode } from "../lib/qr";

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

// Date query params come in as plain strings — zod.date() (what orval generates for
// `format: date` query params) rejects query strings, so this is hand-rolled like the
// admin trips/reports date filters.
const SearchHotelsQuery = z.object({
  city: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.coerce.number().int().min(1).optional(),
});

async function computeAvailableRooms(hotelId: number, totalRooms: number, checkIn: string, checkOut: string): Promise<number> {
  const [{ booked }] = await db
    .select({ booked: sql<number>`COALESCE(SUM(${hotelBookingsTable.rooms}), 0)::int` })
    .from(hotelBookingsTable)
    .where(
      and(
        eq(hotelBookingsTable.hotelId, hotelId),
        eq(hotelBookingsTable.paymentStatus, "paid"),
        sql`${hotelBookingsTable.checkInDate} < ${checkOut}`,
        sql`${hotelBookingsTable.checkOutDate} > ${checkIn}`,
      )
    );
  return Math.max(0, totalRooms - booked);
}

function formatHotel(h: typeof hotelsTable.$inferSelect) {
  return {
    id: h.id,
    name: h.name,
    city: h.city,
    address: h.address,
    description: h.description,
    pricePerNight: parseFloat(h.pricePerNight),
    totalRooms: h.totalRooms,
    rating: h.rating ? parseFloat(h.rating) : null,
    createdAt: h.createdAt.toISOString(),
  };
}

async function formatBooking(booking: typeof hotelBookingsTable.$inferSelect) {
  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, booking.hotelId)).limit(1);
  return {
    id: booking.id,
    hotelId: booking.hotelId,
    hotelName: hotel?.name ?? "",
    city: hotel?.city ?? "",
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    rooms: booking.rooms,
    totalPrice: parseFloat(booking.totalPrice),
    qrCode: booking.qrCode,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt.toISOString(),
  };
}

router.get("/hotels/search", async (req, res): Promise<void> => {
  const query = SearchHotelsQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { city, checkIn, checkOut, rooms } = query.data;
  const requestedRooms = rooms ?? 1;

  const hotels = await db.select().from(hotelsTable).where(sql`lower(${hotelsTable.city}) = lower(${city})`);

  const results = await Promise.all(hotels.map(async (h) => {
    const availableRooms = await computeAvailableRooms(h.id, h.totalRooms, checkIn, checkOut);
    return { ...formatHotel(h), availableRooms };
  }));

  res.json(results.filter((r) => r.availableRooms >= requestedRooms));
});

router.get("/hotels/:hotelId", async (req, res): Promise<void> => {
  const params = GetHotelParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, params.data.hotelId)).limit(1);
  if (!hotel) { res.status(404).json({ error: "Hôtel non trouvé" }); return; }

  res.json(formatHotel(hotel));
});

router.post("/hotel-bookings/initiate", async (req, res): Promise<void> => {
  const body = InitiateHotelBookingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { hotelId, guestName, guestPhone, rooms, paymentMethod } = body.data;
  const checkInDate = body.data.checkInDate.toISOString().split("T")[0];
  const checkOutDate = body.data.checkOutDate.toISOString().split("T")[0];

  if (checkOutDate <= checkInDate) {
    res.status(400).json({ error: "La date de départ doit être après la date d'arrivée" });
    return;
  }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId)).limit(1);
  if (!hotel) { res.status(404).json({ error: "Hôtel non trouvé" }); return; }

  const availableRooms = await computeAvailableRooms(hotelId, hotel.totalRooms, checkInDate, checkOutDate);
  if (availableRooms < rooms) {
    res.status(409).json({ error: "Pas assez de chambres disponibles pour ces dates" });
    return;
  }

  const nights = Math.round((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (24 * 3600 * 1000));
  const totalPrice = parseFloat(hotel.pricePerNight) * nights * rooms;
  const paymentId = `HPAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { userId } = getSession(req);

  const [booking] = await db
    .insert(hotelBookingsTable)
    .values({
      hotelId, userId: userId ?? null, guestName, guestPhone,
      checkInDate, checkOutDate, rooms,
      totalPrice: String(totalPrice),
      paymentMethod, paymentStatus: "pending", paymentId,
      qrCode: await generateQrCode(paymentId),
    })
    .returning();

  res.json({ paymentId, amount: totalPrice, status: "pending", bookingId: booking.id });
});

router.post("/hotel-bookings/callback", async (req, res): Promise<void> => {
  const body = HotelBookingCallbackBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { paymentId, status } = body.data;

  const [booking] = await db.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.paymentId, paymentId)).limit(1);
  if (!booking) { res.status(404).json({ error: "Réservation non trouvée" }); return; }

  if (status !== "success") {
    await db.delete(hotelBookingsTable).where(eq(hotelBookingsTable.paymentId, paymentId));
    res.json({ success: false });
    return;
  }

  const qrCode = await generateQrCode(JSON.stringify({ bookingId: booking.id, paymentId }));
  await db.update(hotelBookingsTable).set({ paymentStatus: "paid", qrCode }).where(eq(hotelBookingsTable.paymentId, paymentId));

  res.json({ success: true });
});

router.get("/hotel-bookings", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.json([]); return; }

  const bookings = await db.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.userId, userId));
  res.json(await Promise.all(bookings.map(formatBooking)));
});

router.get("/hotel-bookings/:bookingId", async (req, res): Promise<void> => {
  const params = GetHotelBookingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [booking] = await db.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.id, params.data.bookingId)).limit(1);
  if (!booking) { res.status(404).json({ error: "Réservation non trouvée" }); return; }

  res.json(await formatBooking(booking));
});

export default router;
