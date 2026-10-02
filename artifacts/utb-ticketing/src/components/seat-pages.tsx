import { useState } from "react";
import { cn } from "@/lib/utils";

/** Above this many seats the map is split; each page stays at most around this size. */
const MAX_SEATS_PER_PAGE = 40;
/** Seats per row on the map: pages always end on a full row. */
const SEATS_PER_ROW = 4;

/**
 * Splits a bus into balanced pages from its real capacity: up to 40 seats → a single page (no tabs);
 * above, as few pages as possible of near-equal size, rounded up to full rows of 4
 * (50 seats → 28 + 22, 70 → 36 + 34, 100 → 36 + 36 + 28).
 */
export function seatPageSize(totalSeats: number): number {
  if (totalSeats <= MAX_SEATS_PER_PAGE) return Math.max(totalSeats, 1);
  const pages = Math.ceil(totalSeats / MAX_SEATS_PER_PAGE);
  return Math.ceil(totalSeats / pages / SEATS_PER_ROW) * SEATS_PER_ROW;
}

export function useSeatPages<T extends { id: number; seatNumber: number; status: string }>(seats: T[] | undefined) {
  const [page, setPage] = useState(0);
  const sorted = [...(seats ?? [])].sort((a, b) => a.seatNumber - b.seatNumber);
  const size = seatPageSize(sorted.length);
  const pages = Array.from({ length: Math.ceil(sorted.length / size) }, (_, i) => {
    const items = sorted.slice(i * size, (i + 1) * size);
    return { items, from: items[0]?.seatNumber ?? 0, to: items[items.length - 1]?.seatNumber ?? 0, free: items.filter((s) => s.status === "available").length };
  });
  const current = Math.min(page, Math.max(pages.length - 1, 0));
  return { pages, page: current, setPage, pageSeats: pages[current]?.items ?? [] };
}

interface SeatPageTabsProps {
  pages: Array<{ from: number; to: number; free: number }>;
  page: number;
  onPageChange: (page: number) => void;
  label: (p: { from: number; to: number; free: number }) => string;
  className?: string;
}

/** One tab per part of the bus ("Places 1–36"); nothing at all when the bus fits on one page. */
export function SeatPageTabs({ pages, page, onPageChange, label, className }: SeatPageTabsProps) {
  if (pages.length <= 1) return null;
  return (
    <div role="tablist" className={cn("flex flex-wrap justify-center gap-2", className)}>
      {pages.map((p, i) => (
        <button
          key={p.from}
          type="button"
          role="tab"
          aria-selected={i === page}
          onClick={() => onPageChange(i)}
          className={cn(
            "px-3 py-1.5 rounded-full border text-sm font-medium transition-colors",
            i === page ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {label(p)}
        </button>
      ))}
    </div>
  );
}
