import { useState } from "react";
import { useParams, Link } from "wouter";
import { format, addDays, parseISO, differenceInCalendarDays } from "date-fns";
import {
  useGetVehicle,
  getGetVehicleQueryKey,
  useGetVehicleAvailability,
  getGetVehicleAvailabilityQueryKey,
  useCreateVehicleBooking,
  useGetMe,
  getGetMeQueryKey,
  type VehicleBooking,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Car, Users, CheckCircle2, XCircle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ImageGallery } from "@/components/image-gallery";

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const vehicleId = parseInt(id, 10);
  const queryClient = useQueryClient();

  const { data: vehicle, isLoading } = useGetVehicle(vehicleId, {
    query: { queryKey: getGetVehicleQueryKey(vehicleId), enabled: !!vehicleId },
  });
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const createBooking = useCreateVehicleBooking();

  const [startDate, setStartDate] = useState(format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 2), "yyyy-MM-dd"));
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<VehicleBooking | null>(null);

  const datesValid = !!startDate && !!endDate && endDate >= startDate;
  const availabilityParams = { vehicleId, startDate, endDate };
  const { data: availability, isFetching: checkingAvailability } = useGetVehicleAvailability(availabilityParams, {
    query: { queryKey: getGetVehicleAvailabilityQueryKey(availabilityParams), enabled: !!vehicleId && datesValid },
  });
  const unavailable = datesValid && availability?.available === false;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        Véhicule non trouvé.
      </div>
    );
  }

  // Both ends inclusive, like the server
  const days = datesValid ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1 : 0;
  const estimatedTotal = vehicle.pricePerDay * days;

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createBooking.mutate(
      { data: { vehicleId, startDate, endDate } },
      {
        onSuccess: (created) => {
          setBooking(created);
          queryClient.invalidateQueries({ queryKey: ["/api/vehicle-availability"] });
        },
        onError: (err: any) => setError(err?.data?.error ?? err?.message ?? "Réservation impossible"),
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button variant="ghost" asChild className="mb-6 -ml-4 text-muted-foreground">
        <Link href="/vehicles">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Link>
      </Button>

      <Card className="border-border shadow-sm mb-6 overflow-hidden">
        <ImageGallery images={vehicle.images} alt={`${vehicle.brand} ${vehicle.model}`} icon={Car} />
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Car className="w-6 h-6 text-primary" /> {vehicle.brand} {vehicle.model}
            </h1>
            <span className="text-xs px-2 py-1 rounded-md bg-secondary/10 text-secondary capitalize">{vehicle.category}</span>
          </div>
          <p className="text-muted-foreground flex items-center gap-1 mb-4 text-sm">
            <Users className="w-4 h-4" /> {vehicle.seats} places · proposé par {vehicle.agencyName}
          </p>
          <p className="text-2xl font-bold text-accent font-mono">
            {vehicle.pricePerDay.toLocaleString("fr-CI")} FCFA<span className="text-sm text-muted-foreground font-normal">/jour</span>
          </p>
        </CardContent>
      </Card>

      {booking ? (
        <Card className="border-green-200 bg-green-50/50 shadow-sm">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Demande de location enregistrée</h2>
            <p className="text-muted-foreground mb-1">
              Du {format(parseISO(booking.startDate), "dd/MM/yyyy")} au {format(parseISO(booking.endDate), "dd/MM/yyyy")} ·{" "}
              <span className="font-bold font-mono">{booking.totalPrice.toLocaleString("fr-CI")} FCFA</span>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Statut : en attente. L'agence confirmera votre location à réception du paiement.
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
              <Info className="w-5 h-5 text-primary" /> Réserver ce véhicule
            </h2>
            <form onSubmit={handleBook} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Début</label>
                  <Input
                    type="date"
                    value={startDate}
                    min={format(new Date(), "yyyy-MM-dd")}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Fin (incluse)</label>
                  <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              </div>

              {!datesValid && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
                  La date de fin doit être après la date de début.
                </div>
              )}
              {datesValid && !checkingAvailability && availability && (
                availability.available ? (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Disponible sur ces dates
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-lg text-sm font-medium">
                    <XCircle className="w-4 h-4" /> Ce véhicule est déjà réservé sur ces dates. Choisissez d'autres dates.
                  </div>
                )
              )}

              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20">
                <span className="text-muted-foreground">Total estimé ({days} jour{days > 1 ? "s" : ""})</span>
                <span className="text-2xl font-bold text-primary font-mono">{estimatedTotal.toLocaleString("fr-CI")} FCFA</span>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">{error}</div>
              )}

              {me ? (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-lg font-bold"
                  disabled={!datesValid || unavailable || checkingAvailability || createBooking.isPending}
                >
                  Réserver
                </Button>
              ) : (
                <Button asChild size="lg" className="w-full h-14 text-lg font-bold">
                  <Link href="/login">Se connecter pour réserver</Link>
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
