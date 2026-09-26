import { pgTable, serial, text, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agenciesTable } from "./agencies";

export const hotelsTable = pgTable("hotels", {
  id: serial("id").primaryKey(),
  agencyId: integer("agency_id").notNull().references(() => agenciesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  description: text("description"),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  totalRooms: integer("total_rooms").notNull(),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  images: jsonb("images").$type<string[]>(), // URLs returned by POST /admin/uploads
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHotelSchema = createInsertSchema(hotelsTable).omit({ id: true, createdAt: true });
export type InsertHotel = z.infer<typeof insertHotelSchema>;
export type Hotel = typeof hotelsTable.$inferSelect;
