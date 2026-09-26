import { pgTable, serial, integer, numeric, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tourismSpotsTable } from "./tourism-spots";
import { usersTable } from "./users";

export const tourismBookingsTable = pgTable("tourism_bookings", {
  id: serial("id").primaryKey(),
  spotId: integer("spot_id").notNull().references(() => tourismSpotsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  nbPeople: integer("nb_people").notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending | confirmed | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTourismBookingSchema = createInsertSchema(tourismBookingsTable).omit({ id: true, createdAt: true });
export type InsertTourismBooking = z.infer<typeof insertTourismBookingSchema>;
export type TourismBooking = typeof tourismBookingsTable.$inferSelect;
