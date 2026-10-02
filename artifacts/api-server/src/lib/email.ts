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

/**
 * Sends the login code. Resolves once Resend accepted the message.
 * Throws EmailConfigError when Resend isn't configured, EmailSendError when it refuses or can't be reached.
 */
export async function sendOtpEmail(to: string, code: string, validityMinutes = 10): Promise<void> {
  const config = getEmailConfig();
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
  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">Votre code de connexion</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.5">Saisissez ce code sur ${APP_NAME} pour vous connecter :</p>
    <p style="margin:0 0 24px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;font-family:'Courier New',monospace">${code}</p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.5">Il est valable <strong>${validityMinutes} minutes</strong> et ne peut servir qu'une fois.</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a">Si vous n'avez pas demandé ce code, ignorez simplement ce message : personne ne peut se connecter sans lui.</p>
  </div>
</body>
</html>`;

  let result: Awaited<ReturnType<Resend["emails"]["send"]>>;
  try {
    result = await withTimeout(getClient(config).emails.send({ from: config.from, to, subject, text, html }), 15_000);
  } catch (err) {
    if (err instanceof EmailSendError) throw err;
    throw new EmailSendError(`Resend injoignable : ${(err as Error).message}`);
  }
  if (result.error) throw new EmailSendError(`Envoi e-mail refusé par Resend : ${result.error.message}`);
}
