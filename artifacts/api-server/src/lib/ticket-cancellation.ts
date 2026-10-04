import { eq, and, isNull, sql } from "drizzle-orm";
import { db, ticketsTable, seatsTable, type Ticket } from "@workspace/db";
import { afterCancellationFee } from "./pricing";
import { initialRefundState } from "./refunds";

/**
 * How a paid ticket is cancelled:
 * - feePercent: kept by the platform AND by the company on their shares (same percentage for both).
 *   Passenger's own cancellation: 5 or 25 % depending on the time left. Service stopped by the platform
 *   (company suspended): 0 %, nothing is kept.
 * - refundAmount: what the passenger gets back (whole FCFA).
 */
export interface CancellationPolicy {
  feePercent: number;
  refundAmount: number;
}

export interface CancelledTicket {
  ticket: Ticket;
  refundAmount: number;
  /** Initial refund state: "created" = automatic refund to start with startRefund() */
  refundStatus: string;
  /** Added to the company's pending_clawback (its share was already transferred) */
  clawback: number;
}

/**
 * Cancels a paid ticket in one transaction: records the refund to make, takes back the company's share
 * if it was already transferred (gross payout minus feePercent), frees the seat. Only the first
 * cancellation goes through (null if the ticket was already cancelled). Doesn't call PayDunya: the caller
 * starts the refund afterwards (startRefund), so the cancellation stands whatever PayDunya answers.
 * A transfer still in flight takes the share back itself, with the feePercent recorded here (company-payout.ts).
 */
export async function cancelPaidTicket(ticket: Ticket, policy: CancellationPolicy): Promise<CancelledTicket | null> {
  const refund = await initialRefundState(ticket, policy.refundAmount);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(ticketsTable)
      .set({
        cancelledAt: new Date(),
        cancellationFeePercent: String(policy.feePercent),
        refundAmount: String(policy.refundAmount),
        refundStatus: refund.status,
        refundError: refund.error,
      })
      .where(and(eq(ticketsTable.id, ticket.id), isNull(ticketsTable.cancelledAt)))
      .returning();
    if (!row) return null;

    let clawback = 0;
    if (row.companyPayoutStatus === "success") {
      clawback = afterCancellationFee(parseFloat(row.companyPayoutAmount ?? "0"), policy.feePercent);
      await tx.execute(sql`
        UPDATE companies SET pending_clawback = pending_clawback + ${clawback}
        WHERE id = (SELECT r.company_id FROM trips tr JOIN routes r ON r.id = tr.route_id WHERE tr.id = ${row.tripId})
      `);
    }

    await tx
      .update(seatsTable)
      .set({ status: "available", reservedAt: null, passengerName: null, passengerPhone: null })
      .where(eq(seatsTable.id, row.seatId));
    return { ticket: row, refundAmount: policy.refundAmount, refundStatus: refund.status, clawback };
  });
}
