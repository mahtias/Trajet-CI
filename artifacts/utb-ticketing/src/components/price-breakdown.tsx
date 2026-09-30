import { Price, PaymentAmount } from "@/components/price";
import { useLanguage } from "@/hooks/use-language";

interface PriceBreakdownProps {
  farePrice: number;
  /** Platform commission, added on top of the fare ("Frais de service"); 0 or absent = no line */
  serviceFee?: number | null;
  /** Seat selection fee (0 or absent = automatic seat, no line shown) */
  seatSelectionFee?: number | null;
  /** On payment screens the total is shown with PaymentAmount (FCFA first, conversion indicative) */
  paymentTotal?: boolean;
}

/**
 * Fare, "+ Frais de service", optional "+400 FCFA – Choix du siège", then the total:
 * a price is never shown as a bare total.
 * Display only: the server recomputes every amount when the purchase starts.
 */
export function PriceBreakdown({ farePrice, serviceFee, seatSelectionFee, paymentTotal = false }: PriceBreakdownProps) {
  const { t } = useLanguage();
  const service = serviceFee && serviceFee > 0 ? serviceFee : 0;
  const fee = seatSelectionFee && seatSelectionFee > 0 ? seatSelectionFee : 0;
  const total = farePrice + service + fee;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-4">
        <span className="text-muted-foreground">{t("tripDetail.baseFare")}</span>
        <Price amountFcfa={farePrice} align="right" className="font-mono font-semibold" />
      </div>
      {service > 0 && (
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">{t("tripDetail.serviceFee")}</span>
          <span className="font-mono font-semibold flex items-baseline gap-0.5">
            +<Price amountFcfa={service} align="right" className="font-mono font-semibold" />
          </span>
        </div>
      )}
      {fee > 0 && (
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">{t("tripDetail.seatChoiceFee")}</span>
          <span className="font-mono font-semibold flex items-baseline gap-0.5">
            +<Price amountFcfa={fee} align="right" className="font-mono font-semibold" />
          </span>
        </div>
      )}
      <div className="flex justify-between items-center gap-4 pt-3 border-t border-border font-bold text-lg text-primary">
        <span>{t("common.total")}</span>
        {paymentTotal
          ? <PaymentAmount amountFcfa={total} className="font-mono text-xl" />
          : <Price amountFcfa={total} align="right" className="font-mono" />}
      </div>
    </div>
  );
}
