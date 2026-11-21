import { logger } from "./logger";

/**
 * SMSPro Africa "OTP API": https://app.smspro.africa
 *
 *   POST https://app.smspro.africa/api/http/sms/send
 *   Accept: application/json, Content-Type: application/json
 *   { api_token, recipient: "2250700000001" (country code, no "+"), sender_id (≤ 11 chars), type: "otp", message }
 *   → { status: "success", data: … }  or  { status: "error", message: "…" } (possibly with HTTP 200)
 *
 * Configuration (environment):
 *   SMSPRO_API_TOKEN                                  – API token of the SMSPro account
 *   SMSPRO_SENDER_ID (optional, default "ChapVoyage") – sender name approved by the operators (max 11 letters, digits or spaces)
 *   SMSPRO_API_BASE_URL (optional, local tests only)  – overrides https://app.smspro.africa (fake SMSPro). Never in production.
 *
 * The token travels in the request BODY: neither the body nor the token is ever logged or put in an error message.
 */
export interface SmsProConfig {
  apiToken: string;
  senderId: string;
  baseUrl: string;
}

export class SmsProConfigError extends Error {}

/** SMSPro refused the message, answered something unreadable, or couldn't be reached. */
export class SmsProApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, null when no answer came back (network error, timeout) */
    readonly httpStatus: number | null,
    /** "message" field of SMSPro's error answer (e.g. "You have exceeded your sending limit."), token removed */
    readonly providerMessage: string | null,
  ) {
    super(message);
  }
}

const DEFAULT_SENDER_ID = "ChapVoyage";
const TIMEOUT_MS = 15_000;

/** Throws SmsProConfigError saying what's missing or wrong, so the problem is obvious in logs. */
export function getSmsProConfig(): SmsProConfig {
  const apiToken = process.env.SMSPRO_API_TOKEN?.trim();
  if (!apiToken) throw new SmsProConfigError("Configuration SMSPro incomplète : SMSPRO_API_TOKEN manquant");
  const senderId = process.env.SMSPRO_SENDER_ID?.trim() || DEFAULT_SENDER_ID;
  if (!/^[A-Za-z0-9 ]{1,11}$/.test(senderId)) {
    throw new SmsProConfigError(`SMSPRO_SENDER_ID invalide ("${senderId}") : 11 lettres, chiffres ou espaces au maximum`);
  }
  return {
    apiToken,
    senderId,
    baseUrl: process.env.SMSPRO_API_BASE_URL?.trim().replace(/\/+$/, "") || "https://app.smspro.africa",
  };
}

/** Called once at startup: without SMSPro, Ivorian numbers go to Orange (if configured), then e-mail. */
export function checkSmsProConfigAtStartup() {
  try {
    const config = getSmsProConfig();
    if (process.env.SMSPRO_API_BASE_URL) {
      logger.warn({ baseUrl: config.baseUrl }, "SMSPRO_API_BASE_URL is set: SMSPro calls go to this URL (local tests only, never in production)");
    }
    logger.info({ senderId: config.senderId }, "SMSPro SMS configured");
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, "SMSPro not configured: login codes for Ivorian numbers go to Orange (if configured) or e-mail");
  }
}

/** Removes the token from any text that may end up in a log or an error (in case SMSPro echoes it back). */
function scrub(text: string, token: string): string {
  return text.split(token).join("[REDACTED]");
}

/** SMSPro's "message" field when it's a string, trimmed to a log-friendly length, token removed. */
function providerMessageOf(body: unknown, token: string): string | null {
  const message = body && typeof body === "object" ? (body as { message?: unknown }).message : undefined;
  return typeof message === "string" && message.trim() ? scrub(message.trim(), token).slice(0, 300) : null;
}

/**
 * Sends one login-code SMS to an E.164 number (e.g. +2250700000000). Resolves only when SMSPro answered
 * with HTTP 2xx AND a JSON body whose status is exactly "success" ("data" is never read).
 * Throws SmsProConfigError when the token is missing, SmsProApiError for anything else (error status,
 * unexpected or non-JSON body, HTTP error, network error, no answer within 15 s).
 */
export async function sendOtpSms(phone: string, message: string): Promise<void> {
  const config = getSmsProConfig();
  const recipient = phone.trim().replace(/^\+/, "");

  let response: Response;
  let text: string;
  try {
    // One signal for the request and the body read, so a slow body also counts against the 15 s
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    response = await fetch(`${config.baseUrl}/api/http/sms/send`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ api_token: config.apiToken, recipient, sender_id: config.senderId, type: "otp", message }),
      signal,
    });
    text = await response.text();
  } catch (err) {
    const timedOut = (err as Error).name === "TimeoutError" || (err as Error).name === "AbortError";
    const reason = timedOut ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : scrub((err as Error).message, config.apiToken);
    throw new SmsProApiError(`SMSPro injoignable : ${reason}`, null, null);
  }

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new SmsProApiError(`Réponse SMSPro illisible (HTTP ${response.status}, corps non JSON)`, response.status, null);
  }

  const status = body && typeof body === "object" ? (body as { status?: unknown }).status : undefined;
  if (response.ok && status === "success") return;

  const providerMessage = providerMessageOf(body, config.apiToken);
  const statusLabel = typeof status === "string" ? `"${scrub(status, config.apiToken).slice(0, 40)}"` : status === undefined ? "absent" : typeof status;
  const what = status === "error" ? "Envoi SMS refusé par SMSPro" : `Réponse SMSPro inattendue (status ${statusLabel})`;
  throw new SmsProApiError(`${what} (HTTP ${response.status})${providerMessage ? ` : ${providerMessage}` : ""}`, response.status, providerMessage);
}
