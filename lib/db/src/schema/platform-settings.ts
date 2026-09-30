import { pgTable, integer, numeric, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Global platform settings: a single row (id = 1), edited by the super admin only.
 * Values are copied onto each ticket when it is created, so changing them never alters past tickets.
 */
export const platformSettingsTable = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("5"),
  // Fee for choosing a precise seat (FCFA); automatic seat assignment is free
  seatSelectionFee: numeric("seat_selection_fee", { precision: 10, scale: 2 }).notNull().default("400"),
  // Platform's share of that fee; the company gets the rest (100 - this)
  seatSelectionPlatformPercent: numeric("seat_selection_platform_percent", { precision: 5, scale: 2 }).notNull().default("60"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("platform_settings_single_row", sql`${table.id} = 1`),
]);

export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
