import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./cities";

export const stationsTable = pgTable("stations", {
  id: serial("id").primaryKey(),
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStationSchema = createInsertSchema(stationsTable).omit({ id: true, createdAt: true });
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stationsTable.$inferSelect;
