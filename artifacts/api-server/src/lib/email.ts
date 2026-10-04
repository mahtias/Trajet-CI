import { Resend } from "resend";
import { logger } from "./logger";

/**
 * Transactional e-mail through Resend: https://resend.com/docs/api-reference/emails/send-email
 *
 * Configuration (environment):
 *   RESEND_API_KEY     – API key of the Resend account
 *   RESEND_FROM_EMAIL  – sender on a domain verified on Resend, e.g. noreply@chap-voyage.com
 *                        (MAIL_FROM_ADDRESS is read when RESEND_FROM_EMAIL is absent)
 *   RESEND_BASE_URL (optional, local tests only) – read by the Resend SDK itself (fake Resend)
 */
export interface EmailConfig {
  apiKey: string;
  from: string;
}

export class EmailConfigError extends Error {}
export class EmailSendError extends Error {}

const APP_NAME = "ChapVoyage";

/** Throws EmailConfigError listing what's missing. */
export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.RESEND_FROM_EMAIL ?? process.env.MAIL_FROM_ADDRESS)?.trim();
  const missing = [!apiKey && "RESEND_API_KEY", !from && "RESEND_FROM_EMAIL"].filter(Boolean);
  if (missing.length > 0) throw new EmailConfigError(`Configuration e-mail incomplète : ${missing.join(", ")} manquant(s)`);
  // A bare address gets the app name as display name
  return { apiKey: apiKey!, from: from!.includes("<") ? from! : `${APP_NAME} <${from}>` };
}

/** Called once at startup: without Resend, codes can't reach foreign numbers (nor serve as SMS fallback). */
export function checkEmailConfigAtStartup() {
  try {
    const config = getEmailConfig();
    if (process.env.RESEND_BASE_URL) {
      logger.warn({ baseUrl: process.env.RESEND_BASE_URL }, "RESEND_BASE_URL is set: e-mails go to this URL (local tests only)");
    }
    logger.info({ from: config.from }, "Resend e-mail configured");
  } catch (err) {
    logger.warn({ reason: (err as Error).message }, "Resend not configured: login codes can't be sent by e-mail");
  }
}

let client: { apiKey: string; resend: Resend } | null = null;

function getClient(config: EmailConfig): Resend {
  if (!client || client.apiKey !== config.apiKey) client = { apiKey: config.apiKey, resend: new Resend(config.apiKey) };
  return client.resend;
}

/** The SDK has no timeout of its own: give up after 15 s rather than hanging the login request. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EmailSendError(`Resend n'a pas répondu en ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Sends one message. Throws EmailConfigError when Resend isn't configured, EmailSendError when it refuses or can't be reached. */
async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const config = getEmailConfig();
  let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    result = await withTimeout(getClient(config).emails.send({ from: config.from, to, subject, text, html }), 15_000);
  } catch (err) {
    if (err instanceof EmailSendError) throw err;
    throw new EmailSendError(`Resend injoignable : ${(err as Error).message}`);
  }
  if (result.error) throw new EmailSendError(`Envoi e-mail refusé par Resend : ${result.error.message}`);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Same minimal card for every e-mail: title + body (already HTML). */
function emailLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

/**
 * Sends the login code. Resolves once Resend accepted the message.
 * Throws EmailConfigError when Resend isn't configured, EmailSendError when it refuses or can't be reached.
 */
export async function sendOtpEmail(to: string, code: string, validityMinutes = 10): Promise<void> {
  const subject = `${code} est votre code de connexion ${APP_NAME}`;
  const text = [
    "Bonjour,",
    "",
    `Votre code de connexion ${APP_NAME} est : ${code}`,
    "",
    `Il est valable ${validityMinutes} minutes et ne peut servir qu'une fois.`,
    "Si vous n'avez pas demandé ce code, ignorez simplement ce message : personne ne peut se connecter sans lui.",
    "",
    `L'équipe ${APP_NAME}`,
  ].join("\n");
  const html = emailLayout("Votre code de connexion", `
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5">Saisissez ce code sur ${APP_NAME} pour vous connecter :</p>
    <p style="margin:0 0 24px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:'Courier New',monospace">${code}</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">Il est valable <strong>${validityMinutes} minutes</strong> et ne peut servir qu'une fois.</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a">Si vous n'avez pas demandé ce code, ignorez simplement ce message : personne ne peut se connecter sans lui.</p>`);
  await sendEmail(to, subject, text, html);
}

