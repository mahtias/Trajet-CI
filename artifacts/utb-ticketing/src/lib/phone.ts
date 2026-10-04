import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export type { CountryCode };

/** Most users are Ivorian: selected by default. */
export const DEFAULT_COUNTRY: CountryCode = "CI";

/**
 * Order of the country picker: Côte d'Ivoire, then West Africa (ECOWAS + Mauritania, Cameroon), then
 * every other country by name. Neighbours first, since they are the most frequent foreign numbers.
 */
const FIRST_COUNTRIES: CountryCode[] = ["CI", "BF", "ML", "GN", "LR", "GH", "SN", "TG", "BJ", "NE", "NG", "GM", "GW", "SL", "CV", "MR", "CM"];

/** 🇨🇮 from "CI" (regional indicator letters): no image to load, works offline. */
export function flagEmoji(country: CountryCode): string {
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function callingCode(country: CountryCode): string {
  return getCountryCallingCode(country);
}

/** Every supported country, in picker order, with its name in the interface language (browser data, nothing bundled). */
export function countryOptions(language: string): { first: CountryCode[]; others: CountryCode[]; name: (c: CountryCode) => string } {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([language], { type: "region" }); } catch { names = null; }
  const name = (c: CountryCode) => names?.of(c) ?? c;
  const all = getCountries();
  const first = FIRST_COUNTRIES.filter((c) => all.includes(c));
  const others = all.filter((c) => !first.includes(c)).sort((a, b) => name(a).localeCompare(name(b), language));
  return { first, others, name };
}

/** Ivorian numbers are 10 digits; others up to the E.164 maximum. */
export function maxNationalDigits(country: CountryCode): number {
  return country === "CI" ? 10 : 15 - callingCode(country).length;
}

/**
 * How the local number is shown while typing. Côte d'Ivoire: pairs ("07 00 00 00 01", the local habit;
 * libphonenumber would give "07 00 00 0001"). Other countries: their own national format.
 */
export function formatNational(digits: string, country: CountryCode): string {
  if (!digits) return "";
  if (country === "CI") return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
  return new AsYouType(country).input(digits);
}

/**
 * Full number sent to the API, E.164 without spaces: "+2250700000001" for Côte d'Ivoire (+225 and the
 * 10 digits, leading 0 included: what the server expects), "+33612345678" for "06 12 34 56 78" in France.
 * "" when nothing is typed.
 */
export function toE164(digits: string, country: CountryCode): string {
  if (!digits) return "";
  if (country === "CI") return `+225${digits}`;
  return parsePhoneNumberFromString(digits, country)?.number ?? `+${callingCode(country)}${digits.replace(/^0+/, "")}`;
}

/** Country and local digits of a stored number (E.164, or an old local "07 …" format read as Ivorian). */
export function splitPhone(raw: string | null | undefined): { country: CountryCode; digits: string } {
  const value = (raw ?? "").trim();
  if (!value) return { country: DEFAULT_COUNTRY, digits: "" };
  const compact = value.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (compact.startsWith("+225")) return { country: "CI", digits: compact.slice(4) };
  if (!compact.startsWith("+")) return { country: DEFAULT_COUNTRY, digits: compact.slice(0, 10) };
  const parsed = parsePhoneNumberFromString(compact);
  if (parsed?.country) return { country: parsed.country, digits: parsed.nationalNumber };
  return { country: DEFAULT_COUNTRY, digits: compact.replace(/\D/g, "") };
}

/** A stored or typed number normalised to E.164 ("" if empty), e.g. for a form's default value. */
export function normalizePhone(raw: string | null | undefined): string {
  const { country, digits } = splitPhone(raw);
  return toE164(digits, country);
}

/** Validation shared by every phone field (same rule for Ivorian numbers as the server: 10 digits). */
export function isValidPhone(e164: string): boolean {
  if (e164.startsWith("+225")) return /^\+225\d{10}$/.test(e164) && isValidPhoneNumber(e164);
  return isValidPhoneNumber(e164);
}

/** Readable form for messages: "+225 07 00 00 00 01". */
export function formatPhoneForDisplay(e164: string): string {
  const { country, digits } = splitPhone(e164);
  return digits ? `+${callingCode(country)} ${formatNational(digits, country)}` : e164;
}
