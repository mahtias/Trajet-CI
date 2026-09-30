import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // PayDunya account (alias: phone number or email of the account) that receives the company's share
  // of each online sale automatically. NULL = no automatic transfer, the payout is left to do by hand.
  paydunyaAccountAlias: text("paydunya_account_alias"),
  // Owed back by the company: shares it was already paid for tickets cancelled afterwards.
  // Deducted automatically from its next transfers (never below 0 per transfer).
  pendingClawback: numeric("pending_clawback", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
