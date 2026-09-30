import { eq, sql } from "drizzle-orm";
import { db, ticketsTable } from "@workspace/db";
import { logger } from "./logger";
import { getPaydunyaConfig, creditCompanyAccount } from "./paydunya";
import { afterCancellationFee } from "./pricing";

/**
 * Transfers the company's share of a paid ticket to the company's PayDunya account.
 * Amount = what the company is owed on this ticket, as frozen at sale: company_share (its full fare)
 * + seat_fee_company_share (its part of the seat selection fee). Never recomputed.
 *
 * Clawback: when the company has a pending_clawback (shares already paid for tickets cancelled since,
 * minus the cancellation fee percentage it keeps, like the platform), it is taken off this transfer first, up to the amount of this sale: net = gross - min(clawback, gross),
 * never negative. What is left of the clawback waits for the next sale. The ticket records the gross
 * (company_payout_amount), the part withheld (company_payout_clawback_amount) and what was sent (company_payout_net_amount).
 * If the transfer fails, the withheld part goes back to the company's pending_clawback.
 *
 * Never throws and never touches the ticket's payment: the passenger keeps a paid, valid ticket
 * whatever happens here. The outcome is recorded on the ticket (company_payout_*) so a failed or
 * not configured transfer is visible to the super admin, who handles it by hand for now.
 */
export async function payCompanyShare(ticketId: number): Promise<void> {
  try {
    // Claim the payout once: webhooks can be replayed or arrive twice at the same time
    const { rows: [claim] } = await db.execute(sql`
      UPDATE tickets tk SET
        company_payout_status = CASE WHEN nullif(trim(c.paydunya_account_alias), '') IS NULL THEN 'not_configured' ELSE 'pending' END,
        company_payout_amount = tk.company_share + coalesce(tk.seat_fee_company_share, 0),
        company_payout_at = now()
      FROM trips tr, routes r, companies c
      WHERE tk.id = ${ticketId} AND tr.id = tk.trip_id AND r.id = tr.route_id AND c.id = r.company_id
        AND tk.payment_status = 'paid' AND tk.company_payout_status IS NULL AND tk.company_share IS NOT NULL
      RETURNING tk.company_payout_status AS status, tk.company_payout_amount AS amount,
                trim(c.paydunya_account_alias) AS alias, c.id AS company_id
    `) as any;
    if (!claim) return; // already handled, or nothing to transfer

    if (claim.status === "not_configured") {
      logger.warn({ ticketId, companyId: claim.company_id, amount: claim.amount }, "Company has no PayDunya account: payout to do by hand");
      return;
    }

    const gross = Math.round(parseFloat(claim.amount));
    // Withhold the company's pending clawback, up to this sale's amount (company row locked: sales paid
    // at the same time can't use the same balance twice)
    const { withheld, net } = await db.transaction(async (tx) => {
      const { rows: [company] } = await tx.execute(sql`SELECT pending_clawback FROM companies WHERE id = ${claim.company_id} FOR UPDATE`) as any;
      const withheld = Math.min(Math.max(Math.round(parseFloat(company?.pending_clawback ?? "0")), 0), gross);
      if (withheld > 0) {
        await tx.execute(sql`UPDATE companies SET pending_clawback = pending_clawback - ${withheld} WHERE id = ${claim.company_id}`);
      }
      await tx.update(ticketsTable)
        .set({ companyPayoutClawbackAmount: String(withheld), companyPayoutNetAmount: String(gross - withheld) })
        .where(eq(ticketsTable.id, ticketId));
      return { withheld, net: gross - withheld };
    });

    try {
      // Nothing to send when the whole sale went to the clawback (never a 0 or negative transfer)
      const transactionId = net > 0 ? (await creditCompanyAccount(getPaydunyaConfig(), claim.alias, net)).transactionId : "";
      await db.transaction(async (tx) => {
        const [done] = await tx.update(ticketsTable)
          .set({ companyPayoutStatus: "success", companyPayoutTransactionId: transactionId || null, companyPayoutError: null, companyPayoutAt: new Date() })
          .where(eq(ticketsTable.id, ticketId))
          .returning({ cancelledAt: ticketsTable.cancelledAt, feePercent: ticketsTable.cancellationFeePercent });
        // Cancelled while the transfer was in flight: the cancellation didn't see "success", take the
        // share back now, with the fee percentage recorded at cancellation (same as the passenger's)
        if (done?.cancelledAt) {
          const takenBack = afterCancellationFee(gross, parseFloat(done.feePercent ?? "0"));
          await tx.execute(sql`UPDATE companies SET pending_clawback = pending_clawback + ${takenBack} WHERE id = ${claim.company_id}`);
        }
      });
      logger.info({ ticketId, companyId: claim.company_id, gross, withheld, net, transactionId }, net > 0 ? "Company payout sent" : "Company payout fully withheld for clawback");
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      logger.error({ ticketId, companyId: claim.company_id, gross, net, reason: message }, "Company payout failed: to retry by hand");
      await db.transaction(async (tx) => {
        // Nothing was sent: the withheld part is owed again by the company
        if (withheld > 0) await tx.execute(sql`UPDATE companies SET pending_clawback = pending_clawback + ${withheld} WHERE id = ${claim.company_id}`);
        await tx.update(ticketsTable)
          .set({ companyPayoutStatus: "failed", companyPayoutError: message, companyPayoutAt: new Date(), companyPayoutClawbackAmount: "0", companyPayoutNetAmount: null })
          .where(eq(ticketsTable.id, ticketId));
      });
    }
  } catch (err) {
    // Database problem: the ticket may stay "pending" (listed for the super admin as well)
    logger.error({ err, ticketId }, "Company payout could not be recorded");
  }
}
