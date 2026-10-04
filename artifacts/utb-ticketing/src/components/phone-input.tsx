import * as React from "react";
import { ChevronDown } from "lucide-react";
// Only these flags are bundled (named imports, ~250 bytes each): an emoji flag is not drawn everywhere
// (letters on Windows, empty boxes without an emoji font), and these are the most used countries
import { CI, BF, ML, GN, LR, GH, SN, TG, BJ, NE, NG, GM, GW, SL, CV, MR, CM, FR } from "country-flag-icons/string/3x2";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
  DEFAULT_COUNTRY,
  callingCode,
  countryOptions,
  flagEmoji,
  formatNational,
  maxNationalDigits,
  splitPhone,
  toE164,
  type CountryCode,
} from "@/lib/phone";

const FLAG_SVG: Partial<Record<CountryCode, string>> = { CI, BF, ML, GN, LR, GH, SN, TG, BJ, NE, NG, GM, GW, SL, CV, MR, CM, FR };

/** Drawn flag for the main countries, emoji for the others (fine on phones). */
function Flag({ country }: { country: CountryCode }) {
  const svg = FLAG_SVG[country];
  if (!svg) return <span aria-hidden="true" className="text-xl leading-none">{flagEmoji(country)}</span>;
  return <img aria-hidden="true" alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} className="h-4 w-6 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.1)]" />;
}

type InputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">;

export interface PhoneInputProps extends InputProps {
  /** Full number, E.164 without spaces ("+2250700000001"), or "" */
  value: string | null | undefined;
  onChange: (e164: string) => void;
  /** Label of the country picker for screen readers */
  countryLabel?: string;
}

/**
 * Phone number with its country shown apart (flag + calling code, Côte d'Ivoire by default): the person
 * types only the local number, shown grouped ("07 00 00 00 01"), and the form receives the full E.164
 * number. Pasting a full "+…" number also works: the country follows it.
 * The country picker is the native <select> (the phone's own picker on mobile), laid over the flag.
 * Props such as id / aria-* (from FormControl) go to the number input.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, countryLabel = "Indicatif pays", className, disabled, ...inputProps }, ref) => {
    const { language } = useLanguage();
    const [country, setCountry] = React.useState<CountryCode>(() => splitPhone(value).country);
    const [digits, setDigits] = React.useState(() => splitPhone(value).digits);
    // Last value sent up: a different incoming value comes from outside (form reset, default value)
    const emitted = React.useRef(value ?? "");

    React.useEffect(() => {
      if ((value ?? "") === emitted.current) return;
      const next = splitPhone(value);
      emitted.current = value ?? "";
      setCountry(next.country);
      setDigits(next.digits);
    }, [value]);

    const options = React.useMemo(() => countryOptions(language), [language]);

    const emit = (nextDigits: string, nextCountry: CountryCode) => {
      setDigits(nextDigits);
      setCountry(nextCountry);
      const e164 = toE164(nextDigits, nextCountry);
      emitted.current = e164;
      onChange(e164);
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Full international number typed or pasted: take its country
      if (/^\s*(\+|00)/.test(raw)) {
        const parsed = splitPhone(raw);
        emit(parsed.digits.slice(0, maxNationalDigits(parsed.country)), parsed.country);
        return;
      }
      emit(raw.replace(/\D/g, "").slice(0, maxNationalDigits(country)), country);
    };

    const handleCountry = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as CountryCode;
      emit(digits.slice(0, maxNationalDigits(next)), next);
    };

    const optionLabel = (c: CountryCode) => `${flagEmoji(c)} ${options.name(c)} (+${callingCode(c)})`;

    return (
      <div
        className={cn(
          "flex h-12 w-full items-stretch rounded-md border border-input bg-background text-base shadow-sm transition-colors md:text-sm",
          "focus-within:ring-1 focus-within:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <div className="relative flex shrink-0 items-center gap-1.5 border-r border-input pl-3 pr-2 text-foreground">
          <Flag country={country} />
          <span aria-hidden="true" className="font-medium tabular-nums">+{callingCode(country)}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <select
            aria-label={countryLabel}
            value={country}
            disabled={disabled}
            onChange={handleCountry}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {options.first.map((c) => <option key={c} value={c}>{optionLabel(c)}</option>)}
            <option disabled>──────────</option>
            {options.others.map((c) => <option key={c} value={c}>{optionLabel(c)}</option>)}
          </select>
        </div>
        <input
          ref={ref}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          placeholder={country === DEFAULT_COUNTRY ? "07 00 00 00 00" : undefined}
          {...inputProps}
          value={formatNational(digits, country)}
          onChange={handleInput}
          className="min-w-0 flex-1 rounded-r-md bg-transparent px-3 py-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
    );
  },
);
PhoneInput.displayName = "PhoneInput";
