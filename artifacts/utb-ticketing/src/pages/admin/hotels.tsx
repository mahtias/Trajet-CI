import { useState } from "react";
import {
  useGetAdminHotels,
  useCreateHotel,
  useUpdateHotel,
  useDeleteHotel,
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ListPagination } from "@/components/list-pagination";

const PAGE_SIZE = 20;

export default function AdminHotels() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminHotels({ page, pageSize: PAGE_SIZE });
  const hotels = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const createHotel = useCreateHotel();
  const updateHotel = useUpdateHotel();
  const deleteHotel = useDeleteHotel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [pricePerNight, setPricePerNight] = useState("");
  const [totalRooms, setTotalRooms] = useState("");
  const [rating, setRating] = useState("");

  const resetForm = () => {
    setName(""); setCity(""); setAddress(""); setDescription("");
    setPricePerNight(""); setTotalRooms(""); setRating("");
    setEditingId(null);
  };

  const openEdit = (hotel: any) => {
    setName(hotel.name);
    setCity(hotel.city);
    setAddress(hotel.address);
    setDescription(hotel.description || "");
    setPricePerNight(hotel.pricePerNight.toString());
    setTotalRooms(hotel.totalRooms.toString());
    setRating(hotel.rating?.toString() || "");
    setEditingId(hotel.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !city || !address || !pricePerNight || !totalRooms) return;

    const data = {
      name, city, address,
      description: description || null,
      pricePerNight: parseFloat(pricePerNight),
      totalRooms: parseInt(totalRooms, 10),
      rating: rating ? parseFloat(rating) : null,
    };

    if (editingId) {
      updateHotel.mutate(
        { hotelId: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/hotels"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Hôtel modifié" });
          }
        }
      );
    } else {
      createHotel.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/hotels"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Hôtel créé" });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer cet hôtel ?")) {
      deleteHotel.mutate(
        { hotelId: id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/hotels"] });
            toast({ title: "Hôtel supprimé" });
          }
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Gestion des Hôtels</h1>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nouvel Hôtel</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier" : "Ajouter"} un hôtel</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nom</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Hôtel Wafou" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Ville</label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Bouaké" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Adresse</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex: Avenue de la Paix" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description (optionnel)</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description de l'hôtel" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Prix/nuit (FCFA)</label>
                  <Input type="number" min={0} value={pricePerNight} onChange={(e) => setPricePerNight(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Chambres</label>
                  <Input type="number" min={1} value={totalRooms} onChange={(e) => setTotalRooms(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Note (0-5)</label>
                  <Input type="number" min={0} max={5} step={0.1} value={rating} onChange={(e) => setRating(e.target.value)} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createHotel.isPending || updateHotel.isPending}>
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
              <TableHead>Ville</TableHead>
              <TableHead>Prix/nuit</TableHead>
              <TableHead>Chambres</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : hotels?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucun hôtel configuré.</TableCell>
              </TableRow>
            ) : (
              hotels?.map((hotel) => (
                <TableRow key={hotel.id}>
                  <TableCell className="font-bold">{hotel.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> {hotel.city}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{hotel.pricePerNight.toLocaleString("fr-CI")} F</TableCell>
                  <TableCell>{hotel.totalRooms}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(hotel)} className="text-muted-foreground hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(hotel.id)} className="text-muted-foreground hover:text-destructive">
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
