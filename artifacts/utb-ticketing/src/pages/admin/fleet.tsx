import { useState } from "react";
import {
  useGetAdminCompanies,
  useGetAdminStations,
  getGetAdminStationsQueryKey,
  useGetCompanyStations,
  getGetCompanyStationsQueryKey,
  useAddCompanyStation,
  useRemoveCompanyStation,
  useGetCompanyBuses,
  getGetCompanyBusesQueryKey,
  useCreateBus,
  useUpdateBus,
  useDeleteBus,
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, MapPin, Bus as BusIcon, Unlink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

export default function AdminFleet() {
  const { data: companiesData } = useGetAdminCompanies({ page: 1, pageSize: 100 });
  const companies = companiesData?.items;
  const [companyId, setCompanyId] = useState("");
  const selectedCompanyId = companyId ? parseInt(companyId) : 0;

  const { data: allStations } = useGetAdminStations({ query: { queryKey: getGetAdminStationsQueryKey() } });
  const { data: companyStations, isLoading: stationsLoading } = useGetCompanyStations(selectedCompanyId, {
    query: { queryKey: getGetCompanyStationsQueryKey(selectedCompanyId), enabled: !!selectedCompanyId },
  });
  const { data: buses, isLoading: busesLoading } = useGetCompanyBuses(selectedCompanyId, {
    query: { queryKey: getGetCompanyBusesQueryKey(selectedCompanyId), enabled: !!selectedCompanyId },
  });

  const addCompanyStation = useAddCompanyStation();
  const removeCompanyStation = useRemoveCompanyStation();
  const createBus = useCreateBus();
  const updateBus = useUpdateBus();
  const deleteBus = useDeleteBus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [stationToLink, setStationToLink] = useState("");

  // Bus form state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<{ id: number; isActive: boolean } | null>(null);
  const [busName, setBusName] = useState("");
  const [capacity, setCapacity] = useState("");

  const linkedIds = new Set(companyStations?.map(s => s.id));
  const unlinkedStations = allStations?.filter(s => !linkedIds.has(s.id));

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const refreshStations = () => queryClient.invalidateQueries({ queryKey: getGetCompanyStationsQueryKey(selectedCompanyId) });
  const refreshBuses = () => queryClient.invalidateQueries({ queryKey: getGetCompanyBusesQueryKey(selectedCompanyId) });

  const handleLinkStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !stationToLink) return;
    addCompanyStation.mutate(
      { companyId: selectedCompanyId, data: { stationId: parseInt(stationToLink) } },
      {
        onSuccess: () => {
          refreshStations();
          setStationToLink("");
          toast({ title: "Gare rattachée" });
        },
        onError: onErrorToast,
      }
    );
  };

  const handleUnlinkStation = (stationId: number) => {
    if (confirm("Détacher cette gare de la compagnie ?")) {
      removeCompanyStation.mutate(
        { companyId: selectedCompanyId, stationId },
        {
          onSuccess: () => {
            refreshStations();
            toast({ title: "Gare détachée" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  const resetBusForm = () => {
    setBusName("");
    setCapacity("");
    setEditingBus(null);
  };

  const openEditBus = (bus: any) => {
    setBusName(bus.name);
    setCapacity(bus.capacity.toString());
    setEditingBus({ id: bus.id, isActive: bus.isActive });
    setIsDialogOpen(true);
  };

  const handleSubmitBus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !busName.trim() || !capacity) return;

    const data = { name: busName.trim(), capacity: parseInt(capacity) };
    const onSuccess = (title: string) => () => {
      refreshBuses();
      setIsDialogOpen(false);
      resetBusForm();
      toast({ title });
    };

    if (editingBus) {
      updateBus.mutate(
        { busId: editingBus.id, data: { ...data, isActive: editingBus.isActive } },
        { onSuccess: onSuccess("Bus modifié"), onError: onErrorToast }
      );
    } else {
      createBus.mutate(
        { companyId: selectedCompanyId, data },
        { onSuccess: onSuccess("Bus ajouté"), onError: onErrorToast }
      );
    }
  };

  const handleToggleActive = (bus: any, isActive: boolean) => {
    updateBus.mutate(
      { busId: bus.id, data: { name: bus.name, capacity: bus.capacity, isActive } },
      { onSuccess: () => refreshBuses(), onError: onErrorToast }
    );
  };

  const handleDeleteBus = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer ce bus ?")) {
      deleteBus.mutate(
        { busId: id },
        {
          onSuccess: () => {
            refreshBuses();
            toast({ title: "Bus supprimé" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-foreground">Bus & Réseau</h1>
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger className="w-full md:w-72">
            <SelectValue placeholder="Choisir une compagnie" />
          </SelectTrigger>
          <SelectContent>
            {companies?.map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedCompanyId ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          Sélectionnez une compagnie pour gérer ses gares et ses bus.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Company stations */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden h-fit">
            <div className="p-4 border-b border-border">
              <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" /> Gares desservies
              </h2>
              <form onSubmit={handleLinkStation} className="flex gap-2">
                <Select value={stationToLink} onValueChange={setStationToLink}>
                  <SelectTrigger>
                    <SelectValue placeholder="Rattacher une gare" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedStations?.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()}>{s.name}, {s.cityName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" size="icon" disabled={!stationToLink || addCompanyStation.isPending} aria-label="Rattacher la gare">
                  <Plus className="w-4 h-4" />
                </Button>
              </form>
            </div>
            <Table>
              <TableBody>
                {stationsLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
                  </TableRow>
                ) : companyStations?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Aucune gare rattachée.</TableCell>
                  </TableRow>
                ) : (
                  companyStations?.map((station) => (
                    <TableRow key={station.id}>
                      <TableCell className="font-medium">{station.name}</TableCell>
                      <TableCell className="text-muted-foreground">{station.cityName}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleUnlinkStation(station.id)} className="text-muted-foreground hover:text-destructive" aria-label="Détacher">
                          <Unlink className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Buses */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden h-fit">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <BusIcon className="w-5 h-5 text-primary" /> Bus
              </h2>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetBusForm();
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Nouveau bus</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingBus ? "Modifier" : "Ajouter"} un bus</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmitBus} className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Nom / immatriculation</label>
                      <Input value={busName} onChange={e => setBusName(e.target.value)} placeholder="Ex: Bus 01 - 1234 AB 01" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Capacité (places)</label>
                      <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="Ex: 50" min={1} max={100} />
                      {editingBus && (
                        <p className="text-xs text-muted-foreground mt-1">
                          La nouvelle capacité s'applique aux voyages créés ensuite.
                        </p>
                      )}
                    </div>
                    <Button type="submit" className="w-full" disabled={createBus.isPending || updateBus.isPending}>
                      Enregistrer
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Bus</TableHead>
                  <TableHead>Places</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {busesLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
                  </TableRow>
                ) : buses?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucun bus.</TableCell>
                  </TableRow>
                ) : (
                  buses?.map((bus) => (
                    <TableRow key={bus.id}>
                      <TableCell className="font-medium">{bus.name}</TableCell>
                      <TableCell>{bus.capacity}</TableCell>
                      <TableCell>
                        <Switch checked={bus.isActive} onCheckedChange={(v) => handleToggleActive(bus, v)} aria-label="Bus actif" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditBus(bus)} className="text-muted-foreground hover:text-primary">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteBus(bus.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
