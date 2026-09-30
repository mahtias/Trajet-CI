import { useState } from "react";
import { format, subDays } from "date-fns";
import { useGetRevenueSplitReport, useGetMe, getGetMeQueryKey, type RevenueSplitTotals } from "@workspace/api-client-react";
import { CalendarIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter
} from "@/components/ui/table";
import { ListPagination } from "@/components/list-pagination";

const PAGE_SIZE = 20;

function fcfa(n: number) {
  return `${n.toLocaleString("fr-CI", { maximumFractionDigits: 0 })} F`;
}

/** Amount columns of a company row or of the totals row. */
function AmountCells({ a }: { a: RevenueSplitTotals }) {
  return (
    <>
      <TableCell className="text-right font-mono font-bold">{fcfa(a.totalPaid)}</TableCell>
      <TableCell className="text-right font-mono">{fcfa(a.farePrice)}</TableCell>
      <TableCell className="text-right font-mono">{fcfa(a.companyShare)}</TableCell>
      <TableCell className="text-right font-mono">{fcfa(a.platformCommission)}</TableCell>
      <TableCell className="text-right font-mono">{fcfa(a.seatSelectionFeePaid)}</TableCell>
      <TableCell className="text-right font-mono">{fcfa(a.seatFeePlatformShare)}</TableCell>
      <TableCell className="text-right font-mono">{fcfa(a.seatFeeCompanyShare)}</TableCell>
      <TableCell className="text-right font-mono font-bold text-accent">{fcfa(a.companyShare + a.seatFeeCompanyShare)}</TableCell>
      <TableCell className="text-right font-mono font-bold">{fcfa(a.platformCommission + a.seatFeePlatformShare)}</TableCell>
    </>
  );
}

/**
 * Revenue split per company, from the amounts frozen on each paid ticket.
 * The super admin sees every company; a company admin only its own (filtered by the server).
 */
export default function AdminRevenue() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetRevenueSplitReport({ from, to, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Répartition des revenus</h1>
          <p className="text-muted-foreground mt-1">
            {me?.role === "company_admin" ? `Compagnie ${me.companyName ?? ""}` : "Toutes les compagnies"} · billets payés, hors annulations
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="pl-10" aria-label="Du" />
          </div>
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Au" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-6">
        Les frais de service (commission plateforme) s'ajoutent au tarif payé par le client : la compagnie reçoit son tarif en entier.
        Pour chaque ligne, total payé = part compagnie + frais de service + frais de choix de siège.
        Les montants sont ceux figés sur chaque billet à sa création : les billets vendus quand la commission était
        encore déduite du tarif gardent leur ancienne répartition. Les billets vendus avant la mise en place de la commission ne sont pas comptés.
      </p>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Compagnie</TableHead>
              <TableHead className="text-right">Billets</TableHead>
              <TableHead className="text-right">Total payé par les clients</TableHead>
              <TableHead className="text-right">Tarifs vendus</TableHead>
              <TableHead className="text-right">Part compagnie (tarifs)</TableHead>
              <TableHead className="text-right">Frais de service (plateforme)</TableHead>
              <TableHead className="text-right">Frais choix de siège</TableHead>
              <TableHead className="text-right">dont plateforme</TableHead>
              <TableHead className="text-right">dont compagnie</TableHead>
              <TableHead className="text-right">Total compagnie</TableHead>
              <TableHead className="text-right">Total plateforme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : !data?.rows.length ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Aucune vente sur cette période.</TableCell>
              </TableRow>
            ) : (
              data.rows.map((r) => (
                <TableRow key={r.companyId}>
                  <TableCell className="font-bold">{r.companyName}</TableCell>
                  <TableCell className="text-right">{r.ticketCount}</TableCell>
                  <AmountCells a={r} />
                </TableRow>
              ))
            )}
          </TableBody>
          {data && data.rows.length > 0 && (
            <TableFooter>
              <TableRow className="font-bold">
                <TableCell>Total période</TableCell>
                <TableCell className="text-right">{data.totals.ticketCount}</TableCell>
                <AmountCells a={data.totals} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
