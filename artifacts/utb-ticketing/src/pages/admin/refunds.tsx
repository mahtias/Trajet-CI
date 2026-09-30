import { useState } from "react";
import { useGetAdminRefunds, getGetAdminRefundsQueryKey } from "@workspace/api-client-react";
import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/list-pagination";
import { getPaymentMethod } from "@/lib/payment-methods";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  failed: { label: "Échec", className: "bg-destructive/10 text-destructive border-destructive/30" },
  manual_required: { label: "À faire à la main", className: "bg-muted text-foreground" },
  created: { label: "Non exécuté", className: "bg-accent/20 text-accent-foreground border-accent/40" },
  pending: { label: "En cours chez l'opérateur", className: "bg-accent/20 text-accent-foreground border-accent/40" },
};

function fcfa(n: number) {
  return `${n.toLocaleString("fr-CI", { maximumFractionDigits: 0 })} F`;
}

/** Super admin: refunds of cancelled tickets that PayDunya did not settle automatically. */
export default function AdminRefunds() {
  const [page, setPage] = useState(1);
  const params = { page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useGetAdminRefunds(params, { query: { queryKey: getGetAdminRefundsQueryKey(params) } });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Remboursements à suivre</h1>
          <p className="text-muted-foreground mt-1">Billets annulés dont le remboursement n'a pas été versé automatiquement</p>
        </div>
        {data && <p className="text-sm">Total : <span className="font-mono font-bold">{fcfa(data.totalAmount)}</span></p>}
      </div>

      <p className="text-xs text-muted-foreground mb-6 flex gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Les remboursements sont envoyés automatiquement par PayDunya sur le mobile money utilisé à l'achat.
        Les paiements par carte, les numéros non ivoiriens et les échecs sont à rembourser à la main ; les frais PayDunya ne sont jamais retenus au passager.
      </p>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Billet</TableHead>
              <TableHead>Passager</TableHead>
              <TableHead>Téléphone du compte</TableHead>
              <TableHead>Moyen de paiement</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Raison</TableHead>
              <TableHead>Annulé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : !data?.items.length ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aucun remboursement en attente.</TableCell></TableRow>
            ) : (
              data.items.map((r) => {
                const status = STATUS_LABELS[r.status];
                return (
                  <TableRow key={r.ticketId}>
                    <TableCell className="font-mono">#{r.ticketId}</TableCell>
                    <TableCell className="font-medium">{r.passengerName}</TableCell>
                    <TableCell className="font-mono text-sm">{r.accountPhone ?? "—"}</TableCell>
                    <TableCell>{getPaymentMethod(r.paymentMethod).name}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{fcfa(r.refundAmount)}</TableCell>
                    <TableCell><Badge variant="outline" className={status?.className}>{status?.label ?? r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[18rem]">{r.error ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.cancelledAt ? new Date(r.cancelledAt).toLocaleString("fr-CI") : "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
