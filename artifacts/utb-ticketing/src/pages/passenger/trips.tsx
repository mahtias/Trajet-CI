import { useLocation } from "wouter";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useSearchTrips } from "@workspace/api-client-react";
import { Clock, Users, ArrowRight, Info, AlertCircle } from "lucide-react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Trips() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const origin = searchParams.get("origin") || "";
  const destination = searchParams.get("destination") || "";
  const dateStr = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");

  const { data: trips, isLoading, isError } = useSearchTrips(
    { origin, destination, date: dateStr },
    { query: { enabled: !!origin && !!destination && !!dateStr } }
  );

  const displayDate = dateStr ? format(new Date(dateStr), "EEEE d MMMM yyyy", { locale: fr }) : "";

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex flex-col gap-2 mb-8 bg-card p-6 rounded-xl border border-border shadow-sm">
        <h1 className="text-2xl md:text-3xl font-bold flex flex-wrap items-center gap-3 text-foreground">
          {origin} <ArrowRight className="text-primary w-6 h-6" /> {destination}
        </h1>
        <p className="text-muted-foreground capitalize flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5" /> {displayDate}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-6 h-6" />
          <p>Impossible de charger les trajets pour le moment.</p>
        </div>
      )}

      {trips && trips.length === 0 && (
        <div className="text-center py-20 bg-muted/50 rounded-xl border border-border">
          <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Aucun voyage disponible</h2>
          <p className="text-muted-foreground">Aucun départ trouvé pour cette date. Veuillez essayer une autre date.</p>
          <Button asChild className="mt-6" variant="outline">
            <Link href="/">Modifier la recherche</Link>
          </Button>
        </div>
      )}

      {trips && trips.length > 0 && (
        <div className="space-y-4">
          {trips.map((trip) => {
            const h = Math.floor(trip.durationMinutes / 60);
            const m = trip.durationMinutes % 60;
            const durationStr = `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`;

            return (
              <Card key={trip.id} className="overflow-hidden hover:shadow-md transition-shadow hover:border-primary/40 border-border bg-card">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row items-center justify-between">
                    <div className="p-6 flex-1 w-full border-b md:border-b-0 md:border-r border-border">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="inline-block px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-bold mb-2">
                            {trip.companyName}
                          </span>
                          <div className="flex items-center gap-4 text-3xl font-bold font-sans">
                            {trip.departureTime.slice(0, 5)}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold text-accent font-mono">
                            {trip.price.toLocaleString("fr-CI")} FCFA
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" /> Trajet: {durationStr}
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" /> {trip.availableSeats} places libres
                        </div>
                      </div>
                    </div>
                    <div className="p-6 w-full md:w-auto bg-muted/20 flex items-center justify-center">
                      <Button asChild size="lg" className="w-full md:w-auto text-base" disabled={trip.availableSeats === 0}>
                        <Link href={`/trips/${trip.id}`}>
                          {trip.availableSeats > 0 ? "Choisir une place" : "Complet"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
