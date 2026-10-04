import { useEffect, useState } from "react";
import {
  useGetCompanySuspensionPreview,
  getGetCompanySuspensionPreviewQueryKey,
  useSuspendCompany,
  type CompanySuspensionSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const fcfa = (n: number) => `${n.toLocaleString("fr-CI")} FCFA`;

/** One line of the impact list, highlighted when it actually does something. */
function Impact({ count, children }: { count: number; children: React.ReactNode }) {
  return <li className={count > 0 ? "text-foreground" : "text-muted-foreground"}>{children}</li>;
}

/**
 * Super admin: suspend a whole company. Shows what will happen right now (server preview), asks for the
 * reason and an explicit confirmation, then shows what was actually done.
 */
export function CompanySuspensionDialog({ company, onClose }: { company: { id: number; name: string } | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const suspend = useSuspendCompany();
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [result, setResult] = useState<CompanySuspensionSummary | null>(null);
  const companyId = company?.id ?? 0;
  const { data: preview, isLoading } = useGetCompanySuspensionPreview(companyId, {
    query: { queryKey: getGetCompanySuspensionPreviewQueryKey(companyId), enabled: !!company && !result, staleTime: 0 },
  });

  useEffect(() => { setReason(""); setUnderstood(false); setResult(null); }, [company?.id]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && understood && !suspend.isPending && !!preview;

  const submit = () => {
    if (!company || !canSubmit) return;
    suspend.mutate(
      { companyId: company.id, data: { reason: trimmed } },
      {
        onSuccess: (res) => {
          setResult(res.summary);
          queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={!!company} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" /> {company?.name} est suspendue</DialogTitle>
              <DialogDescription>Résumé de l'opération :</DialogDescription>
            </DialogHeader>
            <ul className="text-sm space-y-1.5 list-disc pl-5">
              <li>{result.tripsCancelled} voyage(s) futur(s) annulé(s)</li>
              <li>{result.ticketsRefunded} billet(s) remboursé(s) à 100 % : {fcfa(result.refundTotal)}</li>
              <li className="list-none -ml-5 pl-5 text-muted-foreground">
                Remboursements : {result.refundsByStatus.success} effectué(s), {result.refundsByStatus.pending} en cours chez l'opérateur
                {result.refundsByStatus.failed + result.refundsByStatus.manualRequired > 0 && (
                  <span className="text-destructive font-medium">, {result.refundsByStatus.failed + result.refundsByStatus.manualRequired} à faire à la main (écran Remboursements)</span>
                )}
              </li>
              <li>{fcfa(result.clawbackTotal)} déjà versé(s) à la compagnie, à reprendre sur ses prochains virements</li>
              <li>{result.pendingPurchasesCancelled} achat(s) en cours interrompu(s)</li>
              {result.validatedTicketsKept > 0 && <li>{result.validatedTicketsKept} billet(s) déjà utilisé(s) à l'embarquement, laissés tels quels</li>}
            </ul>
            <DialogFooter><Button onClick={onClose}>Fermer</Button></DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Suspendre {company?.name}</DialogTitle>
              <DialogDescription>Ce qui va se passer immédiatement :</DialogDescription>
            </DialogHeader>
            {isLoading || !preview ? (
              <div className="h-32 bg-muted animate-pulse rounded-lg" />
            ) : (
              <ul className="text-sm space-y-1.5 list-disc pl-5">
                <li>La compagnie disparaît de la recherche ; ses administrateurs et guichetiers ne peuvent plus se connecter.</li>
                <Impact count={preview.futureTrips}><strong>{preview.futureTrips}</strong> voyage(s) futur(s) annulé(s)</Impact>
                <Impact count={preview.ticketsToRefund}>
                  <strong>{preview.ticketsToRefund}</strong> billet(s) payé(s) remboursé(s) à 100 %, frais de service compris : <strong>{fcfa(preview.refundTotal)}</strong>
                </Impact>
                <Impact count={preview.clawbackTotal}><strong>{fcfa(preview.clawbackTotal)}</strong> déjà versé(s) à la compagnie, repris en totalité</Impact>
                <Impact count={preview.pendingPurchases}><strong>{preview.pendingPurchases}</strong> achat(s) en cours interrompu(s)</Impact>
                <li className="text-muted-foreground">Les voyages passés et les billets déjà utilisés ne sont pas touchés.</li>
              </ul>
            )}
            <div>
              <label htmlFor="suspension-reason" className="text-sm font-medium mb-1 block">Raison (affichée aux comptes bloqués)</label>
              <Textarea id="suspension-reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : manquements graves à la sécurité des passagers" />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} className="mt-0.5" />
              <span>Je comprends que les voyages annulés et les remboursements sont <strong>définitifs</strong> : une réactivation ne les rétablira pas.</span>
            </label>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button variant="destructive" disabled={!canSubmit} onClick={submit}>
                {suspend.isPending ? "Suspension en cours…" : "Confirmer la suspension"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
