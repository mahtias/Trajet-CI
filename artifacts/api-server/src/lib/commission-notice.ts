import { and, eq, isNotNull } from "drizzle-orm";
import { db, usersTable, companiesTable } from "@workspace/db";
import { logger } from "./logger";
import { sendCommissionChangeEmail, sendCommissionChangeCancelledEmail } from "./email";

export interface NotificationSummary {
  /** E-mails Resend accepted */
  sent: number;
  /** E-mails that could not be sent (Resend down, not configured…) */
  failed: number;
  /** Company admins without an e-mail on their account: only the in-app banner reaches them */
  withoutEmail: number;
}

export type CommissionAnnouncement =
  | { kind: "change"; oldPercent: number; newPercent: number; effectiveAt: Date }
  | { kind: "cancelled"; currentPercent: number; cancelledPercent: number };

/**
 * E-mails every company admin attached to a company. Never throws: a missing e-mail or a failed send
 * is logged and counted, the rate change itself is already saved.
 */
export async function notifyCompanyAdmins(announcement: CommissionAnnouncement): Promise<NotificationSummary> {
  const admins = await db
    .select({ id: usersTable.id, email: usersTable.email, companyName: companiesTable.name })
    .from(usersTable)
    .innerJoin(companiesTable, eq(usersTable.companyId, companiesTable.id))
    .where(and(eq(usersTable.role, "company_admin"), isNotNull(usersTable.companyId)));

  const summary: NotificationSummary = { sent: 0, failed: 0, withoutEmail: 0 };
  await Promise.all(admins.map(async (admin) => {
    if (!admin.email) {
      summary.withoutEmail++;
      logger.warn({ userId: admin.id, companyName: admin.companyName }, "Company admin has no e-mail: commission change not e-mailed (banner only)");
      return;
    }
    try {
      if (announcement.kind === "change") {
        await sendCommissionChangeEmail(admin.email, { companyName: admin.companyName, ...announcement });
      } else {
        await sendCommissionChangeCancelledEmail(admin.email, { companyName: admin.companyName, ...announcement });
      }
      summary.sent++;
    } catch (err) {
      summary.failed++;
      logger.error({ userId: admin.id, reason: (err as Error).message }, "Commission change e-mail failed");
    }
  }));
  logger.info({ kind: announcement.kind, ...summary }, "Company admins notified of commission change");
  return summary;
}
