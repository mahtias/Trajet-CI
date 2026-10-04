import { useState } from "react";
import { useGetAdminUsers, useUpdateUserRole, useGetMe, getGetMeQueryKey, useGetAdminAgencies, useReactivateUser } from "@workspace/api-client-react";
import { Ban, RotateCcw } from "lucide-react";
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
import { AGENCY_TYPE_LABELS } from "@/components/agency-select";
import { SearchableSelect } from "@/components/searchable-select";
import { useCompanyOptions } from "@/components/company-select";
import { useToast } from "@/hooks/use-toast";
import { ListPagination } from "@/components/list-pagination";
import { UserSuspensionDialog } from "@/components/user-suspension-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ROLES = [
  { value: "passenger", label: "Passager" },
  { value: "clerk", label: "Guichetier" },
  { value: "company_admin", label: "Admin compagnie" },
  { value: "admin", label: "Super admin" },
];

type UserRole = "passenger" | "clerk" | "company_admin" | "admin";

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminUsers({ page, pageSize: PAGE_SIZE });
  const users = data?.items;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  // Same query as CompanySelect: react-query shares the cached list, no extra request
  const { options: companyOptions } = useCompanyOptions("Compagnies de bus");
  const assignmentCompanyOptions = companyOptions.map((o) => ({ ...o, value: `company:${o.value}` }));
  const { data: agencies } = useGetAdminAgencies();
  const agencyOptions = (agencies ?? []).map((a) => ({ value: `agency:${a.id}`, label: `${a.name} · ${AGENCY_TYPE_LABELS[a.type]}`, group: "Agences" }));
  const updateUserRole = useUpdateUserRole();
  const reactivateUser = useReactivateUser();
  const [suspendingUser, setSuspendingUser] = useState<{ id: number; phone: string; name?: string | null } | null>(null);

  const handleReactivate = (user: { id: number; phone: string; name?: string | null }) => {
    if (!confirm(`Réactiver le compte ${user.name || user.phone} ? Il pourra de nouveau se connecter.`)) return;
    reactivateUser.mutate(
      { userId: user.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
          toast({ title: "Compte réactivé" });
        },
        onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      }
    );
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // A clerk is assigned either to a bus company or to an agency (hotel / tourism / vehicle rental)
  // Users switched to "company_admin" who still need a company (the server requires one)
  const [pendingCompanyAdmin, setPendingCompanyAdmin] = useState<Set<number>>(new Set());
  const setPending = (userId: number, pending: boolean) =>
    setPendingCompanyAdmin((prev) => {
      const next = new Set(prev);
      if (pending) next.add(userId); else next.delete(userId);
      return next;
    });

  const saveUser = (userId: number, role: UserRole, companyId: number | null, agencyId: number | null) => {
    updateUserRole.mutate(
      { userId, data: { role, companyId, agencyId } },
      {
        onSuccess: () => {
          setPending(userId, false);
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
    if (role === "company_admin") {
      // A company admin must belong to a company: keep the current one, or ask for it first
      if (currentCompanyId) {
        saveUser(userId, "company_admin", currentCompanyId, null);
      } else {
        setPending(userId, true);
        toast({ title: "Choisissez la compagnie", description: "Sélectionnez la compagnie de cet administrateur dans la colonne Rattachement." });
      }
      return;
    }
    setPending(userId, false);
    const isClerk = role === "clerk";
    saveUser(userId, role as UserRole, isClerk ? currentCompanyId : null, isClerk ? currentAgencyId : null);
  };

  // Assignment values are "company:<id>" or "agency:<id>"
  const handleAssignmentChange = (userId: number, role: UserRole, value: string) => {
    const [kind, id] = value.split(":");
    const numericId = parseInt(id, 10);
    saveUser(userId, role, kind === "company" ? numericId : null, kind === "agency" ? numericId : null);
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
              <TableHead className="w-48">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun utilisateur.</TableCell>
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
                        value={pendingCompanyAdmin.has(user.id) ? "company_admin" : user.role}
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
                      {user.role === "clerk" || user.role === "company_admin" || pendingCompanyAdmin.has(user.id) ? (
                        <SearchableSelect
                          // Agencies are for clerks only: a company admin manages a bus company
                          options={user.role === "clerk" && !pendingCompanyAdmin.has(user.id) ? [...assignmentCompanyOptions, ...agencyOptions] : assignmentCompanyOptions}
                          value={pendingCompanyAdmin.has(user.id) ? "" : assignmentValue(user) ?? ""}
                          disabled={updateUserRole.isPending}
                          onChange={(value) => handleAssignmentChange(user.id, user.role === "clerk" && !pendingCompanyAdmin.has(user.id) ? "clerk" : "company_admin", value)}
                          placeholder="Choisir..."
                          searchPlaceholder={user.role === "clerk" && !pendingCompanyAdmin.has(user.id) ? "Rechercher une compagnie ou une agence..." : "Rechercher une compagnie..."}
                          emptyText="Aucune compagnie ne correspond à cette recherche."
                          ariaLabel="Affectation"
                          className="h-9"
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* A super admin is never suspended (the server refuses it too) */}
                      {user.role === "admin" ? (
                        <span className="text-muted-foreground text-sm">-</span>
                      ) : user.status === "suspended" ? (
                        <div className="space-y-1">
                          <Badge variant="destructive">Suspendu</Badge>
                          {user.suspendedReason && <p className="text-xs text-muted-foreground">Motif : {user.suspendedReason}</p>}
                          <Button variant="outline" size="sm" className="h-8" disabled={reactivateUser.isPending} onClick={() => handleReactivate(user)}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Réactiver
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Actif</Badge>
                          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" onClick={() => setSuspendingUser(user)}>
                            <Ban className="w-3.5 h-3.5 mr-1" /> Suspendre
                          </Button>
                        </div>
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

      <UserSuspensionDialog user={suspendingUser} onClose={() => setSuspendingUser(null)} />
    </div>
  );
}
