import type { Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, companiesTable, type User } from "@workspace/db";

/** Roles that work for a bus company: blocked when that company is suspended. */
const COMPANY_STAFF_ROLES = new Set(["company_admin", "clerk"]);

export interface AccountSuspension {
  /** The account itself, or its company (company admins and clerks) */
  scope: "user" | "company";
  reason: string | null;
  companyName: string | null;
}

/**
 * Why this account can't be used, or null. Read live from the database on each check: suspending or
 * reactivating takes effect at once, and a company's suspension never touches its users' own status.
 */
export async function getAccountSuspension(user: Pick<User, "status" | "suspendedReason" | "role" | "companyId">): Promise<AccountSuspension | null> {
  if (user.status === "suspended") return { scope: "user", reason: user.suspendedReason, companyName: null };
  if (user.companyId && COMPANY_STAFF_ROLES.has(user.role)) {
    const [company] = await db
      .select({ name: companiesTable.name, status: companiesTable.status, reason: companiesTable.suspendedReason })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId))
      .limit(1);
    if (company?.status === "suspended") return { scope: "company", reason: company.reason, companyName: company.name };
  }
  return null;
}

export async function getAccountSuspensionById(userId: number): Promise<AccountSuspension | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user ? getAccountSuspension(user) : null;
}

/** 403 ACCOUNT_SUSPENDED with a message for the person and the reason given by the super admin. */
export function sendAccountSuspended(res: Response, suspension: AccountSuspension) {
  const what = suspension.scope === "company"
    ? `La compagnie ${suspension.companyName ?? ""} est suspendue : les comptes de son personnel sont bloqués.`.replace("  ", " ")
    : "Ce compte est suspendu.";
  const why = suspension.reason ? ` Motif : ${suspension.reason.replace(/[.\s]+$/, "")}.` : "";
  res.status(403).json({
    error: `${what}${why} Contactez le support pour plus d'informations.`,
    code: "ACCOUNT_SUSPENDED",
    reason: suspension.reason,
    scope: suspension.scope,
  });
}
