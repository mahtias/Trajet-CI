import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useCurrency, formatFcfa, formatConverted } from "@/lib/currency";

interface PriceProps {
  amountFcfa: number;
  /** Unit shown after the main amount, e.g. "/nuit" */
  suffix?: string;
  className?: string;
  suffixClassName?: string;
  /** Classes for the small FCFA line shown under a converted amount */
  fcfaClassName?: string;
  align?: "left" | "right";
}

/**
 * A price. In FCFA it looks exactly like before ("5 000 FCFA"). In another display currency it shows
 * the indicative conversion ("≈ 7,62 €") with the real FCFA price kept visible underneath.
 */
export function Price({ amountFcfa, suffix, className, suffixClassName, fcfaClassName, align = "left" }: PriceProps) {
  const { numberLocale } = useLanguage();
  const { currency, rateFor } = useCurrency();

  const fcfa = formatFcfa(amountFcfa, numberLocale);
  const converted = currency === "FCFA" ? null : formatConverted(amountFcfa, currency, rateFor(currency), numberLocale);
  const suffixNode = suffix && <span className={cn("text-sm text-muted-foreground font-normal", suffixClassName)}>{suffix}</span>;

  if (!converted) {
    return <span className={className}>{fcfa}{suffixNode}</span>;
  }

  return (
    <span className={cn("inline-flex flex-col leading-tight", align === "right" ? "items-end text-right" : "items-start")}>
      <span className={className}>{converted}{suffixNode}</span>
      <span className={cn("text-xs text-muted-foreground font-normal font-mono", fcfaClassName)}>{fcfa}</span>
    </span>
  );
}

interface PaymentAmountProps {
  amountFcfa: number;
  className?: string;
  align?: "left" | "right" | "center";
}

/**
 * Amount actually charged (checkout, booking recap, confirmation). FCFA always comes first and
 * large; a foreign currency only appears as a small indicative line, with a reminder that the
 * payment is made in FCFA.
 */
export function PaymentAmount({ amountFcfa, className, align = "right" }: PaymentAmountProps) {
  const { numberLocale, t } = useLanguage();
  const { currency, rateFor } = useCurrency();
  const converted = currency === "FCFA" ? null : formatConverted(amountFcfa, currency, rateFor(currency), numberLocale);

  return (
    <span className={cn(
      "inline-flex flex-col leading-tight",
      align === "right" ? "items-end text-right" : align === "center" ? "items-center text-center" : "items-start",
    )}>
      <span className={className}>{formatFcfa(amountFcfa, numberLocale)}</span>
      {converted && (
        <>
          <span className="text-sm text-muted-foreground font-normal font-mono">{converted}</span>
          <span className="text-xs text-muted-foreground font-normal font-sans">{t("price.paymentNote")}</span>
        </>
      )}
    </span>
  );
}
