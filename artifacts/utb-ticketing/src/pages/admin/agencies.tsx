import { useState } from "react";
import {
  useGetAdminAgencies,
  useCreateAgency,
  useUpdateAgency,
  useDeleteAgency,
  type AgencyType,
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2, Phone } from "lucide-react";
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
import { AGENCY_TYPE_LABELS } from "@/components/agency-select";
import { ListPagination } from "@/components/list-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";

const ALL_TYPES = "all";
const PAGE_SIZE = 20;

export default function AdminAgencies() {
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const { data: agencies, isLoading } = useGetAdminAgencies(
    typeFilter === ALL_TYPES ? undefined : { type: typeFilter as AgencyType }
  );

  const agenciesPage = useClientPagination(agencies, PAGE_SIZE);

  const createAgency = useCreateAgency();
  const updateAgency = useUpdateAgency();
  const deleteAgency = useDeleteAgency();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [type, setType] = useState<string>("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");

  const onErrorToast = (err: any) => {
    toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" });
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/agencies"] });

  const resetForm = () => {
    setType(""); setName(""); setCity(""); setPhone("");
    setEditingId(null);
  };

  const openEdit = (agency: any) => {
    setType(agency.type);
    setName(agency.name);
    setCity(agency.city);
    setPhone(agency.phone || "");
    setEditingId(agency.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !name.trim() || !city.trim()) return;

    const data = { type: type as AgencyType, name, city, phone: phone || null };

    if (editingId) {
      updateAgency.mutate(
        { agencyId: editingId, data },
        {
          onSuccess: () => {
            refresh();
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Agence modifiée" });
          },
          onError: onErrorToast,
        }
      );
    } else {
      createAgency.mutate(
        { data },
        {
          onSuccess: () => {
            refresh();
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Agence créée" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Supprimer cette agence ? Son catalogue (hôtels, sites, véhicules) sera aussi supprimé.")) {
      deleteAgency.mutate(
        { agencyId: id },
        {
          onSuccess: () => {
            refresh();
            toast({ title: "Agence supprimée" });
          },
          onError: onErrorToast,
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-foreground">Gestion des Agences</h1>

        <div className="flex gap-4 items-center w-full md:w-auto">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); agenciesPage.setPage(1); }}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>Tous les types</SelectItem>
              {Object.entries(AGENCY_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Nouvelle Agence</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Modifier" : "Ajouter"} une agence</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Type d'activité</label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(AGENCY_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Nom</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Côte Évasion" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Ville</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Abidjan" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Téléphone (optionnel)</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex: 07 00 00 00 00" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={!type || createAgency.isPending || updateAgency.isPending}>
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
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : agencies?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune agence.</TableCell>
              </TableRow>
            ) : (
              agenciesPage.pageItems?.map((agency) => (
                <TableRow key={agency.id}>
                  <TableCell className="font-bold">{agency.name}</TableCell>
                  <TableCell>
                    <span className="inline-block px-2 py-1 bg-secondary/10 text-secondary text-xs rounded-md">
                      {AGENCY_TYPE_LABELS[agency.type]}
                    </span>
                  </TableCell>
                  <TableCell>{agency.city}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {agency.phone ? <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {agency.phone}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(agency)} className="text-muted-foreground hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(agency.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ListPagination page={agenciesPage.page} totalPages={agenciesPage.totalPages} onPageChange={agenciesPage.setPage} />
      </div>
    </div>
  );
}
