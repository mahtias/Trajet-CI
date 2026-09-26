const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmée", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Annulée", className: "bg-destructive/10 text-destructive" },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-bold ${style.className}`}>
      {style.label}
    </span>
  );
}
