import type { citiesTable, stationsTable } from "@workspace/db";

export function formatStation(station: typeof stationsTable.$inferSelect, city: typeof citiesTable.$inferSelect) {
  return { id: station.id, name: station.name, cityId: station.cityId, cityName: city.name };
}
