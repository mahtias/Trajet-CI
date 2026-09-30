import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

/**
 * PayDunya "Checkout Invoice" (HTTP/JSON API): https://developers.paydunya.com/doc/EN/http_json
 * "Paiement et Redistribution" (direct-pay/credit-account) and "API PUSH" (disburse/*, refunds:
 * https://developers.paydunya.com/doc/EN/api_deboursement), both to be enabled on the account.
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
  /** API PUSH (disbursements) lives under /api/v2, the rest under /api/v1 */
  disburseBaseUrl: string;
}

export class PaydunyaConfigError extends Error {}
export class PaydunyaApiError extends Error {}

/** The single place that decides sandbox vs production URLs. */
export function paydunyaBaseUrl(mode: PaydunyaMode): string {
  return mode === "live" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1";
}

/** API PUSH: the documentation only gives the live URL (api/v2); the sandbox one follows the v1 pattern. */
export function paydunyaDisburseBaseUrl(mode: PaydunyaMode): string {
  return mode === "live" ? "https://app.paydunya.com/api/v2" : "https://app.paydunya.com/sandbox-api/v2";
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
    disburseBaseUrl: process.env.PAYDUNYA_API_BASE_URL?.trim().replace(/\/+$/, "") || paydunyaDisburseBaseUrl(mode),
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

async function callApi(config: PaydunyaConfig, path: string, init: RequestInit, baseUrl = config.baseUrl): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers: headers(config), signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new PaydunyaApiError(`PayDunya injoignable : ${(err as Error).message}`);
  }
  const body: any = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const detail = body?.response_text ?? body?.description;
    throw new PaydunyaApiError(`PayDunya a répondu ${response.status}${detail ? ` : ${detail}` : ""}`);
  }
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

/**
 * Sends money from our PayDunya balance to another PayDunya account ("Paiement et Redistribution").
 * accountAlias: phone number or email of the receiving account. Returns PayDunya's transaction id.
 * Throws PaydunyaApiError when PayDunya refuses (feature not enabled, unknown account, balance…)
 * or can't be reached.
 */
export async function creditCompanyAccount(config: PaydunyaConfig, accountAlias: string, amount: number): Promise<{ transactionId: string }> {
  const body = await callApi(config, "/direct-pay/credit-account", {
    method: "POST",
    body: JSON.stringify({ account_alias: accountAlias, amount }),
  });
  if (body.response_code !== "00") {
    throw new PaydunyaApiError(`Transfert refusé : ${body.response_text ?? body.description ?? "réponse inattendue"}`);
  }
  return { transactionId: String(body.transaction_id ?? "") };
}

// ── API PUSH (disbursement): refunds to the passenger's mobile money ────────────────

export type DisburseStatus = "created" | "pending" | "success" | "failed";

/** Step 1: creates the disbursement request (nothing is sent yet). Returns the disburse token. */
export async function getDisburseInvoice(config: PaydunyaConfig, input: {
  accountAlias: string; // phone number without country code
  amount: number; // integer FCFA
  withdrawMode: string; // e.g. orange-money-ci
  callbackUrl: string;
  disburseId: string; // our own reference, unique (PayDunya refuses a duplicate)
}): Promise<{ disburseToken: string }> {
  const body = await callApi(config, "/disburse/get-invoice", {
    method: "POST",
    body: JSON.stringify({
      account_alias: input.accountAlias,
      amount: input.amount,
      withdraw_mode: input.withdrawMode,
      callback_url: input.callbackUrl,
      disburse_id: input.disburseId,
    }),
  }, config.disburseBaseUrl);
  if (body.response_code !== "00" || typeof body.disburse_token !== "string") {
    throw new PaydunyaApiError(`Demande de remboursement refusée : ${body.response_text ?? body.description ?? "réponse inattendue"}`);
  }
  return { disburseToken: body.disburse_token };
}

/** Step 2: executes the disbursement. "pending" = the operator is still processing (final state via callback / check-status). */
export async function submitDisburseInvoice(config: PaydunyaConfig, disburseToken: string, disburseId: string): Promise<{ status: "success" | "pending"; transactionId: string | null }> {
  const body = await callApi(config, "/disburse/submit-invoice", {
    method: "POST",
    body: JSON.stringify({ disburse_invoice: disburseToken, disburse_id: disburseId }),
  }, config.disburseBaseUrl);
  if (body.response_code !== "00") {
    throw new PaydunyaApiError(`Remboursement refusé : ${body.response_text ?? body.description ?? "réponse inattendue"}`);
  }
  if (body.status === "failed") throw new PaydunyaApiError(`Remboursement échoué : ${body.response_text ?? body.description ?? "échec"}`);
  return { status: body.status === "pending" ? "pending" : "success", transactionId: body.transaction_id ? String(body.transaction_id) : null };
}

export interface DisburseState {
  status: DisburseStatus;
  token: string;
  amount: number;
  fees: number | null;
  transactionId: string | null;
  disburseId: string | null;
}

/** Real state of a disbursement (server-to-server): the source of truth, like confirm() for payments. */
export async function checkDisburseStatus(config: PaydunyaConfig, disburseToken: string): Promise<DisburseState> {
  const body = await callApi(config, "/disburse/check-status", {
    method: "POST",
    body: JSON.stringify({ disburse_invoice: disburseToken }),
  }, config.disburseBaseUrl);
  const status = body.status;
  if (body.response_code !== "00" || !["created", "pending", "success", "failed"].includes(status)) {
    throw new PaydunyaApiError(`Statut du remboursement indisponible : ${body.response_text ?? "réponse inattendue"}`);
  }
  const fees = body.fees !== undefined && body.fees !== null && body.fees !== "" ? Number(body.fees) : null;
  return {
    status,
    token: String(body.token ?? disburseToken),
    amount: Number(body.amount),
    fees: Number.isFinite(fees) ? fees : null,
    transactionId: body.transaction_id ? String(body.transaction_id) : null,
    disburseId: body.disburse_id ? String(body.disburse_id) : null,
  };
}

/** PayDunya signs notifications with the SHA-512 hash of the master key (constant-time comparison). */
export function isPaydunyaHashValid(config: PaydunyaConfig, hash: unknown): boolean {
  if (typeof hash !== "string" || !/^[0-9a-f]{128}$/i.test(hash)) return false;
  const expected = createHash("sha512").update(config.masterKey).digest();
  return timingSafeEqual(expected, Buffer.from(hash, "hex"));
}
