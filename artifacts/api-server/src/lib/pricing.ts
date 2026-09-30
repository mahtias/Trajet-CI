import { db, platformSettingsTable, type PlatformSettings } from "@workspace/db";

/**
 * Ticket price and revenue split. Everything is computed here, on the server, from the trip price
 * in the database and the platform settings in force; nothing is ever taken from the client.
 * FCFA has no subunit: every amount is an integer.
 *
 * One rule for every sale made through the app (online or by a clerk at the counter):
 * the platform commission is ADDED to the fare, never taken out of it. The customer pays
 * fare + commission (+ seat selection fee, online only) and the company always gets its full fare.
 */
export interface PricingSettings {
  commissionPercent: number;
  seatSelectionFee: number;
  seatSelectionPlatformPercent: number;
}

export interface PriceBreakdown {
  farePrice: number;
  seatSelectionFeePaid: number;
  totalPrice: number;
  platformCommission: number;
  companyShare: number;
  seatFeePlatformShare: number;
  seatFeeCompanyShare: number;
}

export function computePriceBreakdown(tripPrice: number, manualSeatSelection: boolean, settings: PricingSettings): PriceBreakdown {
  const farePrice = Math.round(tripPrice);
  const seatSelectionFeePaid = manualSeatSelection ? Math.round(settings.seatSelectionFee) : 0;
  const platformCommission = Math.round((farePrice * settings.commissionPercent) / 100);
  const seatFeePlatformShare = Math.round((seatSelectionFeePaid * settings.seatSelectionPlatformPercent) / 100);
  return {
    farePrice,
    seatSelectionFeePaid,
    totalPrice: farePrice + platformCommission + seatSelectionFeePaid,
    platformCommission,
    companyShare: farePrice,
    seatFeePlatformShare,
    seatFeeCompanyShare: seatSelectionFeePaid - seatFeePlatformShare,
  };
}

/**
 * What a cancellation refund is computed on: fare + seat selection fee. The service fee (platform
 * commission added on top of the fare) is never refunded. Tickets without a breakdown paid no
 * service fee, so their whole price is refundable.
 */
export function refundableBase(ticket: { price: string; farePrice: string | null; seatSelectionFeePaid: string | null }): number {
  if (ticket.farePrice === null) return parseFloat(ticket.price);
  return parseFloat(ticket.farePrice) + parseFloat(ticket.seatSelectionFeePaid ?? "0");
}

const SAME_DAY_FEE_PERCENT = 25;
const ADVANCE_FEE_PERCENT = 5;

/** Cancellation fee tier: 5 % when cancelling 24h or more before departure, 25 % after that. */
export function cancellationFeePercent(hoursUntilDeparture: number): number {
  return hoursUntilDeparture >= 24 ? ADVANCE_FEE_PERCENT : SAME_DAY_FEE_PERCENT;
}

/**
 * What remains of an amount once the cancellation fee is kept, in whole FCFA. The single formula for
 * both sides of a cancellation, with the same percentage: the passenger's refund (on fare + seat fee)
 * and the company's share taken back (so the company keeps the same percentage as the platform).
 */
export function afterCancellationFee(amount: number, feePercent: number): number {
  return Math.round(amount * (1 - feePercent / 100));
}

/** Ticket columns for a breakdown (numeric columns are strings in Drizzle). */
export function breakdownColumns(b: PriceBreakdown) {
  return {
    price: String(b.totalPrice),
    farePrice: String(b.farePrice),
    seatSelectionFeePaid: String(b.seatSelectionFeePaid),
    platformCommission: String(b.platformCommission),
    companyShare: String(b.companyShare),
    seatFeePlatformShare: String(b.seatFeePlatformShare),
    seatFeeCompanyShare: String(b.seatFeeCompanyShare),
  };
}

export function formatSettings(row: PlatformSettings) {
  return {
    commissionPercent: parseFloat(row.commissionPercent),
    seatSelectionFee: parseFloat(row.seatSelectionFee),
    seatSelectionPlatformPercent: parseFloat(row.seatSelectionPlatformPercent),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The single settings row (id = 1), created with the defaults (5 %, 400 FCFA, 60 %) if missing. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [row] = await db.select().from(platformSettingsTable).limit(1);
  if (row) return row;
  await db.insert(platformSettingsTable).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db.select().from(platformSettingsTable).limit(1);
  return created;
}

export async function getPricingSettings(): Promise<PricingSettings> {
  const s = formatSettings(await getPlatformSettings());
  return { commissionPercent: s.commissionPercent, seatSelectionFee: s.seatSelectionFee, seatSelectionPlatformPercent: s.seatSelectionPlatformPercent };
}
