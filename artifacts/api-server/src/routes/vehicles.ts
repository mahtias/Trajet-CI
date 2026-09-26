import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, vehiclesTable, vehicleBookingsTable, paymentsTable } from "@workspace/db";
import {
  ListVehiclesQueryParams,
  GetVehicleParams,
  CreateVehicleBookingBody,
} from "@workspace/api-zod";
import { z } from "zod";
import {
  selectVehicles,
  selectVehicleBookings,
  formatVehicle,
  formatVehicleBooking,
  hasVehicleOverlap,
  rentalDays,
  todayDate,
  roundPrice,
} from "../lib/agency-queries";

const router: IRouter = Router();

function getSession(req: any) {
  return req.session as { userId?: number };
}

// Generated GetVehicleAvailabilityQueryParams expects Dates; query strings need the YYYY-MM-DD form.
const AvailabilityQuery = z.object({
  vehicleId: z.coerce.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Error message if the rental dates are invalid, or null if they're fine. */
function checkRentalDates(startDate: string, endDate: string): string | null {
  if (endDate < startDate) return "La date de fin doit être après la date de début";
  if (startDate < todayDate()) return "La date de début est déjà passée";
  return null;
}

router.get("/vehicles", async (req, res): Promise<void> => {
  const query = ListVehiclesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const conditions = [eq(vehiclesTable.isActive, true)];
  if (query.data.category) {
    conditions.push(sql`lower(${vehiclesTable.category}) = lower(${query.data.category})`);
  }

  const results = await selectVehicles()
    .where(and(...conditions))
    .orderBy(vehiclesTable.pricePerDay, vehiclesTable.id);
  res.json(results.map(({ vehicle, agency }) => formatVehicle(vehicle, agency)));
});

router.get("/vehicles/:vehicleId", async (req, res): Promise<void> => {
  const params = GetVehicleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [result] = await selectVehicles()
    .where(and(eq(vehiclesTable.id, params.data.vehicleId), eq(vehiclesTable.isActive, true)))
    .limit(1);
  if (!result) { res.status(404).json({ error: "Véhicule non trouvé" }); return; }

  res.json(formatVehicle(result.vehicle, result.agency));
});

router.get("/vehicle-availability", async (req, res): Promise<void> => {
  const query = AvailabilityQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }
  const { vehicleId, startDate, endDate } = query.data;
  if (endDate < startDate) { res.status(400).json({ error: "La date de fin doit être après la date de début" }); return; }

  res.json({ available: !(await hasVehicleOverlap(vehicleId, startDate, endDate)) });
});

router.post("/vehicle-bookings", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Authentification requise" }); return; }

  const body = CreateVehicleBookingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { vehicleId } = body.data;
  const startDate = body.data.startDate.toISOString().split("T")[0];
  const endDate = body.data.endDate.toISOString().split("T")[0];
  const dateError = checkRentalDates(startDate, endDate);
  if (dateError) { res.status(400).json({ error: dateError }); return; }

  // Lock the vehicle row so two overlapping bookings can't both pass the overlap check
  const result = await db.transaction(async (tx) => {
    const [vehicle] = await tx.select().from(vehiclesTable).where(eq(vehiclesTable.id, vehicleId)).for("update");
    if (!vehicle || !vehicle.isActive) return { ok: false, status: 404, error: "Véhicule non trouvé" } as const;

    if (await hasVehicleOverlap(vehicle.id, startDate, endDate, undefined, tx)) {
      return { ok: false, status: 409, error: "Ce véhicule est déjà réservé sur ces dates" } as const;
    }

    // Price always computed server-side
    const totalPrice = roundPrice(parseFloat(vehicle.pricePerDay) * rentalDays(startDate, endDate));
    const [booking] = await tx.insert(vehicleBookingsTable).values({
      vehicleId: vehicle.id, userId, startDate, endDate, totalPrice: String(totalPrice), status: "pending",
    }).returning();
    await tx.insert(paymentsTable).values({
      bookingType: "vehicle", bookingId: booking.id, userId, amount: String(totalPrice), status: "pending",
    });
    return { ok: true, booking } as const;
  });

  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

  const [row] = await selectVehicleBookings().where(eq(vehicleBookingsTable.id, result.booking.id)).limit(1);
  res.status(201).json(formatVehicleBooking(row));
});

router.get("/vehicle-bookings", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.json([]); return; }

  const rows = await selectVehicleBookings()
    .where(eq(vehicleBookingsTable.userId, userId))
    .orderBy(desc(vehicleBookingsTable.createdAt));
  res.json(rows.map(formatVehicleBooking));
});

export default router;
