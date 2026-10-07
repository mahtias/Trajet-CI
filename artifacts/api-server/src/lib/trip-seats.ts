import { eq, inArray } from "drizzle-orm";
import { db, seatsTable, ticketsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Places sold online on a new trip: 1 to the bus capacity (the rest is sold at the company's counter). */
export function checkOnlineSeatsCapacity(value: number, busCapacity: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > busCapacity) {
    return `Les places vendables en ligne doivent être un nombre entier entre 1 et ${busCapacity} (capacité du bus)`;
  }
  return null;
}

/** Seats of a new trip, numbered 1 to count. */
export function newTripSeats(tripId: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({ tripId, seatNumber: i + 1, status: "available" as const }));
}

export class SeatResizeError extends Error {}

/**
 * Brings a trip's seat map to `target` seats, numbered within 1..maxNumber (the bus capacity), inside the
 * caller's transaction (seats locked: no sale can slip in between the check and the change).
 * - Seats sold or reserved are never touched, nor renumbered (their number is on the ticket): the target
 *   can't go below how many there are, and none may sit above maxNumber (smaller bus).
 * - Removing: free seats above maxNumber first, then the highest-numbered free ones. A free seat still
 *   referenced by an old ticket (cancelled, expired…) is kept: deleting it would break that ticket.
 * - Adding: the lowest numbers not in use, so gaps left by earlier changes are filled first.
 * Throws SeatResizeError with a message for the user when it can't be done.
 */
export async function resizeTripSeats(tx: Tx, tripId: number, target: number, maxNumber: number): Promise<void> {
  const seats = await tx.select({ id: seatsTable.id, seatNumber: seatsTable.seatNumber, status: seatsTable.status })
    .from(seatsTable).where(eq(seatsTable.tripId, tripId)).for("update");

  const held = seats.filter((s) => s.status !== "available");
  if (held.length > target) {
    throw new SeatResizeError(`${held.length} place(s) sont déjà vendues ou réservées en ligne sur ce voyage : impossible de descendre en dessous de ${held.length}.`);
  }
  if (held.some((s) => s.seatNumber > maxNumber)) {
    throw new SeatResizeError("Des sièges au-delà de la capacité du nouveau bus sont déjà réservés ou vendus");
  }

  const free = seats.filter((s) => s.status === "available");
  const withHistory = new Set(free.length
    ? (await tx.selectDistinct({ seatId: ticketsTable.seatId }).from(ticketsTable).where(inArray(ticketsTable.seatId, free.map((s) => s.id)))).map((r) => r.seatId)
    : []);
  const droppable = free.filter((s) => !withHistory.has(s.id)).sort((a, b) => b.seatNumber - a.seatNumber);

  const toDrop = new Set<number>();
  // Above the bus capacity: must go (only possible after a change to a smaller bus)
  for (const s of free) if (s.seatNumber > maxNumber) {
    if (withHistory.has(s.id)) throw new SeatResizeError("Des sièges au-delà de la capacité du nouveau bus ont un historique de billets et ne peuvent pas être retirés");
    toDrop.add(s.id);
  }
  let remaining = seats.length - toDrop.size;
  for (const s of droppable) {
    if (remaining <= target) break;
    if (!toDrop.has(s.id)) { toDrop.add(s.id); remaining--; }
  }
  if (remaining > target) {
    throw new SeatResizeError(`Impossible de descendre à ${target} place(s) : certaines places libres gardent l'historique de billets annulés ou expirés. Minimum possible : ${remaining}.`);
  }
  if (toDrop.size > 0) await tx.delete(seatsTable).where(inArray(seatsTable.id, [...toDrop]));

  if (remaining < target) {
    const used = new Set(seats.filter((s) => !toDrop.has(s.id)).map((s) => s.seatNumber));
    const numbers: number[] = [];
    for (let n = 1; n <= maxNumber && numbers.length < target - remaining; n++) if (!used.has(n)) numbers.push(n);
    await tx.insert(seatsTable).values(numbers.map((seatNumber) => ({ tripId, seatNumber, status: "available" as const })));
  }
}
