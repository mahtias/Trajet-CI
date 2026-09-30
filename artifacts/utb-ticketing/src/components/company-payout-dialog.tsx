import { useEffect, useState } from "react";
import {
  useGetCompanyPayoutStatus,
  getGetCompanyPayoutStatusQueryKey,
  useUpdateCompanyPayoutAccount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListPagination } from "@/components/list-pagination";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  failed: { label: "Échec", className: "bg-destructive/10 text-destructive border-destructive/30" },
  not_configured: { label: "Compte non renseigné", className: "bg-muted text-muted-foreground" },
  pending: { label: "En cours", className: "bg-accent/20 text-accent-foreground border-accent/40" },
  success: { label: "Compensé", className: "bg-primary/10 text-primary border-primary/30" },
};

function fcfa(n: number) {
  return `${n.toLocaleString("fr-CI", { maximumFractionDigits: 0 })} F`;
}

interface CompanyPayoutDialogProps {
  company: { id: number; name: string } | null;
  onClose: () => void;
}

/**
 * Super admin: the company's PayDunya account (receives its share of each online sale automatically)
 * and the paid tickets whose share was not transferred (failed, account not set, in progress), to settle by hand.
 */
export function CompanyPayoutDialog({ company, onClose }: CompanyPayoutDialogProps) {
  const companyId = company?.id ?? 0;
  const [page, setPage] = useState(1);
  const params = { companyId, page, pageSize: PAGE_SIZE };
  const { data, isLoading } = useGetCompanyPayoutStatus(params, {
    query: { queryKey: getGetCompanyPayoutStatusQueryKey(params), enabled: !!companyId },
  });
  const updateAccount = useUpdateCompanyPayoutAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [alias, setAlias] = useState("");

  useEffect(() => { setPage(1); }, [companyId]);
  useEffect(() => { setAlias(data?.paydunyaAccountAlias ?? ""); }, [data?.paydunyaAccountAlias, companyId]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateAccount.mutate(
      { companyId, data: { paydunyaAccountAlias: alias.trim() || null } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/company-payouts"] });
          toast({
            title: "Compte PayDunya enregistré",
            description: res.paydunyaAccountAlias
              ? "Les prochaines ventes seront transférées automatiquement à ce compte."
              : "Aucun transfert automatique pour cette compagnie.",
          });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={!!company} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paiements de {company?.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-2">
          <label className="text-sm font-medium block">Compte PayDunya de la compagnie</label>
          <div className="flex gap-2">
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Numéro de téléphone ou e-mail du compte"
              maxLength={100}
            />
            <Button type="submit" disabled={updateAccount.isPending || isLoading}>Enregistrer</Button>
          </div>
          <p className="text-xs text-muted-foreground flex gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Après chaque paiement en ligne, la part de la compagnie (son tarif et sa part des frais de siège) est envoyée à ce compte.
            Laisser vide : aucun transfert automatique, les montants apparaissent ci-dessous pour être réglés à la main.
          </p>
        </form>

        {data && data.pendingClawback > 0 && (
          <div className="mt-4 p-3 rounded-lg border border-accent/40 bg-accent/10 text-sm">
            <p className="font-semibold">À reprendre sur les prochains transferts : <span className="font-mono">{fcfa(data.pendingClawback)}</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              Parts déjà versées pour des billets annulés depuis. Ce montant est déduit automatiquement des prochains transferts de la compagnie.
            </p>
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-2 gap-4">
            <h3 className="font-semibold">Montants non transférés ou compensés</h3>
            {data && <p className="text-sm">Total dû : <span className="font-mono font-bold">{fcfa(data.totalAmount)}</span></p>}
          </div>
          <div className="border border-border rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Billet</TableHead>
                  <TableHead>Passager</TableHead>
                  <TableHead>Départ</TableHead>
                  <TableHead className="text-right">Montant dû</TableHead>
                  <TableHead className="text-right">Déduit / envoyé</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead>Raison</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Chargement...</TableCell></TableRow>
                ) : !data?.items.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Tout a été transféré automatiquement.</TableCell></TableRow>
                ) : (
                  data.items.map((item) => {
                    const status = STATUS_LABELS[item.status];
                    return (
                      <TableRow key={item.ticketId}>
                        <TableCell className="font-mono">#{item.ticketId}</TableCell>
                        <TableCell>{item.passengerName}</TableCell>
                        <TableCell>{item.departureDate}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fcfa(item.amount)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {item.clawbackAmount ? `−${fcfa(item.clawbackAmount)} / ${fcfa(item.netAmount ?? 0)}` : "—"}
                        </TableCell>
                        <TableCell><Badge variant="outline" className={status?.className}>{status?.label ?? item.status}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[16rem]">
                          {item.error ?? (item.status === "not_configured" ? "Aucun compte PayDunya renseigné au moment de la vente"
                            : item.status === "success" ? "Transfert réduit pour reprendre des billets annulés" : "—")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
