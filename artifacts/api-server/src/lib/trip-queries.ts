import { eq, and, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  tripsTable,
  routesTable,
  companiesTable,
  busesTable,
  stationsTable,
  citiesTable,
  seatsTable,
} from "@workspace/db";

// Stations and cities are joined twice (departure / arrival), so they need aliases.
export const originStation = alias(stationsTable, "origin_station");
export const destinationStation = alias(stationsTable, "destination_station");
export const originCity = alias(citiesTable, "origin_city");
export const destinationCity = alias(citiesTable, "destination_city");

/** "Nom de la gare, Nom de la ville" */
export function formatPlace(station: { name: string }, city: { name: string }): string {
  return `${station.name}, ${city.name}`;
}

/** Routes joined with company + origin/destination station and city. Add .where()/.orderBy() as needed. */
export function selectRoutes() {
  return db
    .select({
      route: routesTable,
      company: companiesTable,
      originStation,
      destinationStation,
      originCity,
      destinationCity,
    })
    .from(routesTable)
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .innerJoin(originStation, eq(routesTable.originStationId, originStation.id))
    .innerJoin(destinationStation, eq(routesTable.destinationStationId, destinationStation.id))
    .innerJoin(originCity, eq(originStation.cityId, originCity.id))
    .innerJoin(destinationCity, eq(destinationStation.cityId, destinationCity.id))
    .$dynamic();
}

export type RouteRow = Awaited<ReturnType<typeof selectRoutes>>[number];

/** Trips joined with route, company, bus, and origin/destination station and city. Add .where()/.orderBy() as needed. */
export function selectTrips() {
  return db
    .select({
      trip: tripsTable,
      route: routesTable,
      company: companiesTable,
      bus: busesTable,
      originStation,
      destinationStation,
      originCity,
      destinationCity,
    })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .innerJoin(companiesTable, eq(routesTable.companyId, companiesTable.id))
    .innerJoin(busesTable, eq(tripsTable.busId, busesTable.id))
    .innerJoin(originStation, eq(routesTable.originStationId, originStation.id))
    .innerJoin(destinationStation, eq(routesTable.destinationStationId, destinationStation.id))
    .innerJoin(originCity, eq(originStation.cityId, originCity.id))
    .innerJoin(destinationCity, eq(destinationStation.cityId, destinationCity.id))
    .$dynamic();
}

export type TripRow = Awaited<ReturnType<typeof selectTrips>>[number];

/** Full trip row for a single trip, or undefined if it doesn't exist. */
export async function getTripDetails(tripId: number): Promise<TripRow | undefined> {
  const [row] = await selectTrips().where(eq(tripsTable.id, tripId)).limit(1);
  return row;
}

/** Text origin/destination for a route or trip row. */
export function routeLabels(row: Pick<RouteRow, "originStation" | "destinationStation" | "originCity" | "destinationCity">) {
  return {
    origin: formatPlace(row.originStation, row.originCity),
    destination: formatPlace(row.destinationStation, row.destinationCity),
  };
}

/** Company id for the given trip, or null if the trip doesn't exist. */
export async function getTripCompanyId(tripId: number): Promise<number | null> {
  const [result] = await db
    .select({ companyId: routesTable.companyId })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .where(eq(tripsTable.id, tripId))
    .limit(1);
  return result?.companyId ?? null;
}

/**
 * True if the bus is already assigned to another active trip at the same date and time.
 * Simple overlap check (exact date + time) for now.
 */
export async function isBusBusy(
  busId: number,
  departureDate: string,
  departureTime: string,
  excludeTripId?: number,
): Promise<boolean> {
  const conditions = [
    eq(tripsTable.busId, busId),
    eq(tripsTable.departureDate, departureDate),
    eq(tripsTable.departureTime, departureTime),
    eq(tripsTable.status, "active"),
  ];
  if (excludeTripId !== undefined) conditions.push(ne(tripsTable.id, excludeTripId));

  const [existing] = await db
    .select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(...conditions))
    .limit(1);
  return !!existing;
}

/** Total and available seat counts for a trip. */
export async function getSeatCounts(tripId: number): Promise<{ totalSeats: number; availableSeats: number }> {
  const seatCounts = await db
    .select({ status: seatsTable.status, count: sql<number>`count(*)::int` })
    .from(seatsTable)
    .where(eq(seatsTable.tripId, tripId))
    .groupBy(seatsTable.status);

  return {
    totalSeats: seatCounts.reduce((s, r) => s + r.count, 0),
    availableSeats: seatCounts.find(r => r.status === "available")?.count ?? 0,
  };
}

export function formatTripSummary(row: TripRow, availableSeats: number) {
  return {
    id: row.trip.id,
    ...routeLabels(row),
    departureDate: row.trip.departureDate,
    departureTime: row.trip.departureTime,
    price: parseFloat(row.trip.price),
    companyName: row.company.name,
    availableSeats,
    durationMinutes: row.route.durationMinutes,
  };
}

export function formatTripDetail(row: TripRow, availableSeats: number, totalSeats: number) {
  return {
    ...formatTripSummary(row, availableSeats),
    companyId: row.company.id,
    routeId: row.route.id,
    totalSeats,
    status: row.trip.status,
    busId: row.bus.id,
    busName: row.bus.name,
  };
}
