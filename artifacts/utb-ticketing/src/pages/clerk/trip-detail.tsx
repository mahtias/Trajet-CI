import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { 
  useGetTrip, 
  useGetClerkTripSeats, 
  useGetClerkPassengers 
} from "@workspace/api-client-react";
import { ArrowLeft, Users, CheckCircle2, Ticket } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function ClerkTripDetail() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id, 10);
  const [, setLocation] = useLocation();

  const { data: trip } = useGetTrip(tripId, { query: { enabled: !!tripId } });
  const { data: seats } = useGetClerkTripSeats(tripId, { 
    query: { enabled: !!tripId, refetchInterval: 5000 } 
  });
  const { data: passengers } = useGetClerkPassengers(tripId, {
    query: { enabled: !!tripId, refetchInterval: 10000 }
  });

  const handleSeatClick = (seatId: number, status: string) => {
    if (status !== "available") return;
    setLocation(`/clerk/trips/${tripId}/sell?seatId=${seatId}`);
  };

  if (!trip || !seats) {
    return <div className="p-8 text-center">Chargement...</div>;
  }

  const soldCount = seats.filter(s => s.status === "sold").length;
  const reservedCount = seats.filter(s => s.status === "reserved").length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/clerk">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour au dashboard
        </Link>
      </Button>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 bg-secondary text-secondary-foreground p-6 rounded-xl">
        <div>
          <Badge className="bg-white/20 text-white hover:bg-white/20 mb-2 border-none">
            {trip.companyName}
          </Badge>
          <h1 className="text-2xl md:text-3xl font-bold font-sans">
            {trip.origin} → {trip.destination}
          </h1>
          <p className="text-secondary-foreground/80 mt-1">Départ à {trip.departureTime.slice(0, 5)}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center px-4 border-r border-white/20">
            <p className="text-sm text-secondary-foreground/60 uppercase">Libres</p>
            <p className="text-2xl font-bold text-green-400">{trip.availableSeats}</p>
          </div>
          <div className="text-center px-4">
            <p className="text-sm text-secondary-foreground/60 uppercase">Vendues</p>
            <p className="text-2xl font-bold">{soldCount}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="map" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
          <TabsTrigger value="map">Plan du bus</TabsTrigger>
          <TabsTrigger value="passengers">Liste passagers</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card className="border-border">
            <CardContent className="p-6 md:p-8">
              <div className="mb-6 flex justify-center gap-6 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-green-300 bg-green-100"></div> Libre
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-destructive/30 bg-destructive/10"></div> Payée
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-accent/40 bg-accent/20"></div> En cours
                </div>
              </div>

              <div className="bg-muted/30 p-8 rounded-2xl max-w-md mx-auto relative border border-border">
                <div className="absolute top-0 bottom-0 left-1/2 w-12 -ml-6 bg-background rounded-full z-0 border-x border-border"></div>
                
                <div className="w-full flex justify-between px-8 text-muted-foreground text-xs font-bold uppercase mb-8 relative z-10">
                  <span>Chauffeur</span>
                  <span>Porte</span>
                </div>
                
                <div className="grid grid-cols-4 gap-4 relative z-10">
                  {seats.map((seat) => {
                    let bgColor = "bg-white hover:bg-green-50 border-green-200 text-foreground cursor-pointer shadow-sm";
                    
                    if (seat.status === "sold") {
                      bgColor = "bg-destructive/10 border-destructive/30 text-destructive cursor-not-allowed";
                    } else if (seat.status === "reserved") {
                      bgColor = "bg-accent/20 border-accent/40 text-accent-foreground cursor-not-allowed";
                    }

                    return (
                      <button
                        key={seat.id}
                        onClick={() => handleSeatClick(seat.id, seat.status)}
                        className={`aspect-square rounded-xl border-2 flex items-center justify-center font-bold text-lg transition-all ${bgColor}`}
                        title={seat.passengerName ? `Place ${seat.seatNumber} - ${seat.passengerName}` : `Place ${seat.seatNumber} libre`}
                      >
                        {seat.seatNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="passengers">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Passagers Inscrits ({passengers?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y border border-border rounded-xl overflow-hidden">
                {passengers?.map((p) => (
                  <div key={p.ticketId} className="flex justify-between items-center p-4 bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-secondary/10 text-secondary rounded-full flex items-center justify-center font-bold font-mono">
                        {p.seatNumber}
                      </div>
                      <div>
                        <p className="font-bold">{p.passengerName}</p>
                        <p className="text-sm text-muted-foreground">{p.passengerPhone}</p>
                      </div>
                    </div>
                    <div>
                      {p.validated ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 flex items-center gap-1 border-green-200">
                          <CheckCircle2 className="w-3 h-3" /> Validé
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground flex items-center gap-1">
                          <Ticket className="w-3 h-3" /> En attente
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                
                {passengers?.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    Aucun passager enregistré pour le moment.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
