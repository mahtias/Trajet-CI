import { useParams } from "wouter";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useGetTicket } from "@workspace/api-client-react";
import { MapPin, Clock, Calendar as CalendarIcon, ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const ticketId = parseInt(id, 10);

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
        Billet introuvable.
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/tickets">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
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
            <p className="text-secondary-foreground/60 text-sm">Billet Électronique</p>
          </div>

          {/* QR Code Section */}
          <div className="p-8 flex flex-col items-center justify-center border-b-2 border-dashed border-border pb-10">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-border/50 mb-4">
              <img src={ticket.qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">N° de Billet</p>
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
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Date</p>
                <p className="font-semibold">{format(new Date(ticket.departureDate), "d MMM yyyy", { locale: fr })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Heure</p>
                <p className="font-semibold">{ticket.departureTime.slice(0, 5)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Passager</p>
                <p className="font-bold">{ticket.passengerName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase">Place</p>
                <p className="text-3xl font-black text-primary leading-none">{ticket.seatNumber}</p>
              </div>
            </div>

            {ticket.validated && (
              <div className="mt-6 flex items-center justify-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                <ShieldCheck className="w-5 h-5" />
                <span className="font-semibold text-sm">Billet Validé</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Button className="w-full mt-6 h-12" variant="outline" onClick={() => window.print()}>
        <Download className="w-4 h-4 mr-2" /> Télécharger / Imprimer
      </Button>
    </div>
  );
}
