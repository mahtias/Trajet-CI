import { pgTable, serial, integer, text, numeric, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";

export const tourismSpotsTable = pgTable("tourism_spots", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location").notNull(), // city / region
  price: numeric("price", { precision: 10, scale: 2 }).notNull(), // per person
  capacityPerDay: integer("capacity_per_day").notNull(),
  images: jsonb("images").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTourismSpotSchema = createInsertSchema(tourismSpotsTable).omit({ id: true, createdAt: true });
export type InsertTourismSpot = z.infer<typeof insertTourismSpotSchema>;
export type TourismSpot = typeof tourismSpotsTable.$inferSelect;
