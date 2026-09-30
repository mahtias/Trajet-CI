import { pgTable, serial, integer, numeric, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { seatsTable } from "./seats";
import { usersTable } from "./users";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id),
  seatId: integer("seat_id").notNull().references(() => seatsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  passengerName: text("passenger_name").notNull(),
  passengerPhone: text("passenger_phone").notNull(),
  // Total actually paid (fare + platform commission + seat selection fee). The breakdown below is
  // frozen at creation from the platform settings in force at that moment; NULL on tickets created
  // before it existed. Tickets sold before the commission became additive have price = fare + seat fee
  // and company_share = fare - commission; they are kept as they were.
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  farePrice: numeric("fare_price", { precision: 10, scale: 2 }),
  seatSelectionFeePaid: numeric("seat_selection_fee_paid", { precision: 10, scale: 2 }),
  platformCommission: numeric("platform_commission", { precision: 10, scale: 2 }),
  companyShare: numeric("company_share", { precision: 10, scale: 2 }),
  seatFeePlatformShare: numeric("seat_fee_platform_share", { precision: 10, scale: 2 }),
  seatFeeCompanyShare: numeric("seat_fee_company_share", { precision: 10, scale: 2 }),
  // Automatic transfer of the company's share to its PayDunya account, once the ticket is paid.
  // not_configured (company has no PayDunya account) | pending | success | failed;
  // NULL = no transfer concerned (not paid online, or sold before this existed)
  companyPayoutStatus: text("company_payout_status"),
  // Gross amount owed to the company on this ticket (company_share + seat_fee_company_share)
  companyPayoutAmount: numeric("company_payout_amount", { precision: 10, scale: 2 }),
  // Taken off this transfer to settle the company's pending clawback, and what was actually sent (gross - clawback)
  companyPayoutClawbackAmount: numeric("company_payout_clawback_amount", { precision: 10, scale: 2 }),
  companyPayoutNetAmount: numeric("company_payout_net_amount", { precision: 10, scale: 2 }),
  companyPayoutTransactionId: text("company_payout_transaction_id"),
  companyPayoutError: text("company_payout_error"),
  companyPayoutAt: timestamp("company_payout_at", { withTimezone: true }),
  qrCode: text("qr_code").notNull().default(""),
  paymentMethod: text("payment_method").notNull().default("orange_money"), // wave | orange_money | mtn_money | moov_money | card
  // pending | paid | failed (cancelled/refused on PayDunya) | expired (hold ran out) | refund_required (paid but seat lost)
  paymentStatus: text("payment_status").notNull().default("pending"),
  // PayDunya invoice token for online purchases, "CASH-…" for counter sales
  paymentId: text("payment_id"),
  validated: boolean("validated").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
  // Cancellation fee tier applied at cancellation (5 or 25 %): the same percentage is kept on the
  // passenger's refund and on the company's share taken back
  cancellationFeePercent: numeric("cancellation_fee_percent", { precision: 5, scale: 2 }),
  // Automatic refund through PayDunya PUSH (disbursement) when the passenger cancels.
  // not_applicable | created (request made, not executed yet) | pending (operator processing) | success | failed
  // | manual_required (card payment or number the API can't pay: to refund by hand)
  refundStatus: text("refund_status").notNull().default("not_applicable"),
  refundDisburseToken: text("refund_disburse_token"),
  refundTransactionId: text("refund_transaction_id"),
  refundFees: numeric("refund_fees", { precision: 10, scale: 2 }), // charged by PayDunya to the platform, never to the passenger
  refundError: text("refund_error"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(ticketsTable).omit({ id: true, createdAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof ticketsTable.$inferSelect;
