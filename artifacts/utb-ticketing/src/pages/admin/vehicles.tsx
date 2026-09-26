import { useState } from "react";
import {
  useGetAdminVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, Car } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { ListPagination } from "@/components/list-pagination";
import { AgencySelect } from "@/components/agency-select";
import { ImageUploader } from "@/components/image-uploader";

const PAGE_SIZE = 20;

export default function AdminVehicles() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminVehicles({ page, pageSize: PAGE_SIZE });
  const vehicles = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [agencyId, setAgencyId] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("");
  const [seats, setSeats] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/vehicles"] });

  const resetForm = () => {
    setAgencyId(""); setBrand(""); setModel(""); setCategory("");
    setSeats(""); setPricePerDay(""); setImages([]); setIsActive(true);
    setEditingId(null);
  };

  const openEdit = (vehicle: any) => {
    setAgencyId(vehicle.agencyId.toString());
    setBrand(vehicle.brand);
    setModel(vehicle.model);
    setCategory(vehicle.category);
    setSeats(vehicle.seats.toString());
    setPricePerDay(vehicle.pricePerDay.toString());
    setImages(vehicle.images ?? []);
    setIsActive(vehicle.isActive);
    setEditingId(vehicle.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyId || !brand || !model || !category || !seats || !pricePerDay) return;

    const data = {
      agencyId: parseInt(agencyId, 10),
      brand, model, category,
      seats: parseInt(seats, 10),
      pricePerDay: parseFloat(pricePerDay),
      images: images.length > 0 ? images : null,
      isActive,
    };

    if (editingId) {
      updateVehicle.mutate(
        { vehicleId: editingId, data },
        {
          onSuccess: () => {
            refresh();
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Véhicule modifié" });
          },
          onError: onErrorToast,
        }
      );
    } else {
      createVehicle.mutate(
        { data },
        {
          onSuccess: () => {
            refresh();
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Véhicule créé" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer ce véhicule ?")) {
      deleteVehicle.mutate(
        { vehicleId: id },
        {
          onSuccess: () => {
            refresh();
            toast({ title: "Véhicule supprimé" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Véhicules de location</h1>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nouveau Véhicule</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier" : "Ajouter"} un véhicule</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Agence (location)</label>
                <AgencySelect type="vehicle_rental" value={agencyId} onChange={setAgencyId} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Marque</label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex: Toyota" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Modèle</label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex: Corolla" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Catégorie</label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: suv" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Places</label>
                  <Input type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Prix/jour (FCFA)</label>
                  <Input type="number" min={1} value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Photos (optionnel)</label>
                <ImageUploader value={images} onChange={setImages} />
              </div>
              <label className="flex items-center gap-3 text-sm font-medium">
                <Switch checked={isActive} onCheckedChange={setIsActive} /> Visible et réservable
              </label>
              <Button type="submit" className="w-full" disabled={!agencyId || createVehicle.isPending || updateVehicle.isPending}>
                Enregistrer
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Véhicule</TableHead>
              <TableHead>Agence</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Places</TableHead>
              <TableHead>Prix/jour</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : vehicles?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun véhicule configuré.</TableCell>
              </TableRow>
            ) : (
              vehicles?.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-bold">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-primary" /> {vehicle.brand} {vehicle.model}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{vehicle.agencyName}</TableCell>
                  <TableCell className="capitalize">{vehicle.category}</TableCell>
                  <TableCell>{vehicle.seats}</TableCell>
                  <TableCell className="font-mono">{vehicle.pricePerDay.toLocaleString("fr-CI")} F</TableCell>
                  <TableCell>
                    {vehicle.isActive ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold bg-green-100 text-green-700">Actif</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold bg-muted text-muted-foreground">Inactif</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(vehicle)} className="text-muted-foreground hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(vehicle.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
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
