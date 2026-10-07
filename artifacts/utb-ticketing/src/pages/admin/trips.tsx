import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  useGetAdminTrips, 
  useGetAdminRoutes,
  useCreateTrip, 
  useUpdateTrip, 
  useDeleteTrip,
  useGetCompanyBuses,
  getGetCompanyBusesQueryKey,
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, CalendarIcon, Ban } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ListPagination } from "@/components/list-pagination";
import { ListSearch, useDebouncedValue } from "@/components/list-search";
import { SearchableSelect } from "@/components/searchable-select";

const PAGE_SIZE = 20;

export default function AdminTrips() {
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());

  const { data, isLoading } = useGetAdminTrips({ date: dateFilter, search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE });
  const trips = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const { data: routesData } = useGetAdminRoutes({ page: 1, pageSize: 100 });
  const routes = routesData?.items;
  const routeOptions = (routes ?? []).map((r) => ({ value: r.id.toString(), label: `${r.origin} - ${r.destination} (${r.companyName})` }));

  const createTrip = useCreateTrip();
  const updateTrip = useUpdateTrip();
  const deleteTrip = useDeleteTrip();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [routeId, setRouteId] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [price, setPrice] = useState("");
  const [busId, setBusId] = useState("");
  // Places sold online (the rest of the bus is sold at the company's counter, outside the app)
  const [onlineSeats, setOnlineSeats] = useState("");
  const [onlineSeatsTouched, setOnlineSeatsTouched] = useState(false);
  // Edit only: the trip as it was, to keep its rules (seats already sold, current bus)
  const [editedTrip, setEditedTrip] = useState<{ heldSeats: number; onlineSeats: number; busCapacity: number; busId: string } | null>(null);

  // Buses available for the selected route's company
  const routeCompanyId = routes?.find(r => r.id.toString() === routeId)?.companyId ?? 0;
  const { data: companyBuses } = useGetCompanyBuses(routeCompanyId, {
    query: { queryKey: getGetCompanyBusesQueryKey(routeCompanyId), enabled: !!routeCompanyId },
  });
  const activeBuses = companyBuses?.filter(b => b.isActive || b.id.toString() === busId);
  const selectedBus = companyBuses?.find(b => b.id.toString() === busId);
  const busCapacity = selectedBus?.capacity ?? (editedTrip && editedTrip.busId === busId ? editedTrip.busCapacity : 0);

  /** Default for the selected bus, same rule as the server: whole bus, or the trip's number if it still fits. */
  const defaultOnlineSeats = (capacity: number) => {
    if (!editedTrip) return capacity;
    if (editedTrip.busId === busId) return editedTrip.onlineSeats;
    return editedTrip.onlineSeats >= editedTrip.busCapacity ? capacity : Math.min(editedTrip.onlineSeats, capacity);
  };
  // Follow the bus until the user sets the number themselves
  const onlineSeatsValue = onlineSeatsTouched || !busCapacity ? onlineSeats : String(defaultOnlineSeats(busCapacity));
  const onlineSeatsNumber = Number(onlineSeatsValue);
  const minOnlineSeats = Math.max(1, editedTrip?.heldSeats ?? 0);
  const onlineSeatsError = !busCapacity ? null
    : !Number.isInteger(onlineSeatsNumber) || onlineSeatsValue.trim() === "" ? "Indiquez un nombre entier de places"
    : onlineSeatsNumber > busCapacity ? `Au maximum ${busCapacity} : le bus n'a que ${busCapacity} places`
    : editedTrip && onlineSeatsNumber < editedTrip.heldSeats ? `${editedTrip.heldSeats} place(s) déjà vendue(s) ou réservée(s) en ligne : impossible de descendre en dessous de ${editedTrip.heldSeats}`
    : onlineSeatsNumber < 1 ? "Au moins 1 place doit être vendue en ligne"
    : null;

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const resetForm = () => {
    setRouteId("");
    setDepartureDate(format(new Date(), "yyyy-MM-dd"));
    setDepartureTime("08:00");
    setPrice("5000");
    setBusId("");
    setOnlineSeats("");
    setOnlineSeatsTouched(false);
    setEditedTrip(null);
    setEditingId(null);
  };

  const openEdit = (trip: any) => {
    setRouteId(trip.routeId.toString());
    setDepartureDate(trip.departureDate);
    setDepartureTime(trip.departureTime.slice(0, 5));
    setPrice(trip.price.toString());
    setBusId(trip.busId?.toString() ?? "");
    const tripOnline = trip.onlineSeatsCapacity ?? trip.totalSeats;
    setEditedTrip({ heldSeats: trip.totalSeats - trip.availableSeats, onlineSeats: tripOnline, busCapacity: trip.busCapacity ?? trip.totalSeats, busId: trip.busId?.toString() ?? "" });
    setOnlineSeats(String(tripOnline));
    setOnlineSeatsTouched(false);
    setEditingId(trip.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !busId || !departureDate || !departureTime || !price || onlineSeatsError) return;
    const onlineSeatsCapacity = onlineSeatsNumber;

    if (editingId) {
      updateTrip.mutate(
        { tripId: editingId, data: { busId: parseInt(busId), departureDate, departureTime, price: parseInt(price), onlineSeatsCapacity } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/trips"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Voyage modifié" });
          },
          onError: onErrorToast,
        }
      );
    } else {
      createTrip.mutate(
        { data: { routeId: parseInt(routeId), busId: parseInt(busId), departureDate, departureTime, price: parseInt(price), onlineSeatsCapacity } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/trips"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Voyage planifié" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  const handleCancel = (id: number) => {
    if (confirm("Annuler ce voyage ? (Les billets vendus ne seront plus valides)")) {
      updateTrip.mutate(
        { tripId: id, data: { status: "cancelled" } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/trips"] });
            toast({ title: "Voyage annulé" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-foreground">Gestion des Voyages</h1>
        
        <div className="flex gap-4 items-center w-full md:w-auto">
          <div className="relative">
            <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setPage(1); }}
              className="pl-10"
            />
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Planifier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Modifier" : "Planifier"} un voyage</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                {!editingId && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Ligne</label>
                    <SearchableSelect
                      options={routeOptions}
                      value={routeId}
                      onChange={(v) => { setRouteId(v); setBusId(""); }}
                      placeholder="Choisir une ligne"
                      searchPlaceholder="Rechercher (ville, gare, compagnie)..."
                      emptyText="Aucune ligne ne correspond à cette recherche."
                      ariaLabel="Ligne"
                    />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-1 block">Bus</label>
                  <Select value={busId} onValueChange={setBusId} disabled={!routeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un bus" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeBuses?.map(b => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name} ({b.capacity} places)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {routeId && activeBuses?.length === 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Aucun bus actif pour cette compagnie. Ajoutez-en depuis la page « Bus & Réseau ».
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Date</label>
                    <Input type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Heure</label>
                    <Input type="time" value={departureTime} onChange={e => setDepartureTime(e.target.value)} required />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Prix (FCFA)</label>
                  <Input type="number" value={price} onChange={e => setPrice(e.target.value)} required min={100} />
                </div>

                <div>
                  <label htmlFor="online-seats" className="text-sm font-medium mb-1 block">Places vendables en ligne</label>
                  <Input
                    id="online-seats"
                    type="number"
                    inputMode="numeric"
                    min={minOnlineSeats}
                    max={busCapacity || undefined}
                    value={onlineSeatsValue}
                    disabled={!busCapacity}
                    aria-invalid={!!onlineSeatsError}
                    aria-describedby="online-seats-hint"
                    onChange={e => { setOnlineSeats(e.target.value); setOnlineSeatsTouched(true); }}
                  />
                  <p id="online-seats-hint" className={onlineSeatsError ? "text-sm text-destructive mt-1" : "text-xs text-muted-foreground mt-1"}>
                    {onlineSeatsError ?? (busCapacity
                      ? `Bus de ${busCapacity} places — combien sont vendables en ligne ? Les autres restent pour votre comptoir, hors de l'application.${editedTrip && editedTrip.heldSeats > 0 ? ` Déjà vendues ou réservées en ligne : ${editedTrip.heldSeats}.` : ""}`
                      : "Choisissez d'abord un bus.")}
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={createTrip.isPending || updateTrip.isPending || !!onlineSeatsError}>
                  Enregistrer
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ListSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher (ville, gare, compagnie, bus)..." className="mb-4" />

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Compagnie</TableHead>
              <TableHead>Trajet</TableHead>
              <TableHead>Départ</TableHead>
              <TableHead>Bus</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Places</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : trips?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{debouncedSearch ? "Aucun voyage ne correspond à cette recherche pour cette date." : "Aucun voyage pour cette date."}</TableCell>
              </TableRow>
            ) : (
              trips?.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="font-bold">{trip.companyName}</TableCell>
                  <TableCell>{trip.origin} <ArrowRight className="inline w-3 h-3 text-muted-foreground mx-1"/> {trip.destination}</TableCell>
                  <TableCell>
                    <div className="font-medium">{trip.departureTime.slice(0, 5)}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{trip.busName ?? "—"}</TableCell>
                  <TableCell className="font-mono">{trip.price.toLocaleString("fr-CI")} F</TableCell>
                  <TableCell>
                    <span className="text-green-600 font-bold">{trip.availableSeats}</span>
                    <span className="text-muted-foreground text-xs"> / {trip.totalSeats}</span>
                    {trip.busCapacity !== undefined && trip.totalSeats < trip.busCapacity && (
                      <div className="text-muted-foreground text-xs">en ligne, bus de {trip.busCapacity}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {trip.status === "active" ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold bg-green-100 text-green-700">Actif</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold bg-destructive/10 text-destructive">Annulé</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(trip)} disabled={trip.status === "cancelled"}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleCancel(trip.id)} disabled={trip.status === "cancelled"} className="text-destructive hover:bg-destructive/10">
                      <Ban className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}

// Minimal ArrowRight local since not imported at top
function ArrowRight(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>;
}
