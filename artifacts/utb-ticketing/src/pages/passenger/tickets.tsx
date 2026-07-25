import { useGetMyTickets } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Ticket as TicketIcon, Clock, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";

export default function Tickets() {
  const { data: tickets, isLoading } = useGetMyTickets();
  const { t, dateLocale } = useLanguage();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">{t("tickets.title")}</h1>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-foreground flex items-center gap-3">
        <TicketIcon className="w-8 h-8 text-primary" /> {t("tickets.title")}
      </h1>

      {tickets?.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-xl border border-border">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <TicketIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t("tickets.emptyTitle")}</h2>
          <p className="text-muted-foreground mb-6">{t("tickets.emptyDesc")}</p>
          <Button asChild>
            <Link href="/">{t("tickets.searchTrip")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tickets?.map((ticket) => (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="block group">
              <Card className="overflow-hidden hover:border-primary/50 transition-all hover:shadow-md bg-card border-border">
                <CardContent className="p-0">
                  <div className="flex border-b border-border border-dashed">
                    <div className="p-4 flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold px-2 py-1 bg-secondary/10 text-secondary rounded-md">
                          {ticket.companyName}
                        </span>
                        {ticket.cancelledAt ? (
                          <span className="text-xs font-bold px-2 py-1 bg-destructive/10 text-destructive rounded-md">{t("tickets.cancelled")}</span>
                        ) : ticket.validated ? (
                          <span className="text-xs font-bold px-2 py-1 bg-muted text-muted-foreground rounded-md flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {t("tickets.used")}
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-md">{t("tickets.valid")}</span>
                        )}
                      </div>
                      <div className="font-bold text-lg flex items-center gap-2 text-foreground">
                        {ticket.origin} <ArrowRight className="w-4 h-4 text-primary" /> {ticket.destination}
                      </div>
                      <div className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(ticket.departureDate), "d MMM yyyy", { locale: dateLocale })} - {ticket.departureTime.slice(0, 5)}
                      </div>
                    </div>
                    <div className="bg-muted p-4 flex flex-col items-center justify-center border-l border-border border-dashed min-w-[100px]">
                      <span className="text-xs text-muted-foreground uppercase">{t("common.seat")}</span>
                      <span className="text-3xl font-black text-secondary">{ticket.seatNumber}</span>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-card flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{ticket.passengerName}</span>
                    <span className="font-medium text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      {t("tickets.viewQr")} <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
