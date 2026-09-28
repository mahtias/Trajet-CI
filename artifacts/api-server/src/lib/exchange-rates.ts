import { db, exchangeRatesTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Accepted range for "FCFA per unit". Covers EUR (655.957), USD (~600) and CNY (~85) with a wide
 * margin, while rejecting typical mistakes: an inverted rate (0.0015) or a missing decimal point (655957).
 */
export const MIN_FCFA_PER_UNIT = 1;
export const MAX_FCFA_PER_UNIT = 10_000;

/** Official fixed parity. The only rate pre-filled: USD and CNY are left for an admin to set. */
export const EUR_FIXED_RATE = "655.957";

export function formatExchangeRate(rate: typeof exchangeRatesTable.$inferSelect) {
  return { currency: rate.currency, fcfaPerUnit: parseFloat(rate.fcfaPerUnit), updatedAt: rate.updatedAt.toISOString() };
}

/** Idempotent (ON CONFLICT DO NOTHING): never overwrites a rate an admin has already set. Runs at API startup. */
export async function seedDefaultExchangeRates() {
  const inserted = await db
    .insert(exchangeRatesTable)
    .values({ currency: "EUR", fcfaPerUnit: EUR_FIXED_RATE })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) logger.info({ currency: "EUR", fcfaPerUnit: EUR_FIXED_RATE }, "Default exchange rate inserted");
}
