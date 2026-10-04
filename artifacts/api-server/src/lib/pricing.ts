import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, platformSettingsTable, type PlatformSettings } from "@workspace/db";
import { logger } from "./logger";

/** Notice given to the companies before a new commission rate applies. */
export const COMMISSION_NOTICE_DAYS = 7;

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
    // Announced change not in force yet (null when none)
    pendingCommissionPercent: row.commissionPercentPending !== null ? parseFloat(row.commissionPercentPending) : null,
    effectiveAt: row.commissionEffectiveAt ? row.commissionEffectiveAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The single settings row (id = 1), created with the defaults (5 %, 400 FCFA, 60 %) if missing.
 * An announced commission change whose date has passed is applied here, on the fly: every price
 * computation goes through this, so no scheduled job is needed.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  let [row] = await db.select().from(platformSettingsTable).limit(1);
  if (!row) {
    await db.insert(platformSettingsTable).values({ id: 1 }).onConflictDoNothing();
    [row] = await db.select().from(platformSettingsTable).limit(1);
  }
  if (row.commissionPercentPending !== null && row.commissionEffectiveAt && row.commissionEffectiveAt.getTime() <= Date.now()) {
    // Conditional update: only one concurrent request applies it, the others just read the result
    const [applied] = await db.update(platformSettingsTable).set({
      commissionPercent: row.commissionPercentPending,
      commissionPercentPending: null,
      commissionEffectiveAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(platformSettingsTable.id, 1),
      isNotNull(platformSettingsTable.commissionPercentPending),
      lte(platformSettingsTable.commissionEffectiveAt, new Date()),
    )).returning();
    if (applied) {
      logger.info({ from: row.commissionPercent, to: applied.commissionPercent }, "Announced commission rate now in force");
      return applied;
    }
    [row] = await db.select().from(platformSettingsTable).limit(1);
  }
  return row;
}

export async function getPricingSettings(): Promise<PricingSettings> {
  const s = formatSettings(await getPlatformSettings());
  return { commissionPercent: s.commissionPercent, seatSelectionFee: s.seatSelectionFee, seatSelectionPlatformPercent: s.seatSelectionPlatformPercent };
}
