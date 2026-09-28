import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  useListExchangeRates,
  getListExchangeRatesQueryKey,
  useUpdateExchangeRate,
  useDeleteExchangeRate,
  type ExchangeRateCurrency,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Edit2, Trash2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// Must match the server bounds (artifacts/api-server/src/lib/exchange-rates.ts)
const MIN_RATE = 1;
const MAX_RATE = 10_000;
const EUR_FIXED_RATE = 655.957;

const CURRENCIES: { code: ExchangeRateCurrency; name: string }[] = [
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "Dollar américain" },
  { code: "CNY", name: "Yuan chinois" },
];

function parseRate(input: string): number {
  return Number(input.trim().replace(",", "."));
}

/** Error message for a rate typed by the admin, or null if it's valid. Accepts "655,957" or "655.957". */
function validateRate(input: string): string | null {
  const value = parseRate(input);
  if (!input.trim() || !Number.isFinite(value)) return "Saisissez un nombre";
  if (value <= 0) return "Le taux doit être strictement positif";
  if (value < MIN_RATE || value > MAX_RATE) return `Le taux doit être compris entre ${MIN_RATE} et ${MAX_RATE.toLocaleString("fr-CI")} FCFA`;
  return null;
}

export default function AdminExchangeRates() {
  const { data: rates, isLoading } = useListExchangeRates({ query: { queryKey: getListExchangeRatesQueryKey() } });
  const updateRate = useUpdateExchangeRate();
  const deleteRate = useDeleteExchangeRate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Currency being edited in the dialog (null = dialog closed)
  const [editing, setEditing] = useState<ExchangeRateCurrency | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  // Refreshes this table and the currency picker / prices everywhere
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListExchangeRatesQueryKey() });

  const openEdit = (currency: ExchangeRateCurrency) => {
    const rate = rates?.find((r) => r.currency === currency);
    setValue(rate ? String(rate.fcfaPerUnit) : "");
    setError(null);
    setEditing(currency);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const validationError = validateRate(value);
    setError(validationError);
    if (validationError) return;

    updateRate.mutate(
      { currency: editing, data: { fcfaPerUnit: parseRate(value) } },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `Taux ${editing} enregistré` });
          setEditing(null);
        },
        onError: onErrorToast,
      }
    );
  };

  const handleDelete = (currency: ExchangeRateCurrency) => {
    if (!confirm(`Supprimer le taux ${currency} ? Cette devise ne sera plus proposée aux visiteurs.`)) return;
    deleteRate.mutate(
      { currency },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `Taux ${currency} supprimé` });
        },
        onError: onErrorToast,
      }
    );
  };

  const editingName = CURRENCIES.find((c) => c.code === editing)?.name;
  const editingHasRate = !!rates?.some((r) => r.currency === editing);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-foreground mb-4">Taux de change</h1>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-8 text-sm flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Le taux est le <strong>nombre de FCFA pour 1 unité</strong> de la devise (par exemple 1 € = 655,957 FCFA).
          </p>
          <p className="text-muted-foreground">
            Il sert uniquement à afficher des équivalents indicatifs aux visiteurs étrangers : les prix, les paiements et
            les réservations restent toujours en FCFA. Une devise sans taux n'est pas proposée dans le sélecteur.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Devise</TableHead>
              <TableHead>Taux actuel</TableHead>
              <TableHead>Dernière mise à jour</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : (
              CURRENCIES.map(({ code, name }) => {
                const rate = rates?.find((r) => r.currency === code);
                return (
                  <TableRow key={code}>
                    <TableCell>
                      <div className="font-bold">{code}</div>
                      <div className="text-xs text-muted-foreground">{name}</div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {rate ? `${rate.fcfaPerUnit.toLocaleString("fr-CI", { maximumFractionDigits: 4 })} FCFA` : (
                        <span className="text-muted-foreground font-sans italic">non renseigné</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rate ? format(parseISO(rate.updatedAt), "dd/MM/yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {rate ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(code)} className="text-muted-foreground hover:text-primary" aria-label={`Modifier le taux ${code}`} title="Modifier">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(code)}
                            disabled={code === "EUR" || deleteRate.isPending}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Supprimer le taux ${code}`}
                            title={code === "EUR" ? "Le taux EUR est fixe : il peut être modifié mais pas supprimé" : "Supprimer"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => openEdit(code)} className="gap-1">
                          <Plus className="w-4 h-4" /> Ajouter
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Le taux EUR correspond à la parité fixe officielle : il peut être modifié mais pas supprimé (il est recréé automatiquement au démarrage du serveur).
      </p>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHasRate ? "Modifier" : "Ajouter"} le taux {editing}</DialogTitle>
            <DialogDescription>
              Nombre de FCFA pour 1 {editingName?.toLowerCase()} ({editing}).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Taux (FCFA pour 1 {editing})</label>
              <Input
                inputMode="decimal"
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                placeholder="ex : 600"
                aria-invalid={!!error}
                autoFocus
              />
              {error && <p className="text-xs text-destructive mt-1">{error}</p>}
              {editing === "EUR" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Taux fixe officiel : {EUR_FIXED_RATE.toLocaleString("fr-CI", { maximumFractionDigits: 3 })}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Valeur acceptée : entre {MIN_RATE} et {MAX_RATE.toLocaleString("fr-CI")}.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={updateRate.isPending}>
              Enregistrer
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
