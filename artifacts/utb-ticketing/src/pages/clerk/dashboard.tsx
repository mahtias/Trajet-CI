import { useGetClerkTrips } from "@workspace/api-client-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Users, Clock, ArrowRight } from "lucide-react";
import { Link } from "wouter";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ClerkDashboard() {
  const { data: trips, isLoading } = useGetClerkTrips();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl"></div>)}
        </div>
      </div>
    );
  }

  const todayStr = format(new Date(), "EEEE d MMMM yyyy", { locale: fr });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ventes au Guichet</h1>
          <p className="text-muted-foreground capitalize">{todayStr}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/clerk/validate">Validation QR Code</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trips?.map(trip => {
          const occupancyRate = ((trip.totalSeats - trip.availableSeats) / trip.totalSeats) * 100;
          
          return (
            <Card key={trip.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-lg">
                    {trip.origin} <ArrowRight className="w-4 h-4 text-primary" /> {trip.destination}
                  </span>
                  <span className="text-2xl font-bold text-secondary font-mono">
                    {trip.departureTime.slice(0, 5)}
                  </span>
                </CardTitle>
                <div className="text-sm font-medium px-2 py-1 bg-secondary/10 text-secondary w-fit rounded">
                  {trip.companyName}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{trip.totalSeats - trip.availableSeats} / {trip.totalSeats} places</span>
                  </div>
                  <div className="font-mono font-bold text-accent">
                    {trip.price.toLocaleString("fr-CI")} F
                  </div>
                </div>

                <div className="w-full h-2 bg-muted rounded-full mb-6 overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all" 
                    style={{ width: `${occupancyRate}%` }}
                  ></div>
                </div>

                <Button asChild className="w-full" disabled={trip.status === "cancelled"}>
                  <Link href={`/clerk/trips/${trip.id}`}>
                    Gérer le voyage
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {trips?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-xl border border-border">
            Aucun voyage assigné pour aujourd'hui.
          </div>
        )}
      </div>
    </div>
  );
}
