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

const PAGE_SIZE = 20;

export default function AdminTrips() {
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetAdminTrips({ date: dateFilter, page, pageSize: PAGE_SIZE });
  const trips = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const { data: routesData } = useGetAdminRoutes({ page: 1, pageSize: 100 });
  const routes = routesData?.items;

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

  // Buses available for the selected route's company
  const routeCompanyId = routes?.find(r => r.id.toString() === routeId)?.companyId ?? 0;
  const { data: companyBuses } = useGetCompanyBuses(routeCompanyId, {
    query: { queryKey: getGetCompanyBusesQueryKey(routeCompanyId), enabled: !!routeCompanyId },
  });
  const activeBuses = companyBuses?.filter(b => b.isActive || b.id.toString() === busId);

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const resetForm = () => {
    setRouteId("");
    setDepartureDate(format(new Date(), "yyyy-MM-dd"));
    setDepartureTime("08:00");
    setPrice("5000");
    setBusId("");
    setEditingId(null);
  };

  const openEdit = (trip: any) => {
    setRouteId(trip.routeId.toString());
    setDepartureDate(trip.departureDate);
    setDepartureTime(trip.departureTime.slice(0, 5));
    setPrice(trip.price.toString());
    setBusId(trip.busId?.toString() ?? "");
    setEditingId(trip.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !busId || !departureDate || !departureTime || !price) return;

    if (editingId) {
      updateTrip.mutate(
        { tripId: editingId, data: { busId: parseInt(busId), departureDate, departureTime, price: parseInt(price) } },
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
        { data: { routeId: parseInt(routeId), busId: parseInt(busId), departureDate, departureTime, price: parseInt(price) } },
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
                    <Select value={routeId} onValueChange={(v) => { setRouteId(v); setBusId(""); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une ligne" />
                      </SelectTrigger>
                      <SelectContent>
                        {routes?.map(r => (
                          <SelectItem key={r.id} value={r.id.toString()}>
                            {r.origin} - {r.destination} ({r.companyName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                <Button type="submit" className="w-full" disabled={createTrip.isPending || updateTrip.isPending}>
                  Enregistrer
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aucun voyage pour cette date.</TableCell>
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
