import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { eq, and, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, usersTable, companiesTable, agenciesTable } from "@workspace/db";
import {
  RequestOtpBody,
  VerifyOtpBody,
  UpdateMeBody,
} from "@workspace/api-zod";
import { sendSms } from "../lib/orange-sms";
import { sendOtpEmail } from "../lib/email";
import { EMAIL_TAKEN, emailTaken, hasAccountActivity, isUniqueViolation, parseEmail } from "../lib/user-email";
import { getAccountSuspension, sendAccountSuspended } from "../lib/account-status";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  classifyPhone,
  generateOtp,
  hashOtp,
  isDevOtpEnabled,
  maskEmail,
  otpMatches,
  phoneRateKey,
} from "../lib/otp";

const router: IRouter = Router();

// Code requests: 10 per IP address and 3 per number per hour (in memory: reset when the server restarts).
// The per-number limit only counts codes actually issued, so a "give your e-mail" answer doesn't use one up.
const otpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de demandes de code depuis cette connexion. Réessayez dans une heure." },
});
const otpPhoneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => `phone:${phoneRateKey(String(req.body?.phone ?? ""))}`,
  message: { error: "Trop de codes demandés pour ce numéro (3 par heure). Réessayez plus tard." },
});

function getSession(req: any) {
  return req.session as { userId?: number };
}

type AttachResult =
  | { ok: true; user: typeof usersTable.$inferSelect }
  | { ok: false; status: number; body: { error: string; code?: string } };

/**
 * First e-mail of an account, given at login BEFORE the phone is proven (the code then goes to it): only
 * for a passenger account with no e-mail and no activity yet (nothing to steal). Otherwise refused without
 * changing anything; an administrator sets it after an identity check (PUT /admin/users/:id/email).
 * Never replaces an e-mail already on the account.
 */
async function attachFirstEmail(user: typeof usersTable.$inferSelect, email: string, log: { warn: (o: object, m: string) => void }): Promise<AttachResult> {
  if (user.email) return { ok: true, user };
  if (user.role !== "passenger") {
    return { ok: false, status: 403, body: { error: "Ce compte n'a pas d'e-mail enregistré. Demandez à un administrateur de l'ajouter.", code: "IDENTITY_VERIFICATION_REQUIRED" } };
  }
  if (await hasAccountActivity(user.id)) {
    log.warn({ userId: user.id }, "E-mail attach refused at login: account has activity");
    return { ok: false, status: 403, body: { error: "Ce compte a déjà des billets ou des réservations : pour y ajouter une adresse e-mail, contactez le support afin de vérifier votre identité.", code: "IDENTITY_VERIFICATION_REQUIRED" } };
  }
  if (await emailTaken(email, user.id)) return { ok: false, status: 409, body: { error: EMAIL_TAKEN } };
  try {
    // Only while still empty: two requests at once can't both set one
    const [updated] = await db.update(usersTable).set({ email }).where(and(eq(usersTable.id, user.id), isNull(usersTable.email))).returning();
    if (updated) return { ok: true, user: updated };
    const [current] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    return { ok: true, user: current };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, status: 409, body: { error: EMAIL_TAKEN } };
    throw err;
  }
}

async function formatAuthUser(user: typeof usersTable.$inferSelect) {
  const [company] = user.companyId
    ? await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId)).limit(1)
    : [undefined];
  const [agency] = user.agencyId
    ? await db.select().from(agenciesTable).where(eq(agenciesTable.id, user.agencyId)).limit(1)
    : [undefined];

  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    companyName: company?.name ?? null,
    agencyId: user.agencyId,
    agencyName: agency?.name ?? null,
    agencyType: agency?.type ?? null,
  };
}

