export type ScheduleSpec =
  | { kind: "range"; start: string; end: string; intervalMinutes: number }
  | { kind: "times"; times: string[] };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMMSS(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Expands a schedule spec into concrete "HH:MM:SS" departure times. */
export function expandSchedule(spec: ScheduleSpec): string[] {
  if (spec.kind === "times") {
    return spec.times.map((t) => `${t}:00`);
  }

  const start = toMinutes(spec.start);
  const end = toMinutes(spec.end);
  const times: string[] = [];
  for (let t = start; t < end; t += spec.intervalMinutes) {
    times.push(toHHMMSS(t));
  }
  return times;
}
