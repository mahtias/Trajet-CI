import { eq, and, gte, inArray } from "drizzle-orm";
import { db, companiesTable, routesTable, tripsTable, ticketsTable, type Ticket } from "@workspace/db";
import { logger } from "./logger";
import { cancelPaidTicket } from "./ticket-cancellation";
import { startRefund } from "./refunds";

/**
 * Suspension of a whole bus company by the super admin. The platform stops the service, so:
 * - every future trip of the company is cancelled (past trips and their tickets are never touched);
 * - every paid, unused ticket on them is cancelled with a 100 % refund (service fee included: the
 *   service was never given), through the same cancellation + PayDunya refund as a passenger's own
 *   cancellation, with a 0 % fee instead of the 5 / 25 % tiers;
 * - a share already transferred to the company is taken back in full (pending_clawback);
 * - purchases still being paid are stopped (expired; a payment completing later becomes refund_required).
 */

/** Departure as the rest of the app reads it (date + time, server time). */
function departureAt(trip: { departureDate: string; departureTime: string }): Date {
  return new Date(`${trip.departureDate}T${trip.departureTime}`);
}

/** trips.cancelled_reason of the trips a suspension cancels: they can never be made active again. */
export const TRIP_CANCELLED_BY_SUSPENSION = "company_suspension";

export async function isCompanySuspended(companyId: number): Promise<boolean> {
  const [company] = await db.select({ status: companiesTable.status }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  return company?.status === "suspended";
}

/** Active trips of the company that haven't left yet. */
async function futureTrips(companyId: number) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const rows = await db
    .select({ id: tripsTable.id, departureDate: tripsTable.departureDate, departureTime: tripsTable.departureTime })
    .from(tripsTable)
    .innerJoin(routesTable, eq(tripsTable.routeId, routesTable.id))
    .where(and(eq(routesTable.companyId, companyId), eq(tripsTable.status, "active"), gte(tripsTable.departureDate, yesterday)));
  const now = Date.now();
  return rows.filter((t) => departureAt(t).getTime() > now);
}

/** Paid tickets refunded by a suspension: not cancelled already, not used at boarding. */
const isRefundable = (t: Ticket) => t.paymentStatus === "paid" && !t.cancelledAt && !t.validated;
const transferredShare = (t: Ticket) => (t.companyPayoutStatus === "success" ? Math.round(parseFloat(t.companyPayoutAmount ?? "0")) : 0);

export interface SuspensionPreview {
  futureTrips: number;
  ticketsToRefund: number;
  refundTotal: number;
  clawbackTotal: number;
  pendingPurchases: number;
  validatedTicketsKept: number;
}

/** What a suspension would do right now, for the confirmation dialog. Changes nothing. */
export async function previewCompanySuspension(companyId: number): Promise<SuspensionPreview> {
  const trips = await futureTrips(companyId);
  const tickets = trips.length ? await db.select().from(ticketsTable).where(inArray(ticketsTable.tripId, trips.map((t) => t.id))) : [];
  const refundable = tickets.filter(isRefundable);
  return {
    futureTrips: trips.length,
    ticketsToRefund: refundable.length,
    refundTotal: refundable.reduce((sum, t) => sum + Math.round(parseFloat(t.price)), 0),
    clawbackTotal: refundable.reduce((sum, t) => sum + transferredShare(t), 0),
    pendingPurchases: tickets.filter((t) => t.paymentStatus === "pending").length,
    validatedTicketsKept: tickets.filter((t) => t.paymentStatus === "paid" && !t.cancelledAt && t.validated).length,
  };
}

export interface SuspendedTicket {
  ticketId: number;
  tripId: number;
  refundAmount: number;
  refundStatus: string;
  clawback: number;
}

export interface SuspensionSummary {
  tripsCancelled: number;
  ticketsRefunded: number;
  refundTotal: number;
  clawbackTotal: number;
  pendingPurchasesCancelled: number;
  validatedTicketsKept: number;
  /** Refund outcomes: paid, still processed by the operator, and to do by hand (PayDunya refused / card / foreign number) */
  refundsByStatus: { success: number; pending: number; failed: number; manualRequired: number };
  tickets: SuspendedTicket[];
}

