import { format, parseISO } from "date-fns";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetClerkAgencyTourismBookings,
  useGetClerkAgencyVehicleBookings,
  useGetClerkAgencyHotelBookings,
  useUpdateClerkAgencyTourismBookingStatus,
  useUpdateClerkAgencyVehicleBookingStatus,
  useUpdateClerkAgencyHotelBookingStatus,
  type BookingStatusUpdateStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, Landmark, Car, Hotel } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BookingStatusBadge } from "@/components/booking-status-badge";

interface BookingRow {
  id: number;
  item: string;
  customer: string;
  when: string;
  detail: string;
  totalPrice: number;
  status: string;
}

function dateFr(d: string) {
  return format(parseISO(d), "dd/MM/yyyy");
}

function BookingsTable({ rows, isLoading, onStatus, pending }: {
  rows: BookingRow[] | undefined;
  isLoading: boolean;
  onStatus: (id: number, status: BookingStatusUpdateStatus) => void;
  pending: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Réservation</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
            </TableRow>
          ) : !rows?.length ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune réservation.</TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-bold">{row.item}</div>
                  <div className="text-xs text-muted-foreground">#{row.id} · {row.detail}</div>
                </TableCell>
                <TableCell className="text-sm">{row.customer}</TableCell>
                <TableCell className="text-sm">{row.when}</TableCell>
                <TableCell className="font-mono">{row.totalPrice.toLocaleString("fr-CI")} F</TableCell>
                <TableCell><BookingStatusBadge status={row.status} /></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {row.status === "pending" && (
                    <Button size="sm" className="gap-1 mr-2" disabled={pending} onClick={() => onStatus(row.id, "confirmed")}>
                      <Check className="w-4 h-4" /> Confirmer
                    </Button>
                  )}
                  {row.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive hover:bg-destructive/10"
                      disabled={pending}
                      onClick={() => { if (confirm("Annuler cette réservation ?")) onStatus(row.id, "cancelled"); }}
                    >
                      <X className="w-4 h-4" /> Annuler
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function useStatusFeedback(queryKey: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return {
    onSuccess: (_: unknown, vars: { data: { status: BookingStatusUpdateStatus } }) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: vars.data.status === "confirmed" ? "Réservation confirmée" : "Réservation annulée" });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
    },
  };
}

function TourismBookingsSection() {
  const { data, isLoading } = useGetClerkAgencyTourismBookings();
  const update = useUpdateClerkAgencyTourismBookingStatus();
  const feedback = useStatusFeedback("/api/clerk/agency/tourism-bookings");
  const rows = data?.map((b) => ({
    id: b.id, item: b.spotName, customer: b.userName || b.userPhone || `Client #${b.userId}`,
    when: dateFr(b.visitDate), detail: `${b.nbPeople} pers.`, totalPrice: b.totalPrice, status: b.status,
  }));
  return (
    <BookingsTable
      rows={rows}
      isLoading={isLoading}
      pending={update.isPending}
      onStatus={(bookingId, status) => update.mutate({ bookingId, data: { status } }, feedback)}
    />
  );
}

function VehicleBookingsSection() {
  const { data, isLoading } = useGetClerkAgencyVehicleBookings();
  const update = useUpdateClerkAgencyVehicleBookingStatus();
  const feedback = useStatusFeedback("/api/clerk/agency/vehicle-bookings");
  const rows = data?.map((b) => ({
    id: b.id, item: b.vehicleLabel, customer: b.userName || b.userPhone || `Client #${b.userId}`,
    when: `${dateFr(b.startDate)} → ${dateFr(b.endDate)}`, detail: "location", totalPrice: b.totalPrice, status: b.status,
  }));
  return (
    <BookingsTable
      rows={rows}
      isLoading={isLoading}
      pending={update.isPending}
      onStatus={(bookingId, status) => update.mutate({ bookingId, data: { status } }, feedback)}
    />
  );
}

function HotelBookingsSection() {
  const { data, isLoading } = useGetClerkAgencyHotelBookings();
  const update = useUpdateClerkAgencyHotelBookingStatus();
  const feedback = useStatusFeedback("/api/clerk/agency/hotel-bookings");
  const rows = data?.map((b) => ({
    id: b.id, item: b.hotelName, customer: `${b.guestName} (${b.guestPhone})`,
    when: `${dateFr(b.checkInDate)} → ${dateFr(b.checkOutDate)}`,
    detail: `${b.rooms} chambre(s) · paiement ${b.paymentStatus === "paid" ? "reçu" : "en attente"}`,
    totalPrice: b.totalPrice, status: b.status,
  }));
  return (
    <BookingsTable
      rows={rows}
      isLoading={isLoading}
      pending={update.isPending}
      onStatus={(bookingId, status) => update.mutate({ bookingId, data: { status } }, feedback)}
    />
  );
}

export default function ClerkAgencyBookings() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });

  if (me?.role === "admin") {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-8">Réservations des agences</h1>
        <Tabs defaultValue="tourism">
          <TabsList className="mb-6">
            <TabsTrigger value="tourism" className="gap-2"><Landmark className="w-4 h-4" /> Tourisme</TabsTrigger>
            <TabsTrigger value="vehicle" className="gap-2"><Car className="w-4 h-4" /> Véhicules</TabsTrigger>
            <TabsTrigger value="hotel" className="gap-2"><Hotel className="w-4 h-4" /> Hôtels</TabsTrigger>
          </TabsList>
          <TabsContent value="tourism"><TourismBookingsSection /></TabsContent>
          <TabsContent value="vehicle"><VehicleBookingsSection /></TabsContent>
          <TabsContent value="hotel"><HotelBookingsSection /></TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Réservations de l'agence</h1>
        {me?.agencyName && <p className="text-muted-foreground mt-1">{me.agencyName}</p>}
      </div>
      {me?.agencyType === "tourism" && <TourismBookingsSection />}
      {me?.agencyType === "vehicle_rental" && <VehicleBookingsSection />}
      {me?.agencyType === "hotel" && <HotelBookingsSection />}
      {me && !me.agencyType && (
        <div className="bg-muted/50 border border-border rounded-xl p-12 text-center text-muted-foreground">
          Votre compte n'est rattaché à aucune agence. Contactez un administrateur.
        </div>
      )}
    </div>
  );
}
