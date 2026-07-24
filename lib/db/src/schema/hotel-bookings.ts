import { pgTable, serial, integer, numeric, text, date, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { hotelsTable } from "./hotels";
import { usersTable } from "./users";

export const hotelBookingsTable = pgTable("hotel_bookings", {
  id: serial("id").primaryKey(),
  hotelId: integer("hotel_id").notNull().references(() => hotelsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone").notNull(),
  checkInDate: date("check_in_date", { mode: "string" }).notNull(),
  checkOutDate: date("check_out_date", { mode: "string" }).notNull(),
  rooms: integer("rooms").notNull().default(1),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("orange_money"), // wave | orange_money | mtn_money
  paymentStatus: text("payment_status").notNull().default("pending"), // pending | paid
  paymentId: text("payment_id"),
  qrCode: text("qr_code").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHotelBookingSchema = createInsertSchema(hotelBookingsTable).omit({ id: true, createdAt: true });
export type InsertHotelBooking = z.infer<typeof insertHotelBookingSchema>;
export type HotelBooking = typeof hotelBookingsTable.$inferSelect;
