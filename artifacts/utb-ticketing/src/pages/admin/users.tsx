import { useState } from "react";
import { useGetAdminUsers, useUpdateUserRole, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ListPagination } from "@/components/list-pagination";

const ROLES = [
  { value: "passenger", label: "Passager" },
  { value: "clerk", label: "Guichetier" },
  { value: "admin", label: "Admin" },
];

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminUsers({ page, pageSize: PAGE_SIZE });
  const users = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const { data: me } = useGetMe({ query: { retry: false } });
  const updateUserRole = useUpdateUserRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRoleChange = (userId: number, role: string) => {
    updateUserRole.mutate(
      { userId, data: { role: role as "passenger" | "clerk" | "admin" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
          toast({ title: "Rôle mis à jour" });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: err?.message || "Impossible de modifier le rôle",
          });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Gestion des Utilisateurs</h1>
        <p className="text-muted-foreground mt-1">
          Attribuez le rôle Guichetier ou Admin aux comptes du personnel.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Date création</TableHead>
              <TableHead className="w-48">Rôle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucun utilisateur.</TableCell>
              </TableRow>
            ) : (
              users?.map((user) => {
                const isSelf = user.id === me?.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono">{user.id}</TableCell>
                    <TableCell className="font-bold">{user.phone}</TableCell>
                    <TableCell>{user.name || "-"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-CI") : "-"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        disabled={isSelf || updateUserRole.isPending}
                        onValueChange={(role) => handleRoleChange(user.id, role)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isSelf && <p className="text-xs text-muted-foreground mt-1">Votre compte</p>}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <ListPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
