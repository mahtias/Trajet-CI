import { pgTable, serial, integer, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ticketsTable } from "./tickets";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

/**
 * A passenger's rating of a bus company, for one trip actually taken (paid ticket, departure passed).
 * One per ticket. companyId is copied from the trip's route when rating, so later route changes don't move it.
 */
export const companyRatingsTable = pgTable("company_ratings", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().unique().references(() => ticketsTable.id),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  rating: integer("rating").notNull(), // 1 to 5 stars
  comment: text("comment"), // optional, 500 characters max
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("company_ratings_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
]);

export type CompanyRating = typeof companyRatingsTable.$inferSelect;
