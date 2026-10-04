import { useState } from "react";
import { useRateTicket, getGetTicketQueryKey, getGetMyTicketsQueryKey, type TicketRating } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const COMMENT_MAX = 500;

/** Read-only stars (rating out of 5). */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("w-5 h-5", n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

/**
 * Ticket page: rating form when the trip can be rated (paid, taken, not rated yet),
 * the rating already given otherwise. Nothing for a trip that can't be rated.
 */
export function TripRating({ ticketId, companyName, rating, canRate }: { ticketId: number; companyName: string; rating: TicketRating | null | undefined; canRate: boolean | undefined }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rate = useRateTicket();
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");

  if (rating) {
    return (
      <Card className="mt-6 border-border">
        <CardContent className="p-5">
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("ticketDetail.yourRating", { company: companyName })}</p>
          <Stars value={rating.rating} />
          {rating.comment && <p className="mt-3 text-sm text-foreground whitespace-pre-line">« {rating.comment} »</p>}
        </CardContent>
      </Card>
    );
  }
  if (!canRate) return null;

  const submit = () => {
    if (stars < 1) return;
    rate.mutate(
      { ticketId, data: { rating: stars, comment: comment.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
          queryClient.invalidateQueries({ queryKey: getGetMyTicketsQueryKey() });
          toast({ title: t("ticketDetail.rateThanks") });
        },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || err?.message || t("ticketDetail.rateError") }),
      }
    );
  };

  const shown = hovered || stars;
  return (
    <Card className="mt-6 border-primary/30 bg-primary/5">
      <CardContent className="p-5 space-y-4">
        <div>
          <p className="font-bold text-foreground">{t("ticketDetail.rateTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("ticketDetail.rateDesc", { company: companyName })}</p>
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label={t("ticketDetail.rateTitle")} onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={t("ticketDetail.rateStarLabel", { count: n })}
              className="p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onMouseEnter={() => setHovered(n)}
              onClick={() => setStars(n)}
            >
              <Star className={cn("w-8 h-8 transition-colors", n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
            </button>
          ))}
        </div>
        <div>
          <Textarea
            value={comment}
            maxLength={COMMENT_MAX}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("ticketDetail.rateCommentPlaceholder")}
            rows={3}
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{comment.length}/{COMMENT_MAX}</p>
        </div>
        <Button className="w-full" disabled={stars < 1 || rate.isPending} onClick={submit}>
          {stars < 1 ? t("ticketDetail.ratePickStars") : t("ticketDetail.rateSubmit")}
        </Button>
      </CardContent>
    </Card>
  );
}