router.post("/auth/request-otp", otpIpLimiter, otpPhoneLimiter, async (req, res): Promise<void> => {
  const parsed = RequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phone = parsed.data.phone.trim();
  const { name } = parsed.data;
  const target = classifyPhone(phone);
  if (target.kind === "ci_invalid") {
    res.status(400).json({ error: "Numéro ivoirien invalide : 10 chiffres attendus après +225 (exemple : +225 07 00 00 00 00)" });
    return;
  }
  const providedEmail = parseEmail(parsed.data.email);
  if (!providedEmail.ok) { res.status(400).json({ error: providedEmail.error }); return; }

  // Upsert user (the phone as typed stays the account key, as before)
  await db.insert(usersTable).values({ phone, name: name ?? null, role: "passenger" }).onConflictDoNothing({ target: usersTable.phone });
  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);

  // No SMS possible for this number (Orange only reaches +225): the code can only go by e-mail, so ask for one first
  if (target.kind === "foreign" && !user.email) {
    if (!providedEmail.email) {
      res.status(400).json({ error: "Pour recevoir votre code de connexion, indiquez votre adresse e-mail : l'envoi par SMS n'est pas disponible pour ce numéro.", code: "EMAIL_REQUIRED" });
      return;
    }
    const attached = await attachFirstEmail(user, providedEmail.email, req.log);
    if (!attached.ok) { res.status(attached.status).json(attached.body); return; }
    user = attached.user;
  }

  // A new code replaces the previous one and resets the try counter; only its hash is stored
  const otp = generateOtp();
  await db.update(usersTable).set({
    otpCode: hashOtp(phone, otp),
    otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    otpAttempts: 0,
  }).where(eq(usersTable.id, user.id));
  const clearOtp = () => db.update(usersTable).set({ otpCode: null, otpExpiresAt: null }).where(eq(usersTable.id, user.id));

  // Dev: nothing is sent (no SMS/e-mail cost, works without keys); the channel that would have been used is reported
  if (isDevOtpEnabled()) {
    req.log.info({ phone }, "OTP generated (ALLOW_DEV_OTP: not sent)");
    const deliveryChannel = target.kind === "ci" ? "sms" : "email";
    res.json({
      message: "OTP sent",
      deliveryChannel,
      smsFailed: false,
      emailHint: deliveryChannel === "email" && user.email ? maskEmail(user.email) : null,
      devOtp: otp,
    });
    return;
  }

  let smsFailed = false;
  if (target.kind === "ci") {
    try {
      await sendSms(target.e164, `Votre code ChapVoyage : ${otp}. Valable ${OTP_TTL_MINUTES} minutes. Ne le communiquez a personne.`);
      req.log.info({ phone }, "OTP sent by SMS");
      res.json({ message: "Code envoyé par SMS", deliveryChannel: "sms", smsFailed: false, emailHint: null });
      return;
    } catch (err) {
      smsFailed = true;
      req.log.warn({ phone, reason: (err as Error).message }, "OTP SMS failed");
      // No e-mail yet but one typed in the form (e.g. first sign-up): it becomes the account's e-mail, under the
      // same rule as for non-Ivorian numbers, since the code can only go there. With SMS working, it is saved
      // at verify-otp instead, once the phone is proven.
      if (!user.email && providedEmail.email) {
        const attached = await attachFirstEmail(user, providedEmail.email, req.log);
        if (!attached.ok) { await clearOtp(); res.status(attached.status).json(attached.body); return; }
        user = attached.user;
      }
      if (!user.email) {
        await clearOtp();
        res.status(503).json({ error: "Impossible d'envoyer le SMS pour le moment et aucun e-mail n'est enregistré sur ce compte. Réessayez dans quelques minutes.", code: "DELIVERY_FAILED" });
        return;
      }
    }
  }

  try {
    await sendOtpEmail(user.email!, otp, OTP_TTL_MINUTES);
  } catch (err) {
    req.log.error({ phone, reason: (err as Error).message }, "OTP e-mail failed");
    await clearOtp();
    res.status(503).json({
      error: smsFailed
        ? "Impossible d'envoyer le code par SMS ni par e-mail pour le moment. Réessayez dans quelques minutes."
        : "Impossible d'envoyer le code par e-mail pour le moment. Réessayez dans quelques minutes.",
      code: "DELIVERY_FAILED",
    });
    return;
  }
  req.log.info({ phone, smsFailed }, "OTP sent by e-mail");
  res.json({
    message: smsFailed ? "Le SMS n'a pas pu être envoyé, code envoyé par e-mail" : "Code envoyé par e-mail",
    deliveryChannel: "email",
    smsFailed,
    emailHint: maskEmail(user.email!),
  });
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phone = parsed.data.phone.trim();
  const { otp } = parsed.data;
  // Optional e-mail, checked before the code so a typo doesn't burn it
  const email = parseEmail(parsed.data.email);
  if (!email.ok) { res.status(400).json({ error: email.error }); return; }

  // Count the try before checking it, in one statement, so parallel guesses can't go past the limit
  const [attempt] = await db.update(usersTable)
    .set({ otpAttempts: sql`${usersTable.otpAttempts} + 1` })
    .where(and(eq(usersTable.phone, phone), isNotNull(usersTable.otpCode), lt(usersTable.otpAttempts, OTP_MAX_ATTEMPTS)))
    .returning();
  if (!attempt) {
    const [user] = await db.select({ otpAttempts: usersTable.otpAttempts }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (user && user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      res.status(429).json({ error: "Trop de codes incorrects. Demandez un nouveau code." });
      return;
    }
    res.status(401).json({ error: "Code invalide ou expiré" });
    return;
  }

  if (!attempt.otpExpiresAt || attempt.otpExpiresAt.getTime() < Date.now()) {
    await db.update(usersTable).set({ otpCode: null, otpExpiresAt: null }).where(eq(usersTable.id, attempt.id));
    res.status(401).json({ error: "Code expiré. Demandez un nouveau code." });
    return;
  }

  if (!otpMatches(attempt.otpCode!, phone, otp)) {
    const remaining = OTP_MAX_ATTEMPTS - attempt.otpAttempts;
    if (remaining <= 0) {
      // Code dropped; otpAttempts stays at the limit so the next try gets a clear 429 until a new code is requested
      await db.update(usersTable).set({ otpCode: null, otpExpiresAt: null }).where(eq(usersTable.id, attempt.id));
      res.status(401).json({ error: "Code incorrect. Trop de tentatives : demandez un nouveau code." });
      return;
    }
    res.status(401).json({ error: `Code incorrect (${remaining} essai${remaining > 1 ? "s" : ""} restant${remaining > 1 ? "s" : ""})` });
    return;
  }

  let user = attempt;

  // Checked once the code is proven, so the suspension and its reason are only told to the number's owner
  const suspension = await getAccountSuspension(user);
  if (suspension) {
    await db.update(usersTable).set({ otpCode: null, otpExpiresAt: null, otpAttempts: 0 }).where(eq(usersTable.id, user.id));
    req.log.warn({ userId: user.id, scope: suspension.scope }, "Login refused: account suspended");
    sendAccountSuspended(res, suspension);
    return;
  }

  // Fills an empty e-mail once the code is proven; an e-mail already on the account is never replaced here
  // (retyping it, or another one, is simply ignored: changing it is done from the profile). An e-mail of
  // another account keeps the code valid to retry.
  if (email.email && !user.email) {
    if (await emailTaken(email.email, user.id)) { res.status(409).json({ error: EMAIL_TAKEN }); return; }
    try {
      [user] = await db.update(usersTable).set({ email: email.email }).where(eq(usersTable.id, user.id)).returning();
    } catch (err) {
      if (isUniqueViolation(err)) { res.status(409).json({ error: EMAIL_TAKEN }); return; }
      throw err;
    }
  }

  // Single use
  await db.update(usersTable).set({ otpCode: null, otpExpiresAt: null, otpAttempts: 0 }).where(eq(usersTable.id, user.id));
  getSession(req).userId = user.id;

  res.json(await formatAuthUser(user));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  getSession(req).userId = undefined;
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Utilisateur non trouvé" });
    return;
  }

  res.json(await formatAuthUser(user));
});

// The logged-in user edits their own profile (e-mail only for now); never another account
router.put("/auth/me", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "Non authentifié" }); return; }

  const body = UpdateMeBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const email = parseEmail(body.data.email);
  if (!email.ok) { res.status(400).json({ error: email.error }); return; }

  if (email.email && await emailTaken(email.email, userId)) { res.status(409).json({ error: EMAIL_TAKEN }); return; }
  let user;
  try {
    [user] = await db.update(usersTable).set({ email: email.email }).where(eq(usersTable.id, userId)).returning();
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: EMAIL_TAKEN }); return; }
    throw err;
  }
  if (!user) { res.status(404).json({ error: "Utilisateur non trouvé" }); return; }

  res.json(await formatAuthUser(user));
});

export default router;
