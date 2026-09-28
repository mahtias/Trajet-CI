import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useListExchangeRates, getListExchangeRatesQueryKey } from "@workspace/api-client-react";

/**
 * Display currency for indicative conversions. Prices, amounts sent to the API and payments
 * always stay in FCFA: this only changes how prices are shown.
 */
export type DisplayCurrency = "FCFA" | "EUR" | "USD" | "CNY";
export type ForeignCurrency = Exclude<DisplayCurrency, "FCFA">;

const FOREIGN_CURRENCIES: ForeignCurrency[] = ["EUR", "USD", "CNY"];
const STORAGE_KEY = "trajet-ci-currency";

function readStoredCurrency(): DisplayCurrency {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "EUR" || stored === "USD" || stored === "CNY" ? stored : "FCFA";
  } catch {
    return "FCFA"; // storage unavailable (private mode, blocked cookies…)
  }
}

function storeCurrency(currency: DisplayCurrency) {
  try {
    window.localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // ignore: the choice just won't be remembered
  }
}

interface CurrencyContextValue {
  /** Currency actually used for display: falls back to FCFA when the chosen one has no rate. */
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  /** FCFA plus every foreign currency that has a rate. */
  availableCurrencies: DisplayCurrency[];
  /** FCFA per unit of the currency, or undefined if no rate is set. */
  rateFor: (currency: ForeignCurrency) => number | undefined;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { data: rates } = useListExchangeRates({ query: { queryKey: getListExchangeRatesQueryKey(), staleTime: 10 * 60 * 1000 } });
  const [chosen, setChosen] = useState<DisplayCurrency>(readStoredCurrency);

  const rateMap = useMemo(() => {
    const map = new Map<ForeignCurrency, number>();
    for (const r of rates ?? []) {
      if (Number.isFinite(r.fcfaPerUnit) && r.fcfaPerUnit > 0) map.set(r.currency, r.fcfaPerUnit);
    }
    return map;
  }, [rates]);

  const availableCurrencies = useMemo<DisplayCurrency[]>(
    () => ["FCFA", ...FOREIGN_CURRENCIES.filter((c) => rateMap.has(c))],
    [rateMap],
  );

  // A remembered currency whose rate was removed falls back to FCFA
  const currency: DisplayCurrency = chosen === "FCFA" || rateMap.has(chosen) ? chosen : "FCFA";

  useEffect(() => {
    // Only forget the choice once rates have loaded, not while they're still in flight
    if (rates && chosen !== currency) {
      setChosen("FCFA");
      storeCurrency("FCFA");
    }
  }, [rates, chosen, currency]);

  const setCurrency = useCallback((next: DisplayCurrency) => {
    setChosen(next);
    storeCurrency(next);
  }, []);

  const rateFor = useCallback((c: ForeignCurrency) => rateMap.get(c), [rateMap]);

  const value = useMemo(
    () => ({ currency, setCurrency, availableCurrencies, rateFor }),
    [currency, setCurrency, availableCurrencies, rateFor],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within a CurrencyProvider");
  return context;
}

/** "5 000 FCFA" (grouping follows the interface language). Never rounded: this is the real price. */
export function formatFcfa(amountFcfa: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amountFcfa)} FCFA`;
}

/**
 * Indicative conversion, e.g. "≈ 7,62 €". Returns null when it can't be shown meaningfully
 * (no rate, invalid amount, or a zero price), so callers simply show FCFA instead.
 */
export function formatConverted(amountFcfa: number, currency: ForeignCurrency, rate: number | undefined, locale: string): string | null {
  if (!rate || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(amountFcfa) || amountFcfa <= 0) return null;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const converted = amountFcfa / rate;
  // Tiny amounts would round to "0,00": show "< 0,01" instead
  if (converted < 0.01) return `< ${formatter.format(0.01)}`;
  return `≈ ${formatter.format(converted)}`;
}
