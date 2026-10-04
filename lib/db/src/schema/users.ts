import { pgTable, serial, integer, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { agenciesTable } from "./agencies";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  // Optional, stored trimmed and lowercased; unique so it can later serve as a second login channel
  email: text("email").unique(),
  role: text("role").notNull().default("passenger"), // passenger | clerk | company_admin | admin
  // Company of a clerk or company_admin (scopes what they can see and manage); null = unassigned / super admin
  companyId: integer("company_id").references(() => companiesTable.id),
  // Clerk's assigned agency (hotel / tourism / vehicle rental). A clerk has either companyId or agencyId, never both.
  agencyId: integer("agency_id").references(() => agenciesTable.id, { onDelete: "set null" }),
  // Login code: HMAC-SHA256 only, never the code itself; cleared once used or after too many wrong tries
  otpCode: text("otp_code"),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  // Wrong tries against the current code (max 5, then a new code must be requested)
  otpAttempts: integer("otp_attempts").notNull().default(0),
  // Company admin closed the commission change banner at this time (shown again for a change announced later)
  commissionNoticeSeenAt: timestamp("commission_notice_seen_at", { withTimezone: true }),
  // active | suspended (super admin, e.g. abuse): a suspended account can't log in. Never for a super admin.
  status: text("status").notNull().default("active"),
  suspendedReason: text("suspended_reason"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedBy: integer("suspended_by").references((): AnyPgColumn => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