/** Refunds run a few at a time: PayDunya calls take seconds each, and must not all fire at once. */
const REFUND_CONCURRENCY = 5;

/**
 * Cascade of a suspension (the company row is already marked suspended by the caller, so no new sale
 * can start meanwhile). Each step only acts on what is still active / uncancelled: safe to run again.
 */
export async function runSuspensionCascade(companyId: number, logContext: Record<string, unknown>): Promise<SuspensionSummary> {
  const trips = await futureTrips(companyId);
  const tripIds = trips.map((t) => t.id);
  const summary: SuspensionSummary = {
    tripsCancelled: 0, ticketsRefunded: 0, refundTotal: 0, clawbackTotal: 0,
    pendingPurchasesCancelled: 0, validatedTicketsKept: 0,
    refundsByStatus: { success: 0, pending: 0, failed: 0, manualRequired: 0 }, tickets: [],
  };
  if (tripIds.length === 0) return summary;

  const cancelledTrips = await db.update(tripsTable).set({ status: "cancelled", cancelledReason: TRIP_CANCELLED_BY_SUSPENSION })
    .where(and(inArray(tripsTable.id, tripIds), eq(tripsTable.status, "active")))
    .returning({ id: tripsTable.id });
  summary.tripsCancelled = cancelledTrips.length;
  logger.warn({ ...logContext, tripIds: cancelledTrips.map((t) => t.id) }, "Company suspension: future trips cancelled");

  // Purchases in progress can't complete into a valid ticket any more (see applyPaymentOutcome)
  const expired = await db.update(ticketsTable).set({ paymentStatus: "expired" })
    .where(and(inArray(ticketsTable.tripId, tripIds), eq(ticketsTable.paymentStatus, "pending")))
    .returning({ id: ticketsTable.id });
  summary.pendingPurchasesCancelled = expired.length;

  const tickets = await db.select().from(ticketsTable).where(inArray(ticketsTable.tripId, tripIds));
  summary.validatedTicketsKept = tickets.filter((t) => t.paymentStatus === "paid" && !t.cancelledAt && t.validated).length;

  // 100 %: the whole price (fare + seat fee + service fee), nothing kept by the platform nor the company
  const cancelled = [];
  for (const ticket of tickets.filter(isRefundable)) {
    const done = await cancelPaidTicket(ticket, { feePercent: 0, refundAmount: Math.round(parseFloat(ticket.price)) });
    if (done) cancelled.push(done);
  }

  for (let i = 0; i < cancelled.length; i += REFUND_CONCURRENCY) {
    await Promise.all(cancelled.slice(i, i + REFUND_CONCURRENCY).map(async (c) => {
      const refundStatus = c.refundStatus === "created" ? await startRefund(c.ticket.id) : c.refundStatus;
      summary.tickets.push({ ticketId: c.ticket.id, tripId: c.ticket.tripId, refundAmount: c.refundAmount, refundStatus, clawback: c.clawback });
      logger.warn({ ...logContext, ticketId: c.ticket.id, tripId: c.ticket.tripId, refundAmount: c.refundAmount, refundStatus, clawback: c.clawback },
        "Company suspension: ticket refunded in full");
    }));
  }

  summary.tickets.sort((a, b) => a.ticketId - b.ticketId);
  summary.ticketsRefunded = summary.tickets.length;
  summary.refundTotal = summary.tickets.reduce((sum, t) => sum + t.refundAmount, 0);
  summary.clawbackTotal = summary.tickets.reduce((sum, t) => sum + t.clawback, 0);
  for (const t of summary.tickets) {
    const key = t.refundStatus === "manual_required" ? "manualRequired" : t.refundStatus === "success" || t.refundStatus === "pending" ? t.refundStatus : "failed";
    summary.refundsByStatus[key]++;
  }
  return summary;
}
