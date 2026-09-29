import { useLanguage } from "@/hooks/use-language";

const STATUS_STYLES: Record<string, { labelKey: string; className: string }> = {
  pending: { labelKey: "bookings.statusPending", className: "bg-amber-100 text-amber-800" },
  confirmed: { labelKey: "bookings.statusConfirmed", className: "bg-green-100 text-green-700" },
  cancelled: { labelKey: "bookings.statusCancelled", className: "bg-destructive/10 text-destructive" },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const style = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-bold ${style?.className ?? "bg-muted text-muted-foreground"}`}>
      {style ? t(style.labelKey) : status}
    </span>
  );
}
