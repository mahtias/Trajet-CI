import { useState } from "react";
import { 
  useGetAdminCompanies, 
  useCreateCompany, 
  useUpdateCompany, 
  useDeleteCompany 
} from "@workspace/api-client-react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ListPagination } from "@/components/list-pagination";

const PAGE_SIZE = 20;

export default function AdminCompanies() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminCompanies({ page, pageSize: PAGE_SIZE });
  const companies = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");

  const resetForm = () => {
    setName("");
    setEditingId(null);
  };

  const openEdit = (company: any) => {
    setName(company.name);
    setEditingId(company.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      updateCompany.mutate(
        { companyId: editingId, data: { name } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Compagnie modifiée" });
          }
        }
      );
    } else {
      createCompany.mutate(
        { data: { name } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
            setIsDialogOpen(false);
            resetForm();
            toast({ title: "Compagnie créée" });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Voulez-vous vraiment supprimer cette compagnie ?")) {
      deleteCompany.mutate(
        { companyId: id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
            toast({ title: "Compagnie supprimée" });
          }
        }
      );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Gestion des Compagnies</h1>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nouvelle Compagnie</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifier" : "Ajouter"} une compagnie</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nom de la compagnie</label>
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Ex: UTB" 
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={createCompany.isPending || updateCompany.isPending}>
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
              <TableHead className="w-16">ID</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Date création</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : companies?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucune compagnie.</TableCell>
              </TableRow>
            ) : (
              companies?.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-mono">{company.id}</TableCell>
                  <TableCell className="font-bold">{company.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {company.createdAt ? new Date(company.createdAt).toLocaleDateString("fr-CI") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(company)} className="text-muted-foreground hover:text-primary">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(company.id)} className="text-muted-foreground hover:text-destructive">
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