/** "12 octobre 2026 à 14:30" in Côte d'Ivoire time (UTC). */
export function formatFrenchDateTime(date: Date): string {
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Abidjan" }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(date);
  return `${day} à ${time}`;
}

const formatPercent = (value: number) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/** Tells a company admin that the platform commission will change after the notice period. */
export async function sendCommissionChangeEmail(to: string, change: { companyName: string; oldPercent: number; newPercent: number; effectiveAt: Date }): Promise<void> {
  const when = formatFrenchDateTime(change.effectiveAt);
  const subject = `Commission ${APP_NAME} : passage de ${formatPercent(change.oldPercent)} à ${formatPercent(change.newPercent)} le ${when.split(" à ")[0]}`;
  const text = [
    "Bonjour,",
    "",
    `Le taux de commission de la plateforme ${APP_NAME} va changer pour ${change.companyName} comme pour toutes les compagnies :`,
    `- taux actuel : ${formatPercent(change.oldPercent)}`,
    `- nouveau taux : ${formatPercent(change.newPercent)}`,
    `- entrée en vigueur : le ${when} (heure d'Abidjan)`,
    "",
    "La commission s'ajoute au tarif payé par le passager (« frais de service ») : votre tarif vous reste versé en entier.",
    "Les billets vendus avant cette date gardent l'ancien taux.",
    "",
    `L'équipe ${APP_NAME}`,
  ].join("\n");
  const html = emailLayout("Changement du taux de commission", `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Le taux de commission de la plateforme va changer pour <strong>${escapeHtml(change.companyName)}</strong> comme pour toutes les compagnies.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:15px">
      <tr><td style="padding:8px 0;color:#71717a">Taux actuel</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatPercent(change.oldPercent)}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a">Nouveau taux</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatPercent(change.newPercent)}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a">Entrée en vigueur</td><td style="padding:8px 0;text-align:right;font-weight:bold">le ${when}</td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">La commission s'ajoute au tarif payé par le passager (« frais de service ») : votre tarif vous reste versé en entier.</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a">Les billets vendus avant cette date gardent l'ancien taux. Heure d'Abidjan.</p>`);
  await sendEmail(to, subject, text, html);
}

/** Tells a company admin that the announced change was cancelled: the current rate stays. */
export async function sendCommissionChangeCancelledEmail(to: string, change: { companyName: string; currentPercent: number; cancelledPercent: number }): Promise<void> {
  const subject = `Commission ${APP_NAME} : le changement annoncé est annulé, le taux reste à ${formatPercent(change.currentPercent)}`;
  const text = [
    "Bonjour,",
    "",
    `Le passage de la commission à ${formatPercent(change.cancelledPercent)} qui vous avait été annoncé est annulé.`,
    `Le taux reste à ${formatPercent(change.currentPercent)} pour ${change.companyName} comme pour toutes les compagnies.`,
    "",
    `L'équipe ${APP_NAME}`,
  ].join("\n");
  const html = emailLayout("Changement de commission annulé", `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Le passage de la commission à <strong>${formatPercent(change.cancelledPercent)}</strong> qui vous avait été annoncé est annulé.</p>
    <p style="margin:0;font-size:15px;line-height:1.5">Le taux reste à <strong>${formatPercent(change.currentPercent)}</strong> pour ${escapeHtml(change.companyName)} comme pour toutes les compagnies.</p>`);
  await sendEmail(to, subject, text, html);
}
