import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AGENCY_TYPES = ["hotel", "tourism", "vehicle_rental"] as const;
export type AgencyType = (typeof AGENCY_TYPES)[number];

export const agenciesTable = pgTable("agencies", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // hotel | tourism | vehicle_rental
  name: text("name").notNull(),
  city: text("city").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgencySchema = createInsertSchema(agenciesTable, {
  type: z.enum(AGENCY_TYPES),
}).omit({ id: true, createdAt: true });
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agenciesTable.$inferSelect;
