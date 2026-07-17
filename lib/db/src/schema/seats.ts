import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const seatsTable = pgTable("seats", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  seatNumber: integer("seat_number").notNull(),
  status: text("status").notNull().default("available"), // available | reserved | sold
  reservedAt: timestamp("reserved_at", { withTimezone: true }),
  passengerName: text("passenger_name"),
  passengerPhone: text("passenger_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSeatSchema = createInsertSchema(seatsTable).omit({ id: true, createdAt: true });
export type InsertSeat = z.infer<typeof insertSeatSchema>;
export type Seat = typeof seatsTable.$inferSelect;
