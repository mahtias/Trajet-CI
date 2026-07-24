import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useGetHotelBooking } from "@workspace/api-client-react";
import { MapPin, Calendar as CalendarIcon, ArrowLeft, Download, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPaymentMethod } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

export default function HotelBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const bookingId = parseInt(id, 10);

  const { data: booking, isLoading } = useGetHotelBooking(bookingId, { query: { enabled: !!bookingId } });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        Réservation non trouvée.
      </div>
    );
  }

  const method = getPaymentMethod(booking.paymentMethod);

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/hotel-bookings">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Link>
      </Button>

      <Card className="border-border shadow-lg overflow-hidden bg-card relative">
        <div className="absolute top-[240px] -left-4 w-8 h-8 bg-background rounded-full border-r border-border"></div>
        <div className="absolute top-[240px] -right-4 w-8 h-8 bg-background rounded-full border-l border-border"></div>

        <CardContent className="p-0">
          <div className="bg-secondary text-secondary-foreground p-6 text-center">
            <h2 className="text-xl font-bold tracking-widest">{booking.hotelName}</h2>
            <p className="text-secondary-foreground/60 text-sm">Confirmation de réservation</p>
          </div>

          <div className="p-8 flex flex-col items-center justify-center border-b-2 border-dashed border-border pb-10">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-border/50 mb-4">
              <img src={booking.qrCode} alt="QR Code" className="w-48 h-48" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">N° de Réservation</p>
              <p className="font-mono font-bold tracking-widest text-lg">{booking.id.toString().padStart(6, '0')}</p>
            </div>
          </div>

          <div className="p-6 bg-card">
            <div className="flex items-center gap-2 mb-4 text-foreground">
              <MapPin className="w-4 h-4 text-primary" /> <span className="font-semibold">{booking.city}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Arrivée</p>
                <p className="font-semibold">{format(new Date(booking.checkInDate), "d MMM yyyy", { locale: fr })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Départ</p>
                <p className="font-semibold">{format(new Date(booking.checkOutDate), "d MMM yyyy", { locale: fr })}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-muted-foreground uppercase">Moyen de paiement</span>
              <span className={cn("text-xs font-bold px-2 py-1 rounded-full", method.badgeClass)}>
                {method.name}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Client</p>
                <p className="font-bold">{booking.guestName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase flex items-center gap-1 justify-end"><Users className="w-3 h-3" /> Chambres</p>
                <p className="text-3xl font-black text-primary leading-none">{booking.rooms}</p>
              </div>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
              <span className="text-muted-foreground">Total payé</span>
              <span className="font-mono font-bold text-lg text-accent">{booking.totalPrice.toLocaleString("fr-CI")} FCFA</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full mt-6 h-12" variant="outline" onClick={() => window.print()}>
        <Download className="w-4 h-4 mr-2" /> Télécharger / Imprimer
      </Button>
    </div>
  );
}
