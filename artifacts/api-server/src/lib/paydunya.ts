import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

/**
 * PayDunya "Checkout Invoice" (HTTP/JSON API): https://developers.paydunya.com/doc/EN/http_json
 *
 * Configuration (environment):
 *   PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN  – from the PayDunya account (Intégration API)
 *   PAYDUNYA_MODE = test | live                                  – sandbox or production API
 *   APP_PUBLIC_URL                                               – public site URL, e.g. https://chap-voyage.com
 *   PAYDUNYA_API_BASE_URL (optional, local tests only)           – overrides the API base URL (fake PayDunya)
 */
export type PaydunyaMode = "test" | "live";

export interface PaydunyaConfig {
  masterKey: string;
  privateKey: string;
  token: string;
  mode: PaydunyaMode;
  appPublicUrl: string;
  baseUrl: string;
}

export class PaydunyaConfigError extends Error {}
export class PaydunyaApiError extends Error {}

/** The single place that decides sandbox vs production URLs. */
export function paydunyaBaseUrl(mode: PaydunyaMode): string {
  return mode === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1";
}

function readMode(): PaydunyaMode {
  const raw = process.env.PAYDUNYA_MODE?.trim().toLowerCase();
  if (raw === "test" || raw === "live") return raw;
  if (raw) throw new PaydunyaConfigError(`PAYDUNYA_MODE invalide ("${raw}") : utilisez "test" ou "live"`);
  // Never default to real payments by accident: production must say "live" explicitly
  if (process.env.NODE_ENV === "production") throw new PaydunyaConfigError("PAYDUNYA_MODE doit être défini (test ou live) en production");
  return "test";
}

/** Throws PaydunyaConfigError listing what's missing, so the problem is obvious in logs and responses. */
export function getPaydunyaConfig(): PaydunyaConfig {
  const missing = ["PAYDUNYA_MASTER_KEY", "PAYDUNYA_PRIVATE_KEY", "PAYDUNYA_TOKEN", "APP_PUBLIC_URL"].filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) throw new PaydunyaConfigError(`Configuration PayDunya incomplète : ${missing.join(", ")} manquant(s)`);
  const mode = readMode();
  return {
    masterKey: process.env.PAYDUNYA_MASTER_KEY!.trim(),
    privateKey: process.env.PAYDUNYA_PRIVATE_KEY!.trim(),
    token: process.env.PAYDUNYA_TOKEN!.trim(),
    mode,
    appPublicUrl: process.env.APP_PUBLIC_URL!.trim().replace(/\/+$/, ""),
    baseUrl: process.env.PAYDUNYA_API_BASE_URL?.trim().replace(/\/+$/, "") || paydunyaBaseUrl(mode),
  };
}

/** Called once at startup: online payment is optional for the rest of the app, so only log. */
export function checkPaydunyaConfigAtStartup() {
  try {
    const config = getPaydunyaConfig();
    if (process.env.PAYDUNYA_API_BASE_URL) {
      logger.warn({ baseUrl: config.baseUrl }, "PAYDUNYA_API_BASE_URL is set: PayDunya calls go to this URL (local tests only)");
    }
    logger.info({ mode: config.mode }, "PayDunya configured");
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, "PayDunya not configured: online ticket payment is disabled");
  }
}

function headers(config: PaydunyaConfig) {
  return {
    "Content-Type": "application/json",
    "PAYDUNYA-MASTER-KEY": config.masterKey,
    "PAYDUNYA-PRIVATE-KEY": config.privateKey,
    "PAYDUNYA-TOKEN": config.token,
  };
}

async function callApi(config: PaydunyaConfig, path: string, init: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers: headers(config), signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new PaydunyaApiError(`PayDunya injoignable : ${(err as Error).message}`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new PaydunyaApiError(`PayDunya a répondu ${response.status}`);
  return body;
}

export interface CreateInvoiceInput {
  amount: number;
  description: string;
  itemName: string;
  customer: { name: string; phone: string };
  customData: Record<string, string | number>;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
}

/** Creates a checkout invoice. Returns the invoice token and the PayDunya page to redirect the customer to. */
export async function createCheckoutInvoice(config: PaydunyaConfig, input: CreateInvoiceInput): Promise<{ token: string; url: string }> {
  const body = await callApi(config, "/checkout-invoice/create", {
    method: "POST",
    body: JSON.stringify({
      invoice: {
        total_amount: input.amount,
        description: input.description,
        items: {
          item_0: { name: input.itemName, quantity: 1, unit_price: String(input.amount), total_price: String(input.amount) },
        },
        customer: input.customer,
      },
      store: { name: "ChapVoyage" },
      custom_data: input.customData,
      actions: { cancel_url: input.cancelUrl, return_url: input.returnUrl, callback_url: input.callbackUrl },
    }),
  });
  if (body.response_code !== "00" || typeof body.token !== "string" || typeof body.response_text !== "string") {
    throw new PaydunyaApiError(`Création de facture refusée : ${body.response_text ?? body.description ?? "réponse inattendue"}`);
  }
  return { token: body.token, url: body.response_text };
}

export type InvoiceStatus = "pending" | "completed" | "cancelled" | "failed";

export interface ConfirmedInvoice {
  status: InvoiceStatus;
  token: string;
  totalAmount: number;
  customData: Record<string, unknown>;
}

/** Server-to-server check of the real invoice state: the only source of truth for a payment. */
export async function confirmCheckoutInvoice(config: PaydunyaConfig, token: string): Promise<ConfirmedInvoice> {
  const body = await callApi(config, `/checkout-invoice/confirm/${encodeURIComponent(token)}`, { method: "GET" });
  const status = body.status;
  if (body.response_code !== "00" || !["pending", "completed", "cancelled", "failed"].includes(status)) {
    throw new PaydunyaApiError(`Confirmation impossible : ${body.response_text ?? "réponse inattendue"}`);
  }
  return {
    status,
    token: String(body.invoice?.token ?? token),
    totalAmount: Number(body.invoice?.total_amount),
    customData: body.custom_data ?? {},
  };
}

/** PayDunya signs notifications with the SHA-512 hash of the master key (constant-time comparison). */
export function isPaydunyaHashValid(config: PaydunyaConfig, hash: unknown): boolean {
  if (typeof hash !== "string" || !/^[0-9a-f]{128}$/i.test(hash)) return false;
  const expected = createHash("sha512").update(config.masterKey).digest();
  return timingSafeEqual(expected, Buffer.from(hash, "hex"));
}
