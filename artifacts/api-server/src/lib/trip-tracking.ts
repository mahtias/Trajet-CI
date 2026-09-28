import { eq, and, isNull } from "drizzle-orm";
import { db, ticketsTable, tripsTable, tripLocationsTable, usersTable, type User } from "@workspace/db";
import { getTripCompanyId, isAllowed } from "./trip-queries";

/**
 * Who may see / share a trip's live position:
 * - "driver": clerk of the trip's company (or admin) — may share and see the position
 * - "passenger": holder of a paid, non-cancelled ticket for this exact trip — may only see it
 * - null: nobody else (no position data is ever sent to them)
 */
export type TrackingAccess = "driver" | "passenger" | null;

export async function getUserById(userId: number): Promise<User | undefined> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user;
}

export async function hasPaidTicket(userId: number, tripId: number): Promise<boolean> {
  const [ticket] = await db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .where(and(
      eq(ticketsTable.tripId, tripId),
      eq(ticketsTable.userId, userId),
      eq(ticketsTable.paymentStatus, "paid"),
      isNull(ticketsTable.cancelledAt),
    ))
    .limit(1);
  return !!ticket;
}

export async function getTrackingAccess(user: User, tripId: number): Promise<TrackingAccess> {
  const tripCompanyId = await getTripCompanyId(tripId);
  if (tripCompanyId === null) return null;
  if ((user.role === "clerk" || user.role === "admin") && isAllowed(user, tripCompanyId)) return "driver";
  if (await hasPaidTicket(user.id, tripId)) return "passenger";
  return null;
}

export async function isTripActive(tripId: number): Promise<boolean> {
  const [trip] = await db.select({ status: tripsTable.status }).from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
  return trip?.status === "active";
}

export function formatTripLocation(location: typeof tripLocationsTable.$inferSelect) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    updatedAt: location.updatedAt.toISOString(),
  };
}

export async function getLastLocation(tripId: number) {
  const [location] = await db.select().from(tripLocationsTable).where(eq(tripLocationsTable.tripId, tripId)).limit(1);
  return location;
}

/** Upsert: only the last known position is kept per trip. */
export async function saveLocation(tripId: number, latitude: number, longitude: number) {
  const updatedAt = new Date();
  const [location] = await db
    .insert(tripLocationsTable)
    .values({ tripId, latitude, longitude, updatedAt })
    .onConflictDoUpdate({ target: tripLocationsTable.tripId, set: { latitude, longitude, updatedAt } })
    .returning();
  return location;
}
