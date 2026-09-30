import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  useGetCommissionSettings,
  getGetCommissionSettingsQueryKey,
  useUpdateCommissionSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [commission, setCommission] = useState("");
  const [fee, setFee] = useState("");
  const [platformPercent, setPlatformPercent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setCommission(String(settings.commissionPercent));
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
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCommissionSettingsQueryKey() });
          toast({ title: "Réglages enregistrés", description: "Ils s'appliquent aux billets créés à partir de maintenant." });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground mb-4">Commission et choix de siège</h1>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6 text-sm flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>La commission s'ajoute au tarif de chaque billet vendu en ligne : le client la paie en plus, affichée comme « Frais de service », et la compagnie reçoit son tarif en entier.</p>
          <p>Les frais de choix de siège s'ajoutent au tarif quand le passager choisit sa place (l'attribution automatique est gratuite), et sont partagés entre la plateforme et la compagnie.</p>
          <p className="text-muted-foreground">Un changement ne s'applique qu'aux billets créés ensuite : les billets existants gardent la répartition calculée à leur création.</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <p className="text-muted-foreground">Chargement...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-sm font-medium mb-1 block">Commission plateforme ajoutée au tarif (%)</label>
                <Input inputMode="decimal" value={commission} onChange={(e) => { setCommission(e.target.value); setError(null); }} />
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
