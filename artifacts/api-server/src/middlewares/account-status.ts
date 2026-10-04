import type { NextFunction, Request, Response } from "express";
import { getAccountSuspensionById, sendAccountSuspended } from "../lib/account-status";

function getSession(req: Request) {
  return req.session as { userId?: number };
}

/**
 * Every request of a logged-in user: a suspended account (or the staff of a suspended company) is logged
 * out on the spot and gets 403 ACCOUNT_SUSPENDED, whatever route it calls (passenger routes don't go
 * through requireRole). Logging out stays possible.
 */
export async function accountStatusGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = getSession(req);
  if (!session?.userId || req.path === "/auth/logout") { next(); return; }
  try {
    const suspension = await getAccountSuspensionById(session.userId);
    if (!suspension) { next(); return; }
    session.userId = undefined;
    sendAccountSuspended(res, suspension);
  } catch (err) {
    next(err);
  }
}
