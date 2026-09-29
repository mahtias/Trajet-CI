import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, hotelsTable, hotelBookingsTable } from "@workspace/db";
import { z } from "zod";
import {
  GetHotelParams,
  InitiateHotelBookingBody,
  GetHotelBookingParams,
  GetHotelBookingPaymentStatusParams,
} from "@workspace/api-zod";
import { formatHotelBooking, todayDate } from "../lib/agency-queries";
import { computeAvailableRooms } from "../lib/hotel-availability";
import { getPaydunyaConfig, createCheckoutInvoice, PaydunyaConfigError } from "../lib/paydunya";

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

function formatHotel(h: typeof hotelsTable.$inferSelect) {
  return {
    id: h.id,
    agencyId: h.agencyId,
    name: h.name,
    city: h.city,
    address: h.address,
    description: h.description,
    pricePerNight: parseFloat(h.pricePerNight),
    totalRooms: h.totalRooms,
    rating: h.rating ? parseFloat(h.rating) : null,
    images: h.images ?? null,
    createdAt: h.createdAt.toISOString(),
  };
}

async function formatBooking(booking: typeof hotelBookingsTable.$inferSelect) {
  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, booking.hotelId)).limit(1);
  return formatHotelBooking(booking, hotel);
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

/**
 * Starts a hotel booking paid online, same pattern as bus tickets (routes/payments.ts):
 * the amount is recomputed here from the hotel's price and the stay (never taken from the client),
 * a PayDunya invoice is created, and the booking only becomes "paid" through the PayDunya webhook.
 */
router.post("/hotel-bookings/initiate", async (req, res): Promise<void> => {
  const body = InitiateHotelBookingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  let config;
  try {
    config = getPaydunyaConfig();
  } catch (err) {
    if (err instanceof PaydunyaConfigError) {
      req.log.error({ reason: err.message }, "Hotel payment requested but PayDunya is not configured");
      res.status(503).json({ error: "Le paiement en ligne est momentanément indisponible" });
      return;
    }
    throw err;
  }

  const { hotelId, guestName, guestPhone, rooms, paymentMethod } = body.data;
  const checkInDate = body.data.checkInDate.toISOString().split("T")[0];
  const checkOutDate = body.data.checkOutDate.toISOString().split("T")[0];

  if (!Number.isInteger(rooms) || rooms < 1) { res.status(400).json({ error: "Le nombre de chambres doit être un entier positif" }); return; }
  if (checkOutDate <= checkInDate) {
    res.status(400).json({ error: "La date de départ doit être après la date d'arrivée" });
    return;
  }
  if (checkInDate < todayDate()) { res.status(400).json({ error: "La date d'arrivée est déjà passée" }); return; }

  const [hotel] = await db.select().from(hotelsTable).where(eq(hotelsTable.id, hotelId)).limit(1);
  if (!hotel) { res.status(404).json({ error: "Hôtel non trouvé" }); return; }

  const availableRooms = await computeAvailableRooms(hotelId, hotel.totalRooms, checkInDate, checkOutDate);
  if (availableRooms < rooms) {
    res.status(409).json({ error: "Pas assez de chambres disponibles pour ces dates" });
    return;
  }

  // FCFA has no subunit: the invoiced amount is an integer, and it is exactly what the booking records
  const nights = Math.round((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (24 * 3600 * 1000));
  const amount = Math.round(parseFloat(hotel.pricePerNight) * nights * rooms);
  if (!Number.isFinite(amount) || amount <= 0) { res.status(409).json({ error: "Prix de l'hôtel invalide" }); return; }

  const [booking] = await db
    .insert(hotelBookingsTable)
    .values({
      hotelId, userId, guestName, guestPhone,
      checkInDate, checkOutDate, rooms,
      totalPrice: String(amount),
      paymentMethod, // what the customer intends to use; the actual method is chosen on the PayDunya page
      paymentStatus: "pending",
      qrCode: "",
    })
    .returning();

  let invoice: { token: string; url: string };
  try {
    invoice = await createCheckoutInvoice(config, {
      amount,
      description: `${hotel.name} – ${nights} nuit(s), ${rooms} chambre(s), du ${checkInDate} au ${checkOutDate}`,
      itemName: `Séjour ${hotel.name}`,
      customer: { name: guestName, phone: guestPhone },
      customData: { hotel_booking_id: booking.id, hotel_id: hotel.id },
      returnUrl: `${config.appPublicUrl}/payment/return?hotelBookingId=${booking.id}`,
      cancelUrl: `${config.appPublicUrl}/payment/return?hotelBookingId=${booking.id}&cancelled=1`,
      // Same webhook as bus tickets: it finds the booking from the invoice token
      callbackUrl: `${config.appPublicUrl}/api/payments/paydunya-webhook`,
    });
  } catch (err) {
    req.log.error({ err, bookingId: booking.id }, "PayDunya invoice creation failed (hotel)");
    await db.update(hotelBookingsTable).set({ paymentStatus: "failed" }).where(eq(hotelBookingsTable.id, booking.id));
    res.status(502).json({ error: "Le service de paiement est momentanément indisponible, réessayez dans quelques instants" });
    return;
  }

  await db.update(hotelBookingsTable).set({ paymentId: invoice.token }).where(eq(hotelBookingsTable.id, booking.id));

  res.json({ paymentId: invoice.token, amount, status: "pending", bookingId: booking.id, redirectUrl: invoice.url });
});

router.get("/hotel-bookings", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.json([]); return; }

  const bookings = await db.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.userId, userId));
  res.json(await Promise.all(bookings.map(formatBooking)));
});

// Guest data (name, phone, stay): only the booking's owner may read it. 401 → 404 → 403, as for tickets.
router.get("/hotel-bookings/:bookingId", async (req, res): Promise<void> => {
  const params = GetHotelBookingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  const [booking] = await db.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.id, params.data.bookingId)).limit(1);
  if (!booking) { res.status(404).json({ error: "Réservation non trouvée" }); return; }
  if (booking.userId !== userId) { res.status(403).json({ error: "Cette réservation ne vous appartient pas" }); return; }

  res.json(await formatBooking(booking));
});

// Polled by the page the customer lands on after PayDunya. Read-only: only the webhook marks a booking paid.
router.get("/hotel-bookings/:bookingId/payment-status", async (req, res): Promise<void> => {
  const params = GetHotelBookingPaymentStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  const [booking] = await db.select().from(hotelBookingsTable).where(eq(hotelBookingsTable.id, params.data.bookingId)).limit(1);
  if (!booking) { res.status(404).json({ error: "Réservation non trouvée" }); return; }
  if (booking.userId !== userId) { res.status(403).json({ error: "Cette réservation ne vous appartient pas" }); return; }

  res.json({ bookingId: booking.id, paymentStatus: booking.paymentStatus });
});

export default router;
