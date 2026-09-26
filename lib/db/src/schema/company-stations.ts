import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { stationsTable } from "./stations";

export const companyStationsTable = pgTable("company_stations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  stationId: integer("station_id").notNull().references(() => stationsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.companyId, table.stationId),
]);

export const insertCompanyStationSchema = createInsertSchema(companyStationsTable).omit({ id: true, createdAt: true });
export type InsertCompanyStation = z.infer<typeof insertCompanyStationSchema>;
export type CompanyStation = typeof companyStationsTable.$inferSelect;
