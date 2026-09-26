import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { useGetMyTourismBookings, useGetMyVehicleBookings } from "@workspace/api-client-react";
import { Landmark, Car, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookingStatusBadge } from "@/components/booking-status-badge";

export default function MyBookings() {
  const { data: tourismBookings, isLoading: tourismLoading } = useGetMyTourismBookings();
  const { data: vehicleBookings, isLoading: vehicleLoading } = useGetMyVehicleBookings();

  const isLoading = tourismLoading || vehicleLoading;
  const isEmpty = !isLoading && !tourismBookings?.length && !vehicleBookings?.length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-foreground mb-8">Mes réservations tourisme & location</h1>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl"></div>)}
        </div>
      )}

      {isEmpty && (
        <div className="text-center py-16 bg-muted/50 rounded-xl border border-border">
          <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Vous n'avez encore aucune réservation.</p>
          <div className="flex justify-center gap-3">
            <Button asChild variant="outline"><Link href="/tourism">Voir les sites touristiques</Link></Button>
            <Button asChild variant="outline"><Link href="/vehicles">Louer un véhicule</Link></Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tourismBookings?.map((b) => (
          <Card key={`t-${b.id}`}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> {b.spotName}</p>
                <p className="text-sm text-muted-foreground">
                  Visite le {format(parseISO(b.visitDate), "dd/MM/yyyy")} · {b.nbPeople} personne(s)
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-bold font-mono">{b.totalPrice.toLocaleString("fr-CI")} FCFA</span>
                <BookingStatusBadge status={b.status} />
              </div>
            </CardContent>
          </Card>
        ))}
        {vehicleBookings?.map((b) => (
          <Card key={`v-${b.id}`}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold flex items-center gap-2"><Car className="w-4 h-4 text-primary" /> {b.vehicleLabel}</p>
                <p className="text-sm text-muted-foreground">
                  Du {format(parseISO(b.startDate), "dd/MM/yyyy")} au {format(parseISO(b.endDate), "dd/MM/yyyy")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-bold font-mono">{b.totalPrice.toLocaleString("fr-CI")} FCFA</span>
                <BookingStatusBadge status={b.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
