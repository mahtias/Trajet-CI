import type { Company } from "@workspace/db";

export function formatCompany(c: Company) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    suspendedReason: c.suspendedReason,
    suspendedAt: c.suspendedAt ? c.suspendedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}
