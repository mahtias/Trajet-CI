import { useCurrency, type DisplayCurrency } from "@/lib/currency";
import { useLanguage } from "@/hooks/use-language";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

const LABELS: Record<DisplayCurrency, string> = {
  FCFA: "FCFA",
  EUR: "EUR €",
  USD: "USD $",
  CNY: "CNY ¥",
};

/** Display-currency picker; hidden when no foreign rate is available (only FCFA). */
export function CurrencySelect() {
  const { currency, setCurrency, availableCurrencies } = useCurrency();
  const { t } = useLanguage();

  if (availableCurrencies.length <= 1) return null;

  return (
    <Select value={currency} onValueChange={(v) => setCurrency(v as DisplayCurrency)}>
      <SelectTrigger className="h-8 w-[5.5rem] rounded-full text-xs font-bold bg-muted border-0" aria-label={t("nav.currency")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {availableCurrencies.map((c) => (
          <SelectItem key={c} value={c} className="text-xs font-bold">{LABELS[c]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
