import { pgTable, serial, integer, numeric, text, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { routesTable } from "./routes";
import { busesTable } from "./buses";

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  routeId: integer("route_id").notNull().references(() => routesTable.id, { onDelete: "cascade" }),
  busId: integer("bus_id").notNull().references(() => busesTable.id, { onDelete: "restrict" }),
  departureDate: date("departure_date", { mode: "string" }).notNull(),
  departureTime: text("departure_time").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"), // active | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
