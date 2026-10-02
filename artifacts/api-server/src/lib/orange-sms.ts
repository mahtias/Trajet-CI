import { logger } from "./logger";

/**
 * Orange "SMS Côte d'Ivoire" API (SMS Africa & Middle East): https://developer.orange.com/apis/sms-ci/api-reference
 * Getting started (same for every country): https://developer.orange.com/apis/sms/getting-started
 *
 *   1. OAuth2 client credentials: POST https://api.orange.com/oauth/v3/token
 *      Authorization: Basic base64(client_id:client_secret), body grant_type=client_credentials
 *      → { token_type: "Bearer", access_token, expires_in: "3600" } (reused until it expires)
 *   2. POST https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2250000/requests
 *      Authorization: Bearer <access_token>
 *      { outboundSMSMessageRequest: { address: "tel:+225…", senderAddress: "tel:+2250000",
 *        senderName?: "…", outboundSMSTextMessage: { message } } } → 201 Created
 *
 * Configuration (environment):
 *   ORANGE_SMS_CLIENT_ID, ORANGE_SMS_CLIENT_SECRET  – from the Orange Developer application
 *   ORANGE_SMS_SENDER_NAME (optional)               – sender name approved by Orange (max 11 letters, digits or spaces)
 *   ORANGE_SMS_API_BASE_URL (optional, local tests only) – overrides https://api.orange.com (fake Orange)
 */
export interface OrangeSmsConfig {
  clientId: string;
  clientSecret: string;
  senderName: string | null;
  baseUrl: string;
}

export class OrangeSmsConfigError extends Error {}
export class OrangeSmsApiError extends Error {}

/** Sender address of the Côte d'Ivoire contract (fixed by Orange, not a real number). */
const CI_SENDER_ADDRESS = "tel:+2250000";

/** Throws OrangeSmsConfigError listing what's missing, so the problem is obvious in logs. */
export function getOrangeSmsConfig(): OrangeSmsConfig {
  const missing = ["ORANGE_SMS_CLIENT_ID", "ORANGE_SMS_CLIENT_SECRET"].filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) throw new OrangeSmsConfigError(`Configuration Orange SMS incomplète : ${missing.join(", ")} manquant(s)`);
  const senderName = process.env.ORANGE_SMS_SENDER_NAME?.trim() || null;
  if (senderName && !/^[A-Za-z0-9 ]{1,11}$/.test(senderName)) {
    throw new OrangeSmsConfigError(`ORANGE_SMS_SENDER_NAME invalide ("${senderName}") : 11 lettres, chiffres ou espaces au maximum`);
  }
  return {
    clientId: process.env.ORANGE_SMS_CLIENT_ID!.trim(),
    clientSecret: process.env.ORANGE_SMS_CLIENT_SECRET!.trim(),
    senderName,
    baseUrl: process.env.ORANGE_SMS_API_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.orange.com",
  };
}

/** Called once at startup: without Orange, Ivorian numbers fall back to e-mail when one is known. */
export function checkOrangeSmsConfigAtStartup() {
  try {
    const config = getOrangeSmsConfig();
    if (process.env.ORANGE_SMS_API_BASE_URL) {
      logger.warn({ baseUrl: config.baseUrl }, "ORANGE_SMS_API_BASE_URL is set: Orange SMS calls go to this URL (local tests only)");
    }
    logger.info({ senderName: config.senderName }, "Orange SMS configured");
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, "Orange SMS not configured: login codes for Ivorian numbers can only go by e-mail");
  }
}

// One token per process, reused until shortly before it expires (Orange: 1 hour)
let cachedToken: { value: string; expiresAt: number; clientId: string } | null = null;

/** Error text from Orange's various error shapes (OAuth, requestError, serviceException, policyException…). */
function orangeErrorDetail(body: any): string | null {
  const exception = body?.requestError?.serviceException ?? body?.requestError?.policyException ?? body?.serviceException ?? body?.policyException;
  return exception?.text ?? body?.error_description ?? body?.description ?? body?.message ?? body?.error ?? null;
}

async function callOrange(url: string, init: RequestInit, what: string): Promise<{ status: number; body: any }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new OrangeSmsApiError(`Orange SMS injoignable (${what}) : ${(err as Error).message}`);
  }
  const body: any = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function getAccessToken(config: OrangeSmsConfig, forceNew = false): Promise<string> {
  if (!forceNew && cachedToken && cachedToken.clientId === config.clientId && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const { status, body } = await callOrange(`${config.baseUrl}/oauth/v3/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "grant_type=client_credentials",
  }, "jeton");
  if (status !== 200 || typeof body?.access_token !== "string") {
    const detail = orangeErrorDetail(body);
    throw new OrangeSmsApiError(`Jeton Orange refusé (${status})${detail ? ` : ${detail}` : ""}`);
  }
  // expires_in comes as a string ("3600"); keep a one-minute margin
  const lifetime = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (lifetime - 60) * 1000, clientId: config.clientId };
  return cachedToken.value;
}

/**
 * Sends one SMS to an E.164 number (e.g. +2250700000000). Resolves once Orange accepted it (201).
 * Throws OrangeSmsConfigError when the keys are missing, OrangeSmsApiError when Orange refuses or can't be reached.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const config = getOrangeSmsConfig();
  const url = `${config.baseUrl}/smsmessaging/v1/outbound/${encodeURIComponent(CI_SENDER_ADDRESS)}/requests`;
  const payload = JSON.stringify({
    outboundSMSMessageRequest: {
      address: `tel:${to}`,
      senderAddress: CI_SENDER_ADDRESS,
      ...(config.senderName ? { senderName: config.senderName } : {}),
      outboundSMSTextMessage: { message },
    },
  });

  const send = async (token: string) => callOrange(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: payload,
  }, "envoi");

  let result = await send(await getAccessToken(config));
  // Token revoked or expired early ("Expired credentials"): one retry with a fresh one
  if (result.status === 401) result = await send(await getAccessToken(config, true));
  if (result.status !== 201) {
    const detail = orangeErrorDetail(result.body);
    throw new OrangeSmsApiError(`Envoi SMS refusé par Orange (${result.status})${detail ? ` : ${detail}` : ""}`);
  }
}
