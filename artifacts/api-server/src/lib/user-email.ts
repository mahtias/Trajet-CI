import { eq, and, ne, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  ticketsTable,
  paymentsTable,
  hotelBookingsTable,
  tourismBookingsTable,
  vehicleBookingsTable,
} from "@workspace/db";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INVALID_EMAIL = "Adresse e-mail invalide (exemple : nom@exemple.com)";
export const EMAIL_TAKEN = "Cette adresse e-mail est déjà utilisée par un autre compte";

/** Optional e-mail: null when empty, trimmed and lowercased otherwise, or an error message. */
export function parseEmail(raw: string | null | undefined): { ok: true; email: string | null } | { ok: false; error: string } {
  const email = raw?.trim().toLowerCase() ?? "";
  if (!email) return { ok: true, email: null };
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { ok: false, error: INVALID_EMAIL };
  return { ok: true, email };
}

/** True if another account already has this e-mail. */
export async function emailTaken(email: string, userId: number): Promise<boolean> {
  const [other] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.email, email), ne(usersTable.id, userId))).limit(1);
  return !!other;
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string; cause?: { code?: string } })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505";
}

/**
 * True when the account has anything worth stealing: a ticket, a payment, or a hotel / tourism / vehicle
 * booking, whatever its status (even pending, cancelled or expired). Such an account can't get an e-mail
 * from an unauthenticated request: whoever sets the e-mail would receive its login codes.
 */
export async function hasAccountActivity(userId: number): Promise<boolean> {
  const result = await db.execute<{ active: boolean }>(sql`select
    exists (select 1 from ${ticketsTable} where ${ticketsTable.userId} = ${userId})
    or exists (select 1 from ${paymentsTable} where ${paymentsTable.userId} = ${userId})
    or exists (select 1 from ${hotelBookingsTable} where ${hotelBookingsTable.userId} = ${userId})
    or exists (select 1 from ${tourismBookingsTable} where ${tourismBookingsTable.userId} = ${userId})
    or exists (select 1 from ${vehicleBookingsTable} where ${vehicleBookingsTable.userId} = ${userId}) as active`);
  return result.rows[0]?.active === true;
}
