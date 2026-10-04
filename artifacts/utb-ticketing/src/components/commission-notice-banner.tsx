import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  useGetCommissionNotice,
  getGetCommissionNoticeQueryKey,
  useAcknowledgeCommissionNotice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";

const formatPercent = (value: number) => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

/**
 * Company admin dashboard: announced commission change, until it applies or the admin closes it.
 * The server decides (it returns null for the super admin, once dismissed, or with nothing pending).
 */
export function CommissionNoticeBanner() {
  const queryClient = useQueryClient();
  const { data } = useGetCommissionNotice({ query: { queryKey: getGetCommissionNoticeQueryKey() } });
  const acknowledge = useAcknowledgeCommissionNotice();
  const notice = data?.notice;
  if (!notice) return null;

  return (
    <div role="alert" className="mb-8 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <Megaphone className="w-6 h-6 text-amber-600 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-bold text-foreground">
          Le taux de commission plateforme passera de {formatPercent(notice.currentPercent)} à {formatPercent(notice.newPercent)} le{" "}
          {format(parseISO(notice.effectiveAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}.
        </p>
        <p className="text-muted-foreground mt-1">
          La commission s'ajoute au tarif payé par le passager : votre tarif vous reste versé en entier. Les billets vendus avant cette date gardent l'ancien taux.
        </p>
      </div>
      <Button
        variant="outline"
        className="shrink-0"
        disabled={acknowledge.isPending}
        onClick={() => acknowledge.mutate(undefined, {
          onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCommissionNoticeQueryKey() }),
        })}
      >
        J'ai compris
      </Button>
    </div>
  );
}
