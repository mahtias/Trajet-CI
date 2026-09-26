import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { agenciesTable } from "./agencies";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("passenger"), // passenger | clerk | admin
  companyId: integer("company_id").references(() => companiesTable.id), // clerk's assigned company; null = unassigned/admin
  // Clerk's assigned agency (hotel / tourism / vehicle rental). A clerk has either companyId or agencyId, never both.
  agencyId: integer("agency_id").references(() => agenciesTable.id, { onDelete: "set null" }),
  otpCode: text("otp_code"),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
