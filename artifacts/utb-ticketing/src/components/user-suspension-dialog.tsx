import { useEffect, useState } from "react";
import { useSuspendUser } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

/** Super admin: block one account (login refused, with this reason). Nothing else changes. */
export function UserSuspensionDialog({ user, onClose }: { user: { id: number; phone: string; name?: string | null } | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const suspend = useSuspendUser();
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [user?.id]);
  const trimmed = reason.trim();

  const submit = () => {
    if (!user || trimmed.length < 3) return;
    suspend.mutate(
      { userId: user.id, data: { reason: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
          toast({ title: "Compte suspendu", description: `${user.name || user.phone} ne peut plus se connecter.` });
          onClose();
        },
        onError: (err: any) => toast({ title: "Erreur", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspendre {user?.name || user?.phone}</DialogTitle>
          <DialogDescription>
            Ce compte ne pourra plus se connecter (sa session en cours est fermée). Ses billets, réservations et sa compagnie ne changent pas.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="user-suspension-reason" className="text-sm font-medium mb-1 block">Raison (affichée à la personne quand elle tente de se connecter)</label>
          <Textarea id="user-suspension-reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : réservations abusives répétées" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="destructive" disabled={trimmed.length < 3 || suspend.isPending} onClick={submit}>Suspendre le compte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
