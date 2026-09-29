import { eq, and, ne, sql } from "drizzle-orm";
import { db, hotelBookingsTable } from "@workspace/db";

/**
 * Rooms still free on [checkIn, checkOut). Only PAID bookings take rooms: there is no temporary
 * hold while someone pays, so availability is checked again when PayDunya confirms a payment.
 */
export async function computeAvailableRooms(
  hotelId: number,
  totalRooms: number,
  checkIn: string,
  checkOut: string,
  options: { excludeBookingId?: number; executor?: Pick<typeof db, "select"> } = {},
): Promise<number> {
  const conditions = [
    eq(hotelBookingsTable.hotelId, hotelId),
    eq(hotelBookingsTable.paymentStatus, "paid"),
    sql`${hotelBookingsTable.checkInDate} < ${checkOut}`,
    sql`${hotelBookingsTable.checkOutDate} > ${checkIn}`,
  ];
  if (options.excludeBookingId !== undefined) conditions.push(ne(hotelBookingsTable.id, options.excludeBookingId));

  const [{ booked }] = await (options.executor ?? db)
    .select({ booked: sql<number>`COALESCE(SUM(${hotelBookingsTable.rooms}), 0)::int` })
    .from(hotelBookingsTable)
    .where(and(...conditions));
  return Math.max(0, totalRooms - booked);
}
