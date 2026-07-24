import { useParams, useLocation, Link } from "wouter";
import { format, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useGetHotel } from "@workspace/api-client-react";
import { ArrowLeft, MapPin, Star, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HotelDetail() {
  const { id } = useParams<{ id: string }>();
  const hotelId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);

  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const rooms = parseInt(searchParams.get("rooms") || "1", 10);

  const { data: hotel, isLoading } = useGetHotel(hotelId, { query: { enabled: !!hotelId } });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        Hôtel non trouvé.
      </div>
    );
  }

  const nights = checkIn && checkOut ? Math.max(1, differenceInCalendarDays(new Date(checkOut), new Date(checkIn))) : 1;
  const totalPrice = hotel.pricePerNight * nights * rooms;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/hotels">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Link>
      </Button>

      <Card className="border-border shadow-sm mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-foreground">{hotel.name}</h1>
            {hotel.rating && (
              <span className="inline-flex items-center gap-1 text-sm font-bold text-accent">
                <Star className="w-4 h-4 fill-accent" /> {hotel.rating}
              </span>
            )}
          </div>
          <p className="text-muted-foreground flex items-center gap-1 mb-4">
            <MapPin className="w-4 h-4" /> {hotel.address}, {hotel.city}
          </p>
          {hotel.description && <p className="text-foreground/80 mb-4">{hotel.description}</p>}
          <p className="text-2xl font-bold text-accent font-mono">
            {hotel.pricePerNight.toLocaleString("fr-CI")} FCFA<span className="text-sm text-muted-foreground font-normal">/nuit</span>
          </p>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" /> Récapitulatif du séjour
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Arrivée</p>
              <p className="font-semibold">{checkIn ? format(new Date(checkIn), "d MMM yyyy", { locale: fr }) : "-"}</p>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Départ</p>
              <p className="font-semibold">{checkOut ? format(new Date(checkOut), "d MMM yyyy", { locale: fr }) : "-"}</p>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Nuits</p>
              <p className="font-semibold">{nights}</p>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Chambres</p>
              <p className="font-semibold">{rooms}</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20 mb-6">
            <span className="text-muted-foreground">Total</span>
            <span className="text-2xl font-bold text-primary font-mono">{totalPrice.toLocaleString("fr-CI")} FCFA</span>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold"
            disabled={!checkIn || !checkOut}
            onClick={() => setLocation(`/hotels/${hotelId}/checkout?checkIn=${checkIn}&checkOut=${checkOut}&rooms=${rooms}`)}
          >
            Réserver
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            La disponibilité est vérifiée au moment de la réservation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
