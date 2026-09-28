import { pgTable, serial, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

/** Last known bus position per trip (one row per trip, overwritten on each update — no history yet). */
export const tripLocationsTable = pgTable("trip_locations", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().unique().references(() => tripsTable.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTripLocationSchema = createInsertSchema(tripLocationsTable).omit({ id: true });
export type InsertTripLocation = z.infer<typeof insertTripLocationSchema>;
export type TripLocation = typeof tripLocationsTable.$inferSelect;
