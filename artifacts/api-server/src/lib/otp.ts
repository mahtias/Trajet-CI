import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

export const OTP_TTL_MINUTES = 10;
/** Wrong codes allowed per issued code; the code is then dropped and a new one must be requested. */
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * HMAC-SHA256 of phone + code, keyed with SESSION_SECRET: a 6-digit code is too small a space for a plain
 * hash (a leaked database could be brute-forced in a second), and the short lifetime makes bcrypt pointless.
 */
export function hashOtp(phone: string, code: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(`${phone}:${code}`).digest("hex");
}

export function otpMatches(storedHash: string, phone: string, code: string): boolean {
  const expected = Buffer.from(hashOtp(phone, code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === expected.length && timingSafeEqual(stored, expected);
}

/** Dev shortcut: the code is returned in the response and nothing is sent. Never in production. */
export function isDevOtpEnabled(): boolean {
  return process.env.ALLOW_DEV_OTP === "true" && process.env.NODE_ENV !== "production";
}

export function checkDevOtpAtStartup() {
  if (process.env.ALLOW_DEV_OTP !== "true") return;
  if (process.env.NODE_ENV === "production") {
    logger.error("CRITICAL: ALLOW_DEV_OTP=true with NODE_ENV=production. Ignored (codes are really sent and never returned), but remove it from the production environment");
  } else {
    logger.warn("ALLOW_DEV_OTP is on: login codes are returned in the API response and no SMS or e-mail is sent (development only)");
  }
}

export type PhoneTarget =
  | { kind: "ci"; e164: string } // Ivorian number: SMS through Orange
  | { kind: "ci_invalid" } // +225 but not the 10 national digits
  | { kind: "foreign" }; // anything else: e-mail only

/**
 * Ivorian = +225 / 00225 followed by 10 digits, or a bare 10-digit national number starting with 0
 * (the format people type locally, e.g. "07 57 90 41 85"). Everything else is treated as foreign.
 */
export function classifyPhone(raw: string): PhoneTarget {
  let compact = raw.replace(/[\s.\-()]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (compact.startsWith("+225")) {
    const national = compact.slice(4);
    return /^\d{10}$/.test(national) ? { kind: "ci", e164: `+225${national}` } : { kind: "ci_invalid" };
  }
  if (/^0\d{9}$/.test(compact)) return { kind: "ci", e164: `+225${compact}` };
  return { kind: "foreign" };
}

/** Same number whatever the spacing or prefix, so "07 57 …" and "+225 0757…" share one rate-limit bucket. */
export function phoneRateKey(raw: string): string {
  const target = classifyPhone(raw);
  return target.kind === "ci" ? target.e164 : raw.replace(/[^\d+]/g, "");
}

/** "jean.dupont@gmail.com" → "je***@gmail.com": enough for the user to recognise it, not to harvest it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***@${domain}`;
}
