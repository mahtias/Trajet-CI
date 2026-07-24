import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  RequestOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// In-memory OTP store for MVP (phone -> {otp, expiresAt})
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSession(req: any) {
  return req.session as { userId?: number };
}

router.post("/auth/request-otp", async (req, res): Promise<void> => {
  const parsed = RequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phone = parsed.data.phone.trim();
  const { name } = parsed.data;
  const otp = generateOtp();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  otpStore.set(phone, { otp, expiresAt });

  // Upsert user
  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing.length === 0) {
    await db.insert(usersTable).values({ phone, name: name ?? null, role: "passenger" });
  }

  req.log.info({ phone }, "OTP generated");

  // In production, send via SMS. For MVP return it in response for dev.
  res.json({ message: "OTP sent", devOtp: otp });
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const phone = parsed.data.phone.trim();
  const { otp } = parsed.data;
  const stored = otpStore.get(phone);

  if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
    res.status(401).json({ error: "Code invalide ou expiré" });
    return;
  }

  otpStore.delete(phone);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Utilisateur non trouvé" });
    return;
  }

  getSession(req).userId = user.id;

  res.json({
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
  });
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

  res.json({
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
  });
});

export default router;
