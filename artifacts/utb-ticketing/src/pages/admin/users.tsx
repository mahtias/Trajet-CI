import { useState } from "react";
import { useGetAdminUsers, useUpdateUserRole, useGetMe, getGetMeQueryKey, useGetAdminCompanies, useGetAdminAgencies } from "@workspace/api-client-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AGENCY_TYPE_LABELS } from "@/components/agency-select";
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
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data: companiesData } = useGetAdminCompanies({ page: 1, pageSize: 100 });
  const companies = companiesData?.items;
  const { data: agencies } = useGetAdminAgencies();
  const updateUserRole = useUpdateUserRole();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // A clerk is assigned either to a bus company or to an agency (hotel / tourism / vehicle rental)
  const saveUser = (userId: number, role: "passenger" | "clerk" | "admin", companyId: number | null, agencyId: number | null) => {
    updateUserRole.mutate(
      { userId, data: { role, companyId, agencyId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
          toast({ title: "Utilisateur mis à jour" });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: err?.data?.error || err?.message || "Impossible de modifier l'utilisateur",
          });
        },
      }
    );
  };

  const handleRoleChange = (userId: number, role: string, currentCompanyId: number | null, currentAgencyId: number | null) => {
    const isClerk = role === "clerk";
    saveUser(userId, role as "passenger" | "clerk" | "admin", isClerk ? currentCompanyId : null, isClerk ? currentAgencyId : null);
  };

  // Assignment values are "company:<id>" or "agency:<id>"
  const handleAssignmentChange = (userId: number, value: string) => {
    const [kind, id] = value.split(":");
    const numericId = parseInt(id, 10);
    saveUser(userId, "clerk", kind === "company" ? numericId : null, kind === "agency" ? numericId : null);
  };

  const assignmentValue = (user: { companyId?: number | null; agencyId?: number | null }) => {
    if (user.companyId) return `company:${user.companyId}`;
    if (user.agencyId) return `agency:${user.agencyId}`;
    return undefined;
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
              <TableHead className="w-64">Rattachement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun utilisateur.</TableCell>
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
                        onValueChange={(role) => handleRoleChange(user.id, role, user.companyId ?? null, user.agencyId ?? null)}
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
                    <TableCell>
                      {user.role === "clerk" ? (
                        <Select
                          value={assignmentValue(user)}
                          disabled={updateUserRole.isPending}
                          onValueChange={(value) => handleAssignmentChange(user.id, value)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Choisir..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Compagnies de bus</SelectLabel>
                              {companies?.map((c) => (
                                <SelectItem key={`company:${c.id}`} value={`company:${c.id}`}>{c.name}</SelectItem>
                              ))}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectLabel>Agences</SelectLabel>
                              {agencies?.map((a) => (
                                <SelectItem key={`agency:${a.id}`} value={`agency:${a.id}`}>
                                  {a.name} · {AGENCY_TYPE_LABELS[a.type]}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
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
