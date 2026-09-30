import type { User } from "@workspace/db";

/**
 * Company scoping for the admin screens shared by the super admin and company admins:
 * - admin: every company (null)
 * - company_admin: only users.companyId
 */
export function managedCompanyId(user: User): number | null {
  return user.role === "admin" ? null : user.companyId;
}

/** True if the user may act on this company's buses, routes, trips, stations and figures. */
export function canManageCompany(user: User, companyId: number | null | undefined): boolean {
  if (user.role === "admin") return true;
  return user.role === "company_admin" && user.companyId !== null && user.companyId === companyId;
}

export const OTHER_COMPANY_ERROR = "Cette ressource appartient à une autre compagnie";
