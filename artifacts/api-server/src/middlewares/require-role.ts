import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

function getSession(req: Request) {
  return req.session as { userId?: number };
}

export function requireRole(...roles: Array<"passenger" | "clerk" | "admin">) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { userId } = getSession(req);
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || !roles.includes(user.role as "passenger" | "clerk" | "admin")) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    (req as any).currentUser = user;
    next();
  };
}
