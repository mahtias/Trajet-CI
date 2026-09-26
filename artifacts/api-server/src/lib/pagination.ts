export function parsePagination(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.trunc(page ?? 1) || 1);
  const size = Math.min(100, Math.max(1, Math.trunc(pageSize ?? 20) || 20));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}
