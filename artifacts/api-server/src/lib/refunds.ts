import { eq, and, inArray } from "drizzle-orm";
import { db, ticketsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import {
  getPaydunyaConfig,
  getDisburseInvoice,
  submitDisburseInvoice,
  type DisburseState,
} from "./paydunya";

/**
 * Automatic refund of a cancelled ticket through PayDunya API PUSH, to the mobile money the passenger
 * chose at purchase (tickets.payment_method) and the phone number of the buyer's account (users.phone).
 * The passenger receives exactly refund_amount; PayDunya's fees are charged to the platform.
 *
 * Our reference for PayDunya (disburse_id) is "refund-ticket-<ticket id>": one refund per ticket,
 * and PayDunya refuses a duplicate disburse_id, which also guards against paying twice.
 */

const WITHDRAW_MODES: Record<string, string> = {
  orange_money: "orange-money-ci",
  mtn_money: "mtn-ci",
  moov_money: "moov-ci",
  wave: "wave-ci",
};

/** PayDunya withdraw_mode for a payment method; null = no automatic refund (card). */
export function withdrawModeFor(paymentMethod: string): string | null {
  return WITHDRAW_MODES[paymentMethod] ?? null;
}

/** Ivorian number without country code (10 digits), as API PUSH expects; null if it isn't one. */
export function ivorianLocalNumber(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  const local = digits.startsWith("+225") ? digits.slice(4) : digits.startsWith("00225") ? digits.slice(5) : digits;
  return /^0\d{9}$/.test(local) ? local : null;
}

export function refundDisburseId(ticketId: number): string {
  return `refund-ticket-${ticketId}`;
}

export function ticketIdFromDisburseId(disburseId: string | null | undefined): number | null {
  const m = disburseId?.match(/^refund-ticket-(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * Initial refund state decided at cancellation, before any call: nothing to refund, a case to handle
 * by hand (card, number the API can't pay), or "created" = automatic refund to start.
 */
export async function initialRefundState(ticket: { userId: number | null; paymentMethod: string }, refundAmount: number): Promise<{ status: string; error: string | null }> {
  if (refundAmount <= 0) return { status: "not_applicable", error: null };
  if (!withdrawModeFor(ticket.paymentMethod)) {
    return { status: "manual_required", error: "Paiement par carte bancaire : remboursement à faire à la main" };
  }
  const [user] = ticket.userId ? await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, ticket.userId)).limit(1) : [];
  if (!user || !ivorianLocalNumber(user.phone)) {
    return { status: "manual_required", error: `Numéro du compte non ivoirien (${user?.phone ?? "inconnu"}) : remboursement à faire à la main` };
  }
  return { status: "created", error: null };
}

/**
 * Runs the automatic refund of a cancelled ticket whose refund_status is "created" (get-invoice, then
 * submit-invoice). Never throws: the cancellation stays valid whatever happens; the outcome is stored
 * on the ticket (failed + reason when PayDunya refuses or can't be reached). Returns the new status.
 */
export async function startRefund(ticketId: number): Promise<string> {
  try {
    const [row] = await db
      .select({ ticket: ticketsTable, phone: usersTable.phone })
      .from(ticketsTable)
      .leftJoin(usersTable, eq(ticketsTable.userId, usersTable.id))
      .where(eq(ticketsTable.id, ticketId))
      .limit(1);
    if (!row || row.ticket.refundStatus !== "created") return row?.ticket.refundStatus ?? "unknown_ticket";
    const { ticket } = row;
    const amount = Math.round(parseFloat(ticket.refundAmount ?? "0"));
    const withdrawMode = withdrawModeFor(ticket.paymentMethod)!;
    const disburseId = refundDisburseId(ticket.id);

    try {
      const config = getPaydunyaConfig();
      let token = ticket.refundDisburseToken;
      if (!token) {
        ({ disburseToken: token } = await getDisburseInvoice(config, {
          accountAlias: ivorianLocalNumber(row.phone ?? "")!,
          amount,
          withdrawMode,
          callbackUrl: `${config.appPublicUrl}/api/payments/paydunya-refund-webhook`,
          disburseId,
        }));
        await db.update(ticketsTable).set({ refundDisburseToken: token }).where(eq(ticketsTable.id, ticket.id));
      }
      const submitted = await submitDisburseInvoice(config, token, disburseId);
      // Only move forward from "created": the callback may already have recorded the final state
      await db.update(ticketsTable)
        .set({
          refundStatus: submitted.status,
          refundTransactionId: submitted.transactionId,
          refundError: null,
          refundedAt: submitted.status === "success" ? new Date() : null,
        })
        .where(and(eq(ticketsTable.id, ticket.id), eq(ticketsTable.refundStatus, "created")));
      logger.info({ ticketId, amount, withdrawMode, status: submitted.status, transactionId: submitted.transactionId }, "Refund submitted to PayDunya");
      return submitted.status;
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      logger.error({ ticketId, amount, withdrawMode, reason: message }, "Automatic refund failed: to refund by hand");
      await db.update(ticketsTable)
        .set({ refundStatus: "failed", refundError: message })
        .where(and(eq(ticketsTable.id, ticket.id), eq(ticketsTable.refundStatus, "created")));
      return "failed";
    }
  } catch (err) {
    logger.error({ err, ticketId }, "Refund could not be recorded");
    return "failed";
  }
}

/** Applies a state confirmed by PayDunya (check-status). Idempotent; a successful refund is never undone. */
export async function applyDisburseState(ticketId: number, state: DisburseState): Promise<string> {
  if (state.fees !== null) logger.info({ ticketId, fees: state.fees, amount: state.amount }, "PayDunya refund fees (charged to the platform)");
  const common = { refundFees: state.fees !== null ? String(state.fees) : undefined };

  if (state.status === "success") {
    const [t] = await db.update(ticketsTable)
      .set({ ...common, refundStatus: "success", refundTransactionId: state.transactionId, refundError: null, refundedAt: new Date() })
      .where(and(eq(ticketsTable.id, ticketId), inArray(ticketsTable.refundStatus, ["created", "pending", "failed"])))
      .returning({ status: ticketsTable.refundStatus });
    if (!t && common.refundFees) await db.update(ticketsTable).set(common).where(eq(ticketsTable.id, ticketId));
  } else if (state.status === "failed") {
    await db.update(ticketsTable)
      .set({ ...common, refundStatus: "failed", refundError: "Remboursement refusé par l'opérateur (statut PayDunya : failed)" })
      .where(and(eq(ticketsTable.id, ticketId), inArray(ticketsTable.refundStatus, ["created", "pending"])));
  } else if (state.status === "pending") {
    await db.update(ticketsTable)
      .set({ ...common, refundStatus: "pending", refundTransactionId: state.transactionId })
      .where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.refundStatus, "created")));
  }
  const [current] = await db.select({ status: ticketsTable.refundStatus }).from(ticketsTable).where(eq(ticketsTable.id, ticketId)).limit(1);
  return current?.status ?? "unknown_ticket";
}
