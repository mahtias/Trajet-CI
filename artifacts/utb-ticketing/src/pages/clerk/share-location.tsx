import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { useGetTrip, getGetTripQueryKey } from "@workspace/api-client-react";
import type { Socket } from "socket.io-client";
import { ArrowLeft, ArrowRight, Radio, MapPinOff, Loader2, Square, Navigation } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TripMap } from "@/components/trip-map";
import { createTripSocket, joinTrip } from "@/lib/trip-socket";

/** Positions are sent at most this often, whatever rate watchPosition fires at. */
const SEND_INTERVAL_MS = 15_000;

type Status = "idle" | "connecting" | "sharing" | "error";

interface Coords {
  latitude: number;
  longitude: number;
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return "La géolocalisation a été refusée. Autorisez l'accès à la position pour ce site dans les réglages du navigateur, puis réessayez.";
  }
  if (err.code === err.POSITION_UNAVAILABLE) return "Position indisponible (GPS désactivé ou signal trop faible).";
  return "Impossible d'obtenir la position (délai dépassé).";
}

export default function ClerkShareLocation() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id, 10);
  const { data: trip } = useGetTrip(tripId, { query: { queryKey: getGetTripQueryKey(tripId), enabled: !!tripId } });

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Coords | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const latestRef = useRef<Coords | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const sendLatest = () => {
    const socket = socketRef.current;
    const coords = latestRef.current;
    if (!socket?.connected || !coords) return;
    socket.emit("location:update", { tripId, ...coords }, (ack: { ok: boolean; error?: string }) => {
      if (ack?.ok) {
        setLastSentAt(new Date());
        setError(null);
      } else if (ack?.error) {
        setError(ack.error);
      }
    });
  };

  const stopSharing = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    watchIdRef.current = null;
    intervalRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  useEffect(() => stopSharing, []);

  const startSharing = async () => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Ce navigateur ne permet pas la géolocalisation.");
      return;
    }
    setStatus("connecting");
    setError(null);

    const socket = createTripSocket();
    socketRef.current = socket;
    socket.on("connect_error", (err) => {
      setStatus("error");
      setError(`Connexion au serveur impossible : ${err.message}`);
    });
    // Rooms are lost on reconnection: re-join every time the socket (re)connects
    socket.on("connect", async () => {
      const ack = await joinTrip(socket, tripId);
      if (!ack.ok || ack.role !== "driver") {
        setStatus("error");
        setError(ack.error ?? "Vous ne pouvez pas partager la position de ce voyage.");
        stopSharing();
        return;
      }
      setStatus("sharing");
      sendLatest();
    });

    let firstFix = true;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setPosition(latestRef.current);
        // Send the first fix right away, then let the interval throttle the rest
        if (firstFix) {
          firstFix = false;
          sendLatest();
        }
      },
      (err) => {
        setStatus("error");
        setError(geolocationErrorMessage(err));
        stopSharing();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    intervalRef.current = window.setInterval(sendLatest, SEND_INTERVAL_MS);

    // Best effort: keep the screen on, otherwise the phone may pause the page and stop sharing
    try {
      wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
    } catch {
      // not supported or refused: sharing still works while the screen is on
    }
  };

  const handleStop = () => {
    stopSharing();
    setStatus("idle");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/clerk">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Link>
      </Button>

      <h1 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
        <Navigation className="w-6 h-6 text-primary" /> Partager ma position
      </h1>
      {trip && (
        <p className="text-muted-foreground mb-6 flex items-center gap-2 flex-wrap">
          {trip.origin} <ArrowRight className="w-4 h-4" /> {trip.destination} · départ {trip.departureTime.slice(0, 5)}
        </p>
      )}

      {!window.isSecureContext && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl mb-6 text-sm">
          La géolocalisation n'est disponible que sur une connexion sécurisée (HTTPS) ou en local.
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="p-6">
          {status === "sharing" ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <div>
                  <p className="font-bold text-green-700 flex items-center gap-2"><Radio className="w-4 h-4" /> Partage en cours</p>
                  <p className="text-sm text-muted-foreground">
                    {lastSentAt ? `Dernier envoi à ${format(lastSentAt, "HH:mm:ss")}` : "En attente de la première position GPS…"}
                    {" "}· envoi toutes les {SEND_INTERVAL_MS / 1000} s
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={handleStop} className="gap-2 text-destructive">
                <Square className="w-4 h-4" /> Arrêter
              </Button>
            </div>
          ) : status === "connecting" ? (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Connexion et recherche de la position…</p>
          ) : (
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                Les passagers ayant un billet payé pour ce voyage verront la position du bus en direct.
                Gardez cette page ouverte et l'écran allumé pendant le trajet.
              </p>
              <Button size="lg" onClick={startSharing} className="gap-2" disabled={trip?.status === "cancelled"}>
                <Radio className="w-5 h-5" /> {status === "error" ? "Réessayer" : "Démarrer le partage"}
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-destructive/10 text-destructive p-3 rounded-lg text-sm flex items-start gap-2">
              <MapPinOff className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </CardContent>
      </Card>

      {position && (
        <Card className="overflow-hidden">
          <TripMap latitude={position.latitude} longitude={position.longitude} className="w-full h-72" />
          <CardContent className="p-3 text-xs text-muted-foreground font-mono">
            {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
