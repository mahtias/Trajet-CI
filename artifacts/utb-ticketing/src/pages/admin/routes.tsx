import { useState } from "react";
import { 
  useGetAdminRoutes, 
  useGetAdminCompanies,
  useCreateRoute, 
  useUpdateRoute, 
  useDeleteRoute 
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, MapPin } from "lucide-react";
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

export default function AdminRoutes() {
  const { data: routes, isLoading } = useGetAdminRoutes();
  const { data: companies } = useGetAdminCompanies();
  
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();
  const deleteRoute = useDeleteRoute();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [companyId, setCompanyId] = useState("");

  const resetForm = () => {
    setOrigin("");
    setDestination("");
    setDurationMinutes("");
    setCompanyId("");
    setEditingId(null);
  };

  const openEdit = (route: any) => {
    setOrigin(route.origin);
    setDestination(route.destination);
    setDurationMinutes(route.durationMinutes.toString());
    setCompanyId(route.companyId.toString());
    setEditingId(route.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination || !durationMinutes || !companyId) return;

    const data = {
      origin,
      destination,
      durationMinutes: parseInt(durationMinutes),
      companyId: parseInt(companyId)
    };

    if (editingId) {
      updateRoute.mutate(
        { routeId: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/routes"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Ligne modifiée" });
          }
        }
      );
    } else {
      createRoute.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/routes"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Ligne créée" });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer cette ligne ?")) {
      deleteRoute.mutate(
        { routeId: id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/routes"] });
            toast({ title: "Ligne supprimée" });
          }
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Gestion des Lignes</h1>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nouvelle Ligne</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier" : "Ajouter"} une ligne</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Compagnie</label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une compagnie" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Départ</label>
                  <Input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Ex: Abidjan" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Arrivée</label>
                  <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Ex: Bouaké" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Durée estimée (minutes)</label>
                <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} placeholder="Ex: 240" />
              </div>
              <Button type="submit" className="w-full" disabled={createRoute.isPending || updateRoute.isPending}>
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
              <TableHead>Compagnie</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Durée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : routes?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune ligne configurée.</TableCell>
              </TableRow>
            ) : (
              routes?.map((route) => {
                const h = Math.floor(route.durationMinutes / 60);
                const m = route.durationMinutes % 60;
                
                return (
                  <TableRow key={route.id}>
                    <TableCell className="font-bold">
                      <span className="inline-block px-2 py-1 bg-secondary/10 text-secondary text-xs rounded-md">
                        {route.companyName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" /> {route.origin}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" /> {route.destination}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {h}h{m > 0 ? m : '00'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(route)} className="text-muted-foreground hover:text-primary">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(route.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
