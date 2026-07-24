import { useGetMyHotelBookings } from "@workspace/api-client-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Hotel as HotelIcon, MapPin, ArrowRight } from "lucide-react";
import { Link } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HotelBookings() {
  const { data: bookings, isLoading } = useGetMyHotelBookings();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Mes réservations d'hôtel</h1>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-foreground flex items-center gap-3">
        <HotelIcon className="w-8 h-8 text-primary" /> Mes réservations d'hôtel
      </h1>

      {bookings?.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-xl border border-border">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <HotelIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">Aucune réservation</h2>
          <p className="text-muted-foreground mb-6">Vous n'avez pas encore réservé d'hôtel.</p>
          <Button asChild>
            <Link href="/hotels">Rechercher un hôtel</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bookings?.map((booking) => (
            <Link key={booking.id} href={`/hotel-bookings/${booking.id}`} className="block group">
              <Card className="overflow-hidden hover:border-primary/50 transition-all hover:shadow-md bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold px-2 py-1 bg-secondary/10 text-secondary rounded-md">
                      {booking.paymentStatus === "paid" ? "Confirmée" : "En attente"}
                    </span>
                  </div>
                  <div className="font-bold text-lg text-foreground">{booking.hotelName}</div>
                  <div className="text-muted-foreground text-sm flex items-center gap-1 mt-1 mb-2">
                    <MapPin className="w-3 h-3" /> {booking.city}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(booking.checkInDate), "d MMM", { locale: fr })} → {format(new Date(booking.checkOutDate), "d MMM yyyy", { locale: fr })}
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
                    <span className="font-mono font-bold text-accent">{booking.totalPrice.toLocaleString("fr-CI")} FCFA</span>
                    <span className="font-medium text-primary flex items-center gap-1 text-sm group-hover:translate-x-1 transition-transform">
                      Voir <ArrowRight className="w-4 h-4" />
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
