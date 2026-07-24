import { eq, and } from "drizzle-orm";
import { db, companiesTable, routesTable, tripsTable, seatsTable } from "@workspace/db";

import { TRANSPORT_COMPANIES } from "./data/transport-companies";
import { getRouteDurationMinutes } from "./data/route-durations";
import { expandSchedule } from "./data/schedule";

const TRIP_DAYS_AHEAD = 14;
const SEATS_PER_TRIP = 40;

function upcomingDates(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

async function upsertCompany(name: string): Promise<number> {
  const [existing] = await db.select().from(companiesTable).where(eq(companiesTable.name, name)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(companiesTable).values({ name }).returning();
  return created.id;
}

async function upsertRoute(companyId: number, origin: string, destination: string): Promise<number> {
  const [existing] = await db
    .select()
    .from(routesTable)
    .where(and(eq(routesTable.companyId, companyId), eq(routesTable.origin, origin), eq(routesTable.destination, destination)))
    .limit(1);
  if (existing) return existing.id;

  const durationMinutes = getRouteDurationMinutes(origin, destination);
  const [created] = await db.insert(routesTable).values({ companyId, origin, destination, durationMinutes }).returning();
  return created.id;
}

async function ensureTrip(routeId: number, departureDate: string, departureTime: string, price: number): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(tripsTable)
    .where(and(eq(tripsTable.routeId, routeId), eq(tripsTable.departureDate, departureDate), eq(tripsTable.departureTime, departureTime)))
    .limit(1);
  if (existing) return false;

  const [trip] = await db
    .insert(tripsTable)
    .values({ routeId, departureDate, departureTime, price: String(price), status: "active" })
    .returning();

  const seats = Array.from({ length: SEATS_PER_TRIP }, (_, i) => ({
    tripId: trip.id,
    seatNumber: i + 1,
    status: "available" as const,
  }));
  await db.insert(seatsTable).values(seats);
  return true;
}

async function main() {
  const dates = upcomingDates(TRIP_DAYS_AHEAD);
  let companiesCount = 0;
  let routesCount = 0;
  let tripsCreated = 0;

  for (const company of TRANSPORT_COMPANIES) {
    const companyId = await upsertCompany(company.name);
    companiesCount++;

    for (const route of company.routes) {
      const routeId = await upsertRoute(companyId, route.origin, route.destination);
      routesCount++;

      const times = expandSchedule(route.schedule);
      for (const date of dates) {
        for (const time of times) {
          const created = await ensureTrip(routeId, date, time, route.price);
          if (created) tripsCreated++;
        }
      }
    }
  }

  console.log(`Seeded ${companiesCount} companies, ${routesCount} routes, ${tripsCreated} new trips (${TRIP_DAYS_AHEAD} days ahead).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
