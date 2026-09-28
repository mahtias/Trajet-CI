import { pgTable, text, numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Display-only exchange rates: how many FCFA make 1 unit of the currency (e.g. EUR = 655.957).
 * Prices, payments and bookings always stay in FCFA; these rates only feed indicative conversions.
 */
export const exchangeRatesTable = pgTable("exchange_rates", {
  currency: text("currency").primaryKey(), // EUR | USD | CNY
  fcfaPerUnit: numeric("fcfa_per_unit", { precision: 12, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExchangeRate = typeof exchangeRatesTable.$inferSelect;
