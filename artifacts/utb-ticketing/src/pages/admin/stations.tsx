import { useState } from "react";
import {
  useGetAdminCities,
  getGetAdminCitiesQueryKey,
  useCreateCity,
  useDeleteCity,
  useGetAdminStations,
  getGetAdminStationsQueryKey,
  useCreateStation,
  useDeleteStation,
  getListCitiesQueryKey,
} from "@workspace/api-client-react";
import { Plus, Trash2, MapPin, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function AdminStations() {
  const { data: cities, isLoading: citiesLoading } = useGetAdminCities({ query: { queryKey: getGetAdminCitiesQueryKey() } });
  const { data: stations, isLoading: stationsLoading } = useGetAdminStations({ query: { queryKey: getGetAdminStationsQueryKey() } });

  const createCity = useCreateCity();
  const deleteCity = useDeleteCity();
  const createStation = useCreateStation();
  const deleteStation = useDeleteStation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [cityName, setCityName] = useState("");
  const [stationName, setStationName] = useState("");
  const [stationCityId, setStationCityId] = useState("");

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const refreshCities = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminCitiesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCitiesQueryKey() });
  };

  const handleCreateCity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cityName.trim()) return;
    createCity.mutate(
      { data: { name: cityName.trim() } },
      {
        onSuccess: () => {
          refreshCities();
          setCityName("");
          toast({ title: "Ville ajoutée" });
        },
        onError: onErrorToast,
      }
    );
  };

  const handleDeleteCity = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer cette ville ?")) {
      deleteCity.mutate(
        { cityId: id },
        {
          onSuccess: () => {
            refreshCities();
            toast({ title: "Ville supprimée" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  const handleCreateStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stationName.trim() || !stationCityId) return;
    createStation.mutate(
      { data: { name: stationName.trim(), cityId: parseInt(stationCityId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAdminStationsQueryKey() });
          setStationName("");
          toast({ title: "Gare ajoutée" });
        },
        onError: onErrorToast,
      }
    );
  };

  const handleDeleteStation = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer cette gare ?")) {
      deleteStation.mutate(
        { stationId: id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetAdminStationsQueryKey() });
            toast({ title: "Gare supprimée" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-8">Villes & Gares</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cities */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden h-fit">
          <div className="p-4 border-b border-border">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" /> Villes
            </h2>
            <form onSubmit={handleCreateCity} className="flex gap-2">
              <Input value={cityName} onChange={e => setCityName(e.target.value)} placeholder="Ex: Bouaké" />
              <Button type="submit" size="icon" disabled={createCity.isPending} aria-label="Ajouter la ville">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>
          <Table>
            <TableBody>
              {citiesLoading ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
                </TableRow>
              ) : cities?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">Aucune ville.</TableCell>
                </TableRow>
              ) : (
                cities?.map((city) => (
                  <TableRow key={city.id}>
                    <TableCell className="font-medium">{city.name}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCity(city.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Stations */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-sm overflow-hidden h-fit">
          <div className="p-4 border-b border-border">
            <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> Gares
            </h2>
            <form onSubmit={handleCreateStation} className="flex flex-col sm:flex-row gap-2">
              <Select value={stationCityId} onValueChange={setStationCityId}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder="Ville" />
                </SelectTrigger>
                <SelectContent>
                  {cities?.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={stationName} onChange={e => setStationName(e.target.value)} placeholder="Ex: Gare d'Adjamé" />
              <Button type="submit" className="gap-2" disabled={createStation.isPending || !stationCityId}>
                <Plus className="w-4 h-4" /> Ajouter
              </Button>
            </form>
          </div>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Gare</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stationsLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
                </TableRow>
              ) : stations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Aucune gare.</TableCell>
                </TableRow>
              ) : (
                stations?.map((station) => (
                  <TableRow key={station.id}>
                    <TableCell className="font-medium">{station.name}</TableCell>
                    <TableCell className="text-muted-foreground">{station.cityName}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteStation(station.id)} className="text-muted-foreground hover:text-destructive">
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
    </div>
  );
}
