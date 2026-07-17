import { pgTable, serial, integer, numeric, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { seatsTable } from "./seats";
import { usersTable } from "./users";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id),
  seatId: integer("seat_id").notNull().references(() => seatsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  passengerName: text("passenger_name").notNull(),
  passengerPhone: text("passenger_phone").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  qrCode: text("qr_code").notNull().default(""),
  paymentStatus: text("payment_status").notNull().default("pending"), // pending | paid
  paymentId: text("payment_id"),
  validated: boolean("validated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
