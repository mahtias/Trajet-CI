import { useState } from "react";
import { useParams, Link } from "wouter";
import { format, addDays, parseISO } from "date-fns";
import {
  useGetTourismSpot,
  getGetTourismSpotQueryKey,
  useCreateTourismBooking,
  useGetMe,
  getGetMeQueryKey,
  type TourismBooking,
} from "@workspace/api-client-react";
import { ArrowLeft, MapPin, Users, Landmark, CheckCircle2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ImageGallery } from "@/components/image-gallery";
import { Price, PaymentAmount } from "@/components/price";

export default function TourismDetail() {
  const { id } = useParams<{ id: string }>();
  const spotId = parseInt(id, 10);

  const { data: spot, isLoading } = useGetTourismSpot(spotId, {
    query: { queryKey: getGetTourismSpotQueryKey(spotId), enabled: !!spotId },
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const createBooking = useCreateTourismBooking();

  const [visitDate, setVisitDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [nbPeople, setNbPeople] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<TourismBooking | null>(null);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!spot) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        Site touristique non trouvé.
      </div>
    );
  }

  const estimatedTotal = spot.price * nbPeople;

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createBooking.mutate(
      { data: { spotId, visitDate, nbPeople } },
      {
        onSuccess: (created) => setBooking(created),
        onError: (err: any) => setError(err?.data?.error ?? err?.message ?? "Réservation impossible"),
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/tourism">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Link>
      </Button>

      <Card className="border-border shadow-sm mb-6 overflow-hidden">
        <ImageGallery images={spot.images} alt={spot.name} icon={Landmark} />
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" /> {spot.name}
          </h1>
          <p className="text-muted-foreground flex items-center gap-1 mb-1">
            <MapPin className="w-4 h-4" /> {spot.location}
          </p>
          <p className="text-muted-foreground flex items-center gap-1 mb-4 text-sm">
            <Users className="w-4 h-4" /> {spot.capacityPerDay} visiteurs par jour · proposé par {spot.agencyName}
          </p>
          {spot.description && <p className="text-foreground/80 mb-4 whitespace-pre-line">{spot.description}</p>}
          <Price amountFcfa={spot.price} suffix="/personne" className="text-2xl font-bold text-accent font-mono" />
        </CardContent>
      </Card>

      {booking ? (
        <Card className="border-green-200 bg-green-50/50 shadow-sm">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Demande de réservation enregistrée</h2>
            <p className="text-muted-foreground mb-1">
              {booking.nbPeople} personne(s) le {format(parseISO(booking.visitDate), "dd/MM/yyyy")}
            </p>
            <div className="mb-2">
              <PaymentAmount amountFcfa={booking.totalPrice} align="center" className="font-bold font-mono text-lg text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Statut : en attente. L'agence confirmera votre réservation à réception du paiement.
            </p>
            <Button asChild variant="outline">
              <Link href="/my-bookings">Voir mes réservations</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border shadow-sm">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" /> Réserver une visite
            </h2>
            <form onSubmit={handleBook} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Date de visite</label>
                  <Input
                    type="date"
                    value={visitDate}
                    min={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => setVisitDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Nombre de personnes</label>
                  <Input
                    type="number"
                    min={1}
                    max={spot.capacityPerDay}
                    value={nbPeople}
                    onChange={(e) => setNbPeople(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20">
                <span className="text-muted-foreground">Total estimé</span>
                <PaymentAmount amountFcfa={estimatedTotal} className="text-2xl font-bold text-primary font-mono" />
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">{error}</div>
              )}

              {me ? (
                <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={createBooking.isPending}>
                  Réserver
                </Button>
              ) : (
                <Button asChild size="lg" className="w-full h-14 text-lg font-bold">
                  <Link href="/login">Se connecter pour réserver</Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Le prix final et la disponibilité sont vérifiés au moment de la réservation.
              </p>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
