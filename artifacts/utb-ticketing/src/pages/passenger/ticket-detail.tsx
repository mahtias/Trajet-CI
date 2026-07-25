import { useParams } from "wouter";
import { format } from "date-fns";
import { useGetTicket, useCancelTicket, getGetTicketQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Clock, Calendar as CalendarIcon, ArrowLeft, Download, ShieldCheck, Hotel, XCircle, Ban } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getPaymentMethod } from "@/lib/payment-methods";

const ADVANCE_FEE_PERCENT = 5;
const SAME_DAY_FEE_PERCENT = 25;

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const ticketId = parseInt(id, 10);
  const { t, dateLocale } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cancelTicket = useCancelTicket();

  const { data: ticket, isLoading } = useGetTicket(ticketId, {
    query: { enabled: !!ticketId }
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        {t("ticketDetail.notFound")}
      </div>
    );
  }

  const method = getPaymentMethod(ticket.paymentMethod);

  const departureAt = new Date(`${ticket.departureDate}T${ticket.departureTime}`);
  const hoursUntilDeparture = (departureAt.getTime() - Date.now()) / (60 * 60 * 1000);
  const isCancelled = !!ticket.cancelledAt;
  const canCancel = !isCancelled && !ticket.validated && hoursUntilDeparture > 0;
  const previewFeePercent = hoursUntilDeparture >= 24 ? ADVANCE_FEE_PERCENT : SAME_DAY_FEE_PERCENT;
  const previewRefund = Math.round(ticket.price * (1 - previewFeePercent / 100) * 100) / 100;

  const handleCancel = () => {
    cancelTicket.mutate(
      { ticketId },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(ticketId) });
          toast({
            title: t("ticketDetail.cancelSuccessTitle"),
            description: t("ticketDetail.cancelSuccessDesc", { amount: res.refundAmount.toLocaleString("fr-CI") }),
          });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.message || t("ticketDetail.cancelError"),
          });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/tickets">
          <ArrowLeft className="w-4 h-4 mr-2" /> {t("common.back")}
        </Link>
      </Button>

      <Card className="border-border shadow-lg overflow-hidden bg-card relative">
        {/* Ticket styling cutouts */}
        <div className="absolute top-[280px] -left-4 w-8 h-8 bg-background rounded-full border-r border-border"></div>
        <div className="absolute top-[280px] -right-4 w-8 h-8 bg-background rounded-full border-l border-border"></div>
        
        <CardContent className="p-0">
          {/* Header */}
          <div className="bg-secondary text-secondary-foreground p-6 text-center">
            <h2 className="text-xl font-bold tracking-widest">{ticket.companyName}</h2>
            <p className="text-secondary-foreground/60 text-sm">{t("ticketDetail.eTicket")}</p>
          </div>

          {/* QR Code Section */}
          <div className="p-8 flex flex-col items-center justify-center border-b-2 border-dashed border-border pb-10">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-border/50 mb-4">
              <img src={ticket.qrCode} alt="QR Code" className={cn("w-48 h-48", isCancelled && "opacity-30 grayscale")} />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">{t("ticketDetail.ticketNumber")}</p>
              <p className="font-mono font-bold tracking-widest text-lg">{ticket.id.toString().padStart(6, '0')}</p>
            </div>
          </div>

          {/* Details Section */}
          <div className="p-6 bg-card">
            <div className="flex justify-between items-center mb-6">
              <div className="text-center w-5/12">
                <p className="text-2xl font-bold font-sans">{ticket.origin.substring(0, 3).toUpperCase()}</p>
                <p className="text-sm text-muted-foreground">{ticket.origin}</p>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-full h-px bg-border relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </div>
              <div className="text-center w-5/12">
                <p className="text-2xl font-bold font-sans">{ticket.destination.substring(0, 3).toUpperCase()}</p>
                <p className="text-sm text-muted-foreground">{ticket.destination}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {t("common.date")}</p>
                <p className="font-semibold">{format(new Date(ticket.departureDate), "d MMM yyyy", { locale: dateLocale })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {t("common.time")}</p>
                <p className="font-semibold">{ticket.departureTime.slice(0, 5)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-6">
              <span className="text-xs text-muted-foreground uppercase">{t("ticketDetail.paymentMethod")}</span>
              <span className={cn("text-xs font-bold px-2 py-1 rounded-full", method.badgeClass)}>
                {method.name}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{t("common.passenger")}</p>
                <p className="font-bold">{ticket.passengerName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase">{t("common.seat")}</p>
                <p className="text-3xl font-black text-primary leading-none">{ticket.seatNumber}</p>
              </div>
            </div>

            {ticket.validated && (
              <div className="mt-6 flex items-center justify-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                <ShieldCheck className="w-5 h-5" />
                <span className="font-semibold text-sm">{t("ticketDetail.validated")}</span>
              </div>
            )}

            {isCancelled && (
              <div className="mt-6 flex items-center justify-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                <XCircle className="w-5 h-5" />
                <span className="font-semibold text-sm">{t("ticketDetail.cancelledBanner")}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button className="w-full mt-6 h-12" variant="outline" onClick={() => window.print()}>
        <Download className="w-4 h-4 mr-2" /> {t("ticketDetail.downloadPrint")}
      </Button>

      {!isCancelled && (
        <Button asChild className="w-full mt-3 h-12">
          <Link href={`/hotels?city=${encodeURIComponent(ticket.destination)}`}>
            <Hotel className="w-4 h-4 mr-2" /> Voir les hôtels à {ticket.destination}
          </Link>
        </Button>
      )}

      {canCancel && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full mt-3 h-12" variant="outline">
              <Ban className="w-4 h-4 mr-2 text-destructive" /> {t("ticketDetail.cancelButton")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("ticketDetail.cancelConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("ticketDetail.cancelConfirmDesc", {
                  feePercent: previewFeePercent,
                  hoursNote: t(hoursUntilDeparture >= 24 ? "ticketDetail.cancelHoursNoteAdvance" : "ticketDetail.cancelHoursNoteSameDay"),
                  refundAmount: previewRefund.toLocaleString("fr-CI"),
                  price: ticket.price.toLocaleString("fr-CI"),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("ticketDetail.cancelDismiss")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel} disabled={cancelTicket.isPending}>
                {t("ticketDetail.cancelConfirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
