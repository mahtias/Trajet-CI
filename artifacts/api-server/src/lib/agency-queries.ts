import { eq, and, ne, inArray, sql } from "drizzle-orm";
import {
  db,
  agenciesTable,
  hotelsTable,
  hotelBookingsTable,
  tourismSpotsTable,
  tourismBookingsTable,
  vehiclesTable,
  vehicleBookingsTable,
  paymentsTable,
  usersTable,
  type AgencyType,
  type User,
} from "@workspace/db";

/** Booking statuses that hold capacity / a vehicle (cancelled bookings don't). */
export const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

/** True if a clerk (scoped to an agency) is allowed to act on this resource. Admins are unrestricted. */
export function isAllowedForAgency(user: User, resourceAgencyId: number | null): boolean {
  if (user.role === "admin") return true;
  return user.agencyId !== null && user.agencyId === resourceAgencyId;
}

/** Error message if the agency doesn't exist or isn't of the expected type, or null if it's fine. */
export async function checkAgencyType(agencyId: number, type: AgencyType): Promise<string | null> {
  const [agency] = await db.select().from(agenciesTable).where(eq(agenciesTable.id, agencyId)).limit(1);
  if (!agency) return "Agence non trouvée";
  if (agency.type !== type) return `Cette agence n'est pas de type "${type}"`;
  return null;
}

export const MAX_IMAGES = 5;

/**
 * Error message if the image list is invalid, or null if it's fine.
 * Images are URLs from POST /admin/uploads, stored as-is in jsonb.
 */
export function checkImageUrls(images: string[] | null | undefined): string | null {
  if (!images) return null;
  if (images.length > MAX_IMAGES) return `${MAX_IMAGES} images maximum`;
  // Only files returned by POST /admin/uploads: "<uuid>.webp" (compressed) or the older "<uuid>.jpg|png|webp"
  const valid = (url: string) => /^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$/.test(url);
  if (!images.every(valid)) return "Image invalide : utilisez une image envoyée via l'upload";
  return null;
}

/** "YYYY-MM-DD" for today, used to reject bookings in the past. */
export function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/** Number of rental days, both ends inclusive (same-day rental = 1 day). */
export function rentalDays(startDate: string, endDate: string): number {
  return Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 3600 * 1000)) + 1;
}

export function roundPrice(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// ── Catalog ────────────────────────────────────────────────────────────────────

export function formatTourismSpot(spot: typeof tourismSpotsTable.$inferSelect, agency: typeof agenciesTable.$inferSelect) {
  return {
    id: spot.id, agencyId: spot.agencyId, agencyName: agency.name,
    name: spot.name, description: spot.description, location: spot.location,
    price: parseFloat(spot.price), capacityPerDay: spot.capacityPerDay,
    images: spot.images ?? null, isActive: spot.isActive,
    createdAt: spot.createdAt.toISOString(),
  };
}

export function formatVehicle(vehicle: typeof vehiclesTable.$inferSelect, agency: typeof agenciesTable.$inferSelect) {
  return {
    id: vehicle.id, agencyId: vehicle.agencyId, agencyName: agency.name,
    brand: vehicle.brand, model: vehicle.model, category: vehicle.category, seats: vehicle.seats,
    pricePerDay: parseFloat(vehicle.pricePerDay),
    images: vehicle.images ?? null, isActive: vehicle.isActive,
    createdAt: vehicle.createdAt.toISOString(),
  };
}

export function selectTourismSpots() {
  return db
    .select({ spot: tourismSpotsTable, agency: agenciesTable })
    .from(tourismSpotsTable)
    .innerJoin(agenciesTable, eq(tourismSpotsTable.agencyId, agenciesTable.id))
    .$dynamic();
}

export function selectVehicles() {
  return db
    .select({ vehicle: vehiclesTable, agency: agenciesTable })
    .from(vehiclesTable)
    .innerJoin(agenciesTable, eq(vehiclesTable.agencyId, agenciesTable.id))
    .$dynamic();
}

// ── Bookings ───────────────────────────────────────────────────────────────────

/** Tourism bookings joined with their spot and customer. Add .where()/.orderBy() as needed. */
export function selectTourismBookings() {
  return db
    .select({ booking: tourismBookingsTable, spot: tourismSpotsTable, user: usersTable })
    .from(tourismBookingsTable)
    .innerJoin(tourismSpotsTable, eq(tourismBookingsTable.spotId, tourismSpotsTable.id))
    .innerJoin(usersTable, eq(tourismBookingsTable.userId, usersTable.id))
    .$dynamic();
}

export type TourismBookingRow = Awaited<ReturnType<typeof selectTourismBookings>>[number];

export function formatTourismBooking({ booking, spot, user }: TourismBookingRow) {
  return {
    id: booking.id, spotId: booking.spotId, spotName: spot.name,
    userId: booking.userId, userName: user.name, userPhone: user.phone,
    visitDate: booking.visitDate, nbPeople: booking.nbPeople,
    totalPrice: parseFloat(booking.totalPrice), status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  };
}

/** Vehicle bookings joined with their vehicle and customer. Add .where()/.orderBy() as needed. */
export function selectVehicleBookings() {
  return db
    .select({ booking: vehicleBookingsTable, vehicle: vehiclesTable, user: usersTable })
    .from(vehicleBookingsTable)
    .innerJoin(vehiclesTable, eq(vehicleBookingsTable.vehicleId, vehiclesTable.id))
    .innerJoin(usersTable, eq(vehicleBookingsTable.userId, usersTable.id))
    .$dynamic();
}

export type VehicleBookingRow = Awaited<ReturnType<typeof selectVehicleBookings>>[number];

export function formatVehicleBooking({ booking, vehicle, user }: VehicleBookingRow) {
  return {
    id: booking.id, vehicleId: booking.vehicleId, vehicleLabel: `${vehicle.brand} ${vehicle.model}`,
    userId: booking.userId, userName: user.name, userPhone: user.phone,
    startDate: booking.startDate, endDate: booking.endDate,
    totalPrice: parseFloat(booking.totalPrice), status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  };
}

export function formatHotelBooking(booking: typeof hotelBookingsTable.$inferSelect, hotel: typeof hotelsTable.$inferSelect | undefined) {
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
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  };
}

