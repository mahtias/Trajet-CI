import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  useGetCommissionSettings,
  getGetCommissionSettingsQueryKey,
  useUpdateCommissionSettings,
  useCancelPendingCommission,
  type CommissionNotificationSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const formatPercent = (value: number) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/** "E-mail envoyé à 3 compagnies (1 échec, 2 sans e-mail : bannière seulement)" */
function notificationText(n: CommissionNotificationSummary): string {
  const parts = [`E-mail envoyé à ${n.sent} administrateur${n.sent > 1 ? "s" : ""} de compagnie`];
  if (n.failed > 0) parts.push(`${n.failed} envoi${n.failed > 1 ? "s" : ""} en échec`);
  if (n.withoutEmail > 0) parts.push(`${n.withoutEmail} sans e-mail (bannière seulement)`);
  return parts.join(" · ");
}

function parseNumber(input: string): number {
  return Number(input.trim().replace(",", "."));
}

/** Error message for the form, or null if valid (same rules as the server). */
function validate(commission: string, fee: string, platformPercent: string): string | null {
  const [c, f, p] = [parseNumber(commission), parseNumber(fee), parseNumber(platformPercent)];
  if (![c, f, p].every(Number.isFinite) || [commission, fee, platformPercent].some((v) => !v.trim())) return "Tous les champs doivent être des nombres";
  if (c < 0 || c > 100) return "La commission doit être entre 0 et 100 %";
  if (p < 0 || p > 100) return "La part plateforme doit être entre 0 et 100 %";
  if (f < 0) return "Les frais de choix de siège ne peuvent pas être négatifs";
  return null;
}

/** Super admin only: platform commission and seat selection fee settings. */
export default function AdminCommission() {
  const { data: settings, isLoading } = useGetCommissionSettings({ query: { queryKey: getGetCommissionSettingsQueryKey() } });
  const update = useUpdateCommissionSettings();
  const cancelPending = useCancelPendingCommission();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [commission, setCommission] = useState("");
  const [fee, setFee] = useState("");
  const [platformPercent, setPlatformPercent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    // The rate that will be in force: re-saving the form (e.g. only the seat fee) must not cancel a pending change
    setCommission(String(settings.pendingCommissionPercent ?? settings.commissionPercent));
    setFee(String(settings.seatSelectionFee));
    setPlatformPercent(String(settings.seatSelectionPlatformPercent));
  }, [settings]);

  const companyPercent = 100 - (parseNumber(platformPercent) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(commission, fee, platformPercent);
    setError(validationError);
    if (validationError) return;
    update.mutate(
      { data: { commissionPercent: parseNumber(commission), seatSelectionFee: parseNumber(fee), seatSelectionPlatformPercent: parseNumber(platformPercent) } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetCommissionSettingsQueryKey() });
          const commissionNote = res.pendingCommissionPercent !== null && res.pendingCommissionPercent !== undefined && res.effectiveAt
            ? `Commission : ${formatPercent(res.pendingCommissionPercent)} à partir du ${format(parseISO(res.effectiveAt), "dd/MM/yyyy HH:mm")}. `
            : "";
          toast({
            title: "Réglages enregistrés",
            description: `${commissionNote}${res.notification ? notificationText(res.notification) : "Les frais de choix de siège s'appliquent aux billets créés à partir de maintenant."}`,
          });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      }
    );
  };

  const handleCancelPending = () => {
    cancelPending.mutate(undefined, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getGetCommissionSettingsQueryKey() });
        toast({ title: "Changement annulé", description: `Le taux reste à ${formatPercent(res.commissionPercent)}. ${res.notification ? notificationText(res.notification) : ""}` });
      },
      onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground mb-4">Commission et choix de siège</h1>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 text-sm flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>La commission s'ajoute au tarif de chaque billet vendu en ligne : le client la paie en plus, affichée comme « Frais de service », et la compagnie reçoit son tarif en entier.</p>
          <p>Les frais de choix de siège s'ajoutent au tarif quand le passager choisit sa place (l'attribution automatique est gratuite), et sont partagés entre la plateforme et la compagnie.</p>
          <p>Un nouveau taux de commission est annoncé par e-mail et sur le tableau de bord de chaque compagnie, puis s'applique automatiquement après un préavis de 7 jours. Un seul changement peut être en attente : en enregistrer un autre le remplace.</p>
          <p className="text-muted-foreground">Un changement ne s'applique qu'aux billets créés ensuite : les billets existants gardent la répartition calculée à leur création.</p>
        </div>
      </div>

      {settings?.pendingCommissionPercent !== null && settings?.pendingCommissionPercent !== undefined && settings.effectiveAt && (
        <div className="border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <CalendarClock className="w-6 h-6 text-amber-600 shrink-0" />
          <p className="flex-1 text-sm">
            <span className="font-bold">Taux actuel : {formatPercent(settings.commissionPercent)}</span>
            {" — passera à "}
            <span className="font-bold">{formatPercent(settings.pendingCommissionPercent)}</span>
            {" le "}
            {format(parseISO(settings.effectiveAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
          </p>
          <Button variant="outline" className="shrink-0" disabled={cancelPending.isPending} onClick={handleCancelPending}>
            Annuler ce changement
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <p className="text-muted-foreground">Chargement...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-sm font-medium mb-1 block">Commission plateforme ajoutée au tarif (%)</label>
                <Input inputMode="decimal" value={commission} onChange={(e) => { setCommission(e.target.value); setError(null); }} />
                <p className="text-xs text-muted-foreground mt-1">Un taux différent du taux actuel s'appliquera dans 7 jours, après notification des compagnies.</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Frais de choix de siège (FCFA)</label>
                <Input inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); setError(null); }} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Part plateforme sur ces frais (%)</label>
                <Input inputMode="decimal" value={platformPercent} onChange={(e) => { setPlatformPercent(e.target.value); setError(null); }} />
                <p className="text-xs text-muted-foreground mt-1">
                  Part compagnie : {Number.isFinite(companyPercent) ? companyPercent : "—"} %
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {settings && `Dernière modification : ${format(parseISO(settings.updatedAt), "dd/MM/yyyy HH:mm")}`}
                </p>
                <Button type="submit" disabled={update.isPending}>Enregistrer</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
