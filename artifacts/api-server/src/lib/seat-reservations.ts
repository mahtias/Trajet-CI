import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** How long a seat stays held while its buyer pays. */
export const RESERVATION_MINUTES = 10;

/**
 * Lazily expires stale online purchases (called before reading seats): pending tickets older than
 * the reservation window become "expired" and their held seats go back to "available".
 * A PayDunya payment completed after this point is handled by the webhook (seat re-sold to the
 * payer if still free, otherwise the ticket is flagged "refund_required").
 */
export async function releaseExpiredReservations(tripId?: number) {
  const tripFilter = tripId !== undefined ? sql`AND trip_id = ${tripId}` : sql``;
  await db.execute(sql`
    UPDATE tickets SET payment_status = 'expired'
    WHERE payment_status = 'pending' AND cancelled_at IS NULL
      AND created_at < NOW() - make_interval(mins => ${RESERVATION_MINUTES}) ${tripFilter}
  `);
  await db.execute(sql`
    UPDATE seats SET status = 'available', reserved_at = NULL, passenger_name = NULL, passenger_phone = NULL
    WHERE status = 'reserved' AND reserved_at < NOW() - make_interval(mins => ${RESERVATION_MINUTES}) ${tripFilter}
  `);
}