/** Places already taken (pending + confirmed) on a spot for a given day. */
export async function bookedPeople(spotId: number, visitDate: string, executor: Pick<typeof db, "select"> = db): Promise<number> {
  const [{ total }] = await executor
    .select({ total: sql<number>`COALESCE(SUM(${tourismBookingsTable.nbPeople}), 0)::int` })
    .from(tourismBookingsTable)
    .where(and(
      eq(tourismBookingsTable.spotId, spotId),
      eq(tourismBookingsTable.visitDate, visitDate),
      inArray(tourismBookingsTable.status, ACTIVE_BOOKING_STATUSES),
    ));
  return total;
}

/** True if a pending/confirmed booking of this vehicle overlaps [startDate, endDate] (inclusive). */
export async function hasVehicleOverlap(
  vehicleId: number,
  startDate: string,
  endDate: string,
  excludeBookingId?: number,
  executor: Pick<typeof db, "select"> = db,
): Promise<boolean> {
  const conditions = [
    eq(vehicleBookingsTable.vehicleId, vehicleId),
    inArray(vehicleBookingsTable.status, ACTIVE_BOOKING_STATUSES),
    sql`${vehicleBookingsTable.startDate} <= ${endDate}`,
    sql`${vehicleBookingsTable.endDate} >= ${startDate}`,
  ];
  if (excludeBookingId !== undefined) conditions.push(ne(vehicleBookingsTable.id, excludeBookingId));

  const [existing] = await executor
    .select({ id: vehicleBookingsTable.id })
    .from(vehicleBookingsTable)
    .where(and(...conditions))
    .limit(1);
  return !!existing;
}

/** Error message if a booking can't move from `current` to `next`, or null if it can. */
export function checkStatusTransition(current: string, next: "confirmed" | "cancelled"): string | null {
  if (current === "cancelled") return "Cette réservation est déjà annulée";
  if (current === next) return next === "confirmed" ? "Cette réservation est déjà confirmée" : "Cette réservation est déjà annulée";
  return null;
}

/**
 * Keeps the generic payments row in sync when a clerk confirms (cash received) or cancels a booking.
 * Only pending payments are touched: a payment already settled by a provider is left alone.
 */
export async function settlePendingPayment(bookingType: "hotel" | "tourism" | "vehicle", bookingId: number, next: "confirmed" | "cancelled") {
  await db
    .update(paymentsTable)
    .set(next === "confirmed" ? { status: "success", provider: "cash" } : { status: "failed" })
    .where(and(
      eq(paymentsTable.bookingType, bookingType),
      eq(paymentsTable.bookingId, bookingId),
      eq(paymentsTable.status, "pending"),
    ));
}
