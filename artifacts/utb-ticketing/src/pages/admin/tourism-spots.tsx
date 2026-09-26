import { useState } from "react";
import {
  useGetAdminTourismSpots,
  useCreateTourismSpot,
  useUpdateTourismSpot,
  useDeleteTourismSpot,
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export default function AdminTourismSpots() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminTourismSpots({ page, pageSize: PAGE_SIZE });
  const spots = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const createSpot = useCreateTourismSpot();
  const updateSpot = useUpdateTourismSpot();
  const deleteSpot = useDeleteTourismSpot();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [agencyId, setAgencyId] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [capacityPerDay, setCapacityPerDay] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/tourism-spots"] });

  const resetForm = () => {
    setAgencyId(""); setName(""); setLocation(""); setDescription("");
    setPrice(""); setCapacityPerDay(""); setImages([]); setIsActive(true);
    setEditingId(null);
  };

  const openEdit = (spot: any) => {
    setAgencyId(spot.agencyId.toString());
    setName(spot.name);
    setLocation(spot.location);
    setDescription(spot.description || "");
    setPrice(spot.price.toString());
    setCapacityPerDay(spot.capacityPerDay.toString());
    setImages(spot.images ?? []);
    setIsActive(spot.isActive);
    setEditingId(spot.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyId || !name || !location || !price || !capacityPerDay) return;

    const data = {
      agencyId: parseInt(agencyId, 10),
      name, location,
      description: description || null,
      price: parseFloat(price),
      capacityPerDay: parseInt(capacityPerDay, 10),
      images: images.length > 0 ? images : null,
      isActive,
    };

    if (editingId) {
      updateSpot.mutate(
        { spotId: editingId, data },
        {
          onSuccess: () => {
            refresh();
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Site modifié" });
          },
          onError: onErrorToast,
        }
      );
    } else {
      createSpot.mutate(
        { data },
        {
          onSuccess: () => {
            refresh();
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Site créé" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer ce site touristique ?")) {
      deleteSpot.mutate(
        { spotId: id },
        {
          onSuccess: () => {
            refresh();
            toast({ title: "Site supprimé" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Sites Touristiques</h1>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nouveau Site</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier" : "Ajouter"} un site touristique</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Agence (tourisme)</label>
                <AgencySelect type="tourism" value={agencyId} onChange={setAgencyId} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nom</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Basilique de Yamoussoukro" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Localisation</label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Yamoussoukro" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description (optionnel)</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description du site" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Prix / personne (FCFA)</label>
                  <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Capacité / jour</label>
                  <Input type="number" min={1} value={capacityPerDay} onChange={(e) => setCapacityPerDay(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Photos (optionnel)</label>
                <ImageUploader value={images} onChange={setImages} />
              </div>
              <label className="flex items-center gap-3 text-sm font-medium">
                <Switch checked={isActive} onCheckedChange={setIsActive} /> Visible et réservable
              </label>
              <Button type="submit" className="w-full" disabled={!agencyId || createSpot.isPending || updateSpot.isPending}>
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
              <TableHead>Nom</TableHead>
              <TableHead>Agence</TableHead>
              <TableHead>Localisation</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Capacité/jour</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : spots?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun site configuré.</TableCell>
              </TableRow>
            ) : (
              spots?.map((spot) => (
                <TableRow key={spot.id}>
                  <TableCell className="font-bold">{spot.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{spot.agencyName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> {spot.location}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{spot.price.toLocaleString("fr-CI")} F</TableCell>
                  <TableCell>{spot.capacityPerDay}</TableCell>
                  <TableCell>
                    {spot.isActive ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold bg-green-100 text-green-700">Actif</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-bold bg-muted text-muted-foreground">Inactif</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(spot)} className="text-muted-foreground hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(spot.id)} className="text-muted-foreground hover:text-destructive">
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
