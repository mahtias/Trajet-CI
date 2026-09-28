import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  useGetTicket,
  getGetTicketQueryKey,
  useGetTripLocation,
  getGetTripLocationQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, BusFront, Loader2, Lock, Radio, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TripMap } from "@/components/trip-map";
import { createTripSocket, joinTrip, type LiveLocation } from "@/lib/trip-socket";

type LiveStatus = "connecting" | "live" | "reconnecting" | "denied";

export default function TrackTrip() {
  const { id } = useParams<{ id: string }>();
  const ticketId = parseInt(id, 10);

  const { data: ticket, isLoading: ticketLoading } = useGetTicket(ticketId, {
    query: { queryKey: getGetTicketQueryKey(ticketId), enabled: !!ticketId },
  });
  const tripId = ticket?.tripId ?? 0;
  const canTrack = !!ticket && ticket.paymentStatus === "paid" && !ticket.cancelledAt;

  // First display from REST, then live updates from the socket
  const { data: initialLocation, error: locationError, isLoading: locationLoading } = useGetTripLocation(tripId, {
    query: { queryKey: getGetTripLocationQueryKey(tripId), enabled: canTrack, retry: false },
  });
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!canTrack) return;
    const socket = createTripSocket();

    // Rooms are lost on reconnection: re-join on every (re)connect
    socket.on("connect", async () => {
      const ack = await joinTrip(socket, tripId);
      if (!ack.ok) {
        setLiveStatus("denied");
        socket.disconnect();
        return;
      }
      if (ack.location) setLiveLocation(ack.location);
      setLiveStatus("live");
    });
    socket.on("disconnect", () => setLiveStatus((s) => (s === "denied" ? s : "reconnecting")));
    socket.on("connect_error", () => setLiveStatus((s) => (s === "denied" ? s : "reconnecting")));
    socket.on("location:broadcast", (location: LiveLocation) => {
      if (location.tripId === tripId) setLiveLocation(location);
    });

    return () => {
      socket.disconnect();
    };
  }, [canTrack, tripId]);

  // Refresh the "updated X ago" label
  useEffect(() => {
    const timer = window.setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const location = liveLocation ?? initialLocation ?? null;
  const locationStatus = (locationError as any)?.status as number | undefined;

  if (ticketLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href={`/tickets/${ticketId}`}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour au billet
        </Link>
      </Button>

      <h1 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
        <BusFront className="w-6 h-6 text-primary" /> Suivre mon bus
      </h1>
      {ticket && (
        <p className="text-muted-foreground mb-6 flex items-center gap-2 flex-wrap">
          {ticket.origin} <ArrowRight className="w-4 h-4" /> {ticket.destination} · {ticket.companyName} · départ {ticket.departureTime.slice(0, 5)}
        </p>
      )}

      {!canTrack || liveStatus === "denied" || locationStatus === 403 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <Lock className="w-10 h-10 mx-auto mb-3" />
            Le suivi en direct est réservé aux billets payés et non annulés pour ce voyage.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm mb-3">
            {liveStatus === "live" ? (
              <span className="flex items-center gap-2 text-green-700 font-medium"><Radio className="w-4 h-4" /> Connecté en direct</span>
            ) : liveStatus === "reconnecting" ? (
              <span className="flex items-center gap-2 text-amber-700 font-medium"><WifiOff className="w-4 h-4" /> Connexion perdue, reconnexion…</span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Connexion…</span>
            )}
            {location && (
              <span className="text-muted-foreground">
                · position mise à jour {formatDistanceToNow(parseISO(location.updatedAt), { addSuffix: true, locale: fr })}
              </span>
            )}
          </div>

          {location ? (
            <Card className="overflow-hidden">
              <TripMap latitude={location.latitude} longitude={location.longitude} className="w-full h-[28rem]" />
            </Card>
          ) : locationLoading ? (
            <div className="h-72 bg-muted animate-pulse rounded-xl"></div>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <BusFront className="w-10 h-10 mx-auto mb-3" />
                Le chauffeur n'a pas encore démarré le partage de position.
                <p className="text-xs mt-2">La carte s'affichera automatiquement dès qu'il le fera.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
