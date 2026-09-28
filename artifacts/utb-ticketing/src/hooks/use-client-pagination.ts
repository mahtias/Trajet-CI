import { useEffect, useState } from "react";

/**
 * Pagination for lists the API returns in full (cities, stations, buses…).
 * Keeps the current page valid when the list shrinks (e.g. after a deletion).
 */
export function useClientPagination<T>(items: T[] | undefined, pageSize: number) {
  const [page, setPage] = useState(1);
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const current = Math.min(page, totalPages);
  const pageItems = items?.slice((current - 1) * pageSize, current * pageSize);

  return { page: current, setPage, totalPages, pageItems };
}
