/**
 * Estimated trip durations (minutes) per unique city pair, transcribed from
 * general Côte d'Ivoire road-trip knowledge — the source PDF only lists
 * prices/schedules, not durations. Fine-tune per-route via Admin > Lignes
 * once real data is available.
 */
const DURATION_ENTRIES: Array<[string, string, number]> = [
  ["Abidjan", "Yamoussoukro", 150],
  ["Abidjan", "Bouaké", 240],
  ["Abidjan", "Katiola", 300],
  ["Abidjan", "Korhogo", 480],
  ["Abidjan", "Daloa", 300],
  ["Abidjan", "San-Pédro", 360],
  ["Abidjan", "Man", 480],
  ["Abidjan", "Ferkessédougou", 510],
  ["Abidjan", "Duékoué", 420],
  ["Abidjan", "Guiglo", 450],
  ["Abidjan", "Bouaflé", 210],
  ["Abidjan", "Gagnoa", 240],
  ["Abidjan", "Soubré", 300],
  ["Abidjan", "Danané", 510],
  ["Abidjan", "Tengrela", 540],
  ["Yamoussoukro", "Bouaké", 90],
  ["Yamoussoukro", "Daloa", 150],
  ["Bouaflé", "Daloa", 90],
  ["Gagnoa", "Soubré", 90],
  ["Gagnoa", "San-Pédro", 150],
  ["Ferkessédougou", "Tengrela", 60],
  ["Duékoué", "Man", 60],
  ["Soubré", "San-Pédro", 90],
  ["Daloa", "San-Pédro", 210],
  ["Bouaké", "Korhogo", 240],
];

function key(a: string, b: string): string {
  return [a, b].sort().join("|");
}

const DURATIONS_MINUTES: Record<string, number> = Object.fromEntries(
  DURATION_ENTRIES.map(([a, b, minutes]) => [key(a, b), minutes]),
);

export function getRouteDurationMinutes(origin: string, destination: string): number {
  const duration = DURATIONS_MINUTES[key(origin, destination)];
  if (duration === undefined) {
    throw new Error(`No duration estimate for route ${origin} - ${destination}`);
  }
  return duration;
}

/** Every domestic city referenced across the 20 companies' routes. */
export const ALL_DOMESTIC_CITIES: string[] = Array.from(
  new Set(DURATION_ENTRIES.flatMap(([a, b]) => [a, b])),
).sort();
