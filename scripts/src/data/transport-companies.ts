import type { ScheduleSpec } from "./schedule";

export interface RouteSpec {
  origin: string;
  destination: string;
  price: number;
  schedule: ScheduleSpec;
}

export interface CompanySpec {
  name: string;
  routes: RouteSpec[];
}

/**
 * Transcribed from "Echantillon d'entreprises Transport CIV.pdf" (20 companies).
 * International legs (Accra, Lomé, Cotonou, N'Zérékoré/Guinée) are intentionally
 * excluded — this seed only covers domestic Côte d'Ivoire routes.
 *
 * Each company's "Départs journaliers" line from the PDF is applied uniformly to
 * all of its routes, except UTB, which the PDF splits into three explicit
 * per-route-group schedules — Katiola and Daloa aren't called out in UTB's
 * schedule text, so they fall back to the same 3x/day slot as Man.
 */
export const TRANSPORT_COMPANIES: CompanySpec[] = [
  {
    name: "UTB",
    routes: [
      { origin: "Abidjan", destination: "Yamoussoukro", price: 4000, schedule: { kind: "range", start: "06:00", end: "19:00", intervalMinutes: 30 } },
      { origin: "Abidjan", destination: "Bouaké", price: 5000, schedule: { kind: "range", start: "06:00", end: "19:00", intervalMinutes: 30 } },
      { origin: "Abidjan", destination: "Korhogo", price: 9000, schedule: { kind: "times", times: ["07:00", "10:00", "14:00", "18:00"] } },
      { origin: "Abidjan", destination: "San-Pédro", price: 11500, schedule: { kind: "times", times: ["07:00", "10:00", "14:00", "18:00"] } },
      { origin: "Abidjan", destination: "Man", price: 10800, schedule: { kind: "times", times: ["07:00", "12:00", "16:00"] } },
      { origin: "Abidjan", destination: "Katiola", price: 7500, schedule: { kind: "times", times: ["07:00", "12:00", "16:00"] } },
      { origin: "Abidjan", destination: "Daloa", price: 7200, schedule: { kind: "times", times: ["07:00", "12:00", "16:00"] } },
    ],
  },
  {
    name: "UTRAKO",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4200],
        ["Abidjan", "Bouaké", 5200],
        ["Abidjan", "Katiola", 7300],
        ["Abidjan", "Korhogo", 8800],
        ["Abidjan", "Ferkessédougou", 10200],
        ["Abidjan", "Daloa", 7500],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["07:30", "08:00", "14:00", "19:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTNA",
    routes: (
      [
        ["Abidjan", "Daloa", 7000],
        ["Abidjan", "Duékoué", 9200],
        ["Abidjan", "Man", 10500],
        ["Abidjan", "Guiglo", 11000],
        ["Abidjan", "San-Pédro", 11800],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["06:30", "10:00", "15:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTD",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4100],
        ["Abidjan", "Bouaflé", 5800],
        ["Abidjan", "Daloa", 6800],
        ["Abidjan", "Duékoué", 9000],
        ["Abidjan", "San-Pédro", 11200],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "range", start: "06:00", end: "17:00", intervalMinutes: 120 } as ScheduleSpec,
    })),
  },
  {
    name: "UTS",
    routes: (
      [
        ["Abidjan", "Gagnoa", 5500],
        ["Abidjan", "Soubré", 8300],
        ["Abidjan", "San-Pédro", 11000],
        ["Daloa", "San-Pédro", 4500],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["07:00", "11:00", "16:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTY",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 3800],
        ["Yamoussoukro", "Bouaké", 2200],
        ["Yamoussoukro", "Daloa", 3500],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "range", start: "06:00", end: "18:00", intervalMinutes: 30 } as ScheduleSpec,
    })),
  },
  {
    name: "UTM",
    routes: (
      [
        ["Abidjan", "Daloa", 7100],
        ["Abidjan", "Duékoué", 9100],
        ["Abidjan", "Man", 10600],
        ["Abidjan", "Danané", 11900],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["06:45", "12:00", "16:30"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTBG",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4000],
        ["Abidjan", "Bouaflé", 5600],
        ["Bouaflé", "Daloa", 3200],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "range", start: "07:00", end: "17:00", intervalMinutes: 120 } as ScheduleSpec,
    })),
  },
  {
    name: "UTG",
    routes: (
      [
        ["Abidjan", "Gagnoa", 5300],
        ["Gagnoa", "Soubré", 3100],
        ["Gagnoa", "San-Pédro", 6000],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["06:00", "09:00", "14:00", "17:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTF",
    routes: (
      [
        ["Abidjan", "Korhogo", 9100],
        ["Abidjan", "Ferkessédougou", 10500],
        ["Ferkessédougou", "Tengrela", 2800],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["08:00", "15:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTT",
    routes: (
      [
        ["Abidjan", "Korhogo", 9200],
        ["Abidjan", "Ferkessédougou", 10400],
        ["Abidjan", "Tengrela", 11300],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["09:00", "16:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTDK",
    routes: (
      [
        ["Abidjan", "Daloa", 7100],
        ["Abidjan", "Duékoué", 8900],
        ["Duékoué", "Man", 2700],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["06:30", "11:30", "16:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "UTSS",
    routes: (
      [
        ["Abidjan", "Gagnoa", 5400],
        ["Abidjan", "Soubré", 8200],
        ["Soubré", "San-Pédro", 3300],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["07:00", "12:00", "17:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "SAMA Transport",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4300],
        ["Abidjan", "Bouaké", 5400],
        ["Abidjan", "Korhogo", 9300],
        ["Abidjan", "Daloa", 7400],
        ["Abidjan", "San-Pédro", 11700],
        ["Abidjan", "Man", 10900],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "range", start: "06:00", end: "18:00", intervalMinutes: 60 } as ScheduleSpec,
    })),
  },
  {
    name: "STM",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4500],
        ["Abidjan", "Bouaké", 5600],
        ["Abidjan", "Korhogo", 9500],
        ["Abidjan", "San-Pédro", 12000],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "range", start: "06:00", end: "19:00", intervalMinutes: 45 } as ScheduleSpec,
    })),
  },
  {
    name: "SOTRACO",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4400],
        ["Abidjan", "Daloa", 7300],
        ["Abidjan", "Man", 10700],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["06:30", "10:00", "14:00", "17:30"] } as ScheduleSpec,
    })),
  },
  {
    name: "Trans Bouaké",
    routes: (
      [
        ["Abidjan", "Yamoussoukro", 4100],
        ["Abidjan", "Bouaké", 5100],
        ["Bouaké", "Korhogo", 4000],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "range", start: "06:00", end: "18:00", intervalMinutes: 30 } as ScheduleSpec,
    })),
  },
  {
    name: "Trans Korhogo",
    routes: (
      [
        ["Abidjan", "Bouaké", 5300],
        ["Abidjan", "Korhogo", 8900],
        ["Abidjan", "Ferkessédougou", 10300],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["07:00", "13:00", "18:00"] } as ScheduleSpec,
    })),
  },
  {
    name: "West Trans CI",
    routes: (
      [
        ["Abidjan", "Daloa", 7200],
        ["Abidjan", "Man", 10800],
        ["Abidjan", "Guiglo", 11100],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["07:15", "12:45", "16:15"] } as ScheduleSpec,
    })),
  },
  {
    name: "San-Pédro Express",
    routes: (
      [
        ["Abidjan", "Gagnoa", 5600],
        ["Abidjan", "Soubré", 8400],
        ["Abidjan", "San-Pédro", 11300],
      ] as const
    ).map(([origin, destination, price]) => ({
      origin,
      destination,
      price,
      schedule: { kind: "times", times: ["08:00", "14:00"] } as ScheduleSpec,
    })),
  },
];
