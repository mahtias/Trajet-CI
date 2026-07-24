import { useState } from "react";
import { useValidateTicket } from "@workspace/api-client-react";
import { QrCode, CheckCircle, XCircle, Search, ScanLine, Keyboard } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/qr-scanner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ClerkValidate() {
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [ticketIdStr, setTicketIdStr] = useState("");
  const validateTicket = useValidateTicket();
  const { toast } = useToast();

  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    ticket?: any;
  } | null>(null);

  const runValidation = (ticketId: number) => {
    if (isNaN(ticketId) || validateTicket.isPending) return;

    validateTicket.mutate(
      { ticketId },
      {
        onSuccess: (res) => {
          setLastResult({
            success: res.valid,
            message: res.message || (res.valid ? "Billet validé avec succès" : "Billet non valide"),
            ticket: res.ticket
          });
          if (res.valid) {
            toast({ title: "Succès", description: "Le passager peut embarquer." });
          } else {
            toast({ variant: "destructive", title: "Refusé", description: res.message || "Billet invalide" });
          }
          setTicketIdStr("");
        },
        onError: (err: any) => {
          setLastResult({
            success: false,
            message: err?.message || "Erreur serveur lors de la validation"
          });
        }
      }
    );
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketIdStr.trim()) return;
    const ticketId = parseInt(ticketIdStr, 10);
    if (isNaN(ticketId)) {
      setLastResult({ success: false, message: "ID de billet invalide" });
      return;
    }
    runValidation(ticketId);
  };

  const handleScan = (data: string) => {
    let ticketId: number | null = null;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.ticketId === "number") {
        ticketId = parsed.ticketId;
      }
    } catch {
      // Not our JSON QR payload — try treating it as a raw ticket ID.
      const asNumber = parseInt(data, 10);
      if (!isNaN(asNumber)) ticketId = asNumber;
    }

    if (ticketId === null) {
      setLastResult({ success: false, message: "QR code non reconnu" });
      return;
    }
    runValidation(ticketId);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-md">
      <h1 className="text-3xl font-bold text-center mb-8 flex flex-col items-center gap-3">
        <div className="bg-primary/10 p-4 rounded-full text-primary">
          <QrCode className="w-10 h-10" />
        </div>
        Contrôle Embarquement
      </h1>

      <div className="flex items-center gap-1 bg-muted rounded-full p-1 mb-6 max-w-xs mx-auto">
        <button
          type="button"
          onClick={() => setMode("scan")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors",
            mode === "scan" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ScanLine className="w-4 h-4" /> Scanner
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors",
            mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Keyboard className="w-4 h-4" /> Saisie manuelle
        </button>
      </div>

      <Card className="border-border shadow-lg bg-card">
        <CardContent className="p-6">
          {mode === "scan" ? (
            <div className="space-y-4">
              <QrScanner onScan={handleScan} />
              <p className="text-sm text-center text-muted-foreground">
                Visez le QR code du billet du passager avec la caméra.
              </p>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">ID du Billet ou Code</label>
                <div className="relative">
                  <Input
                    value={ticketIdStr}
                    onChange={(e) => setTicketIdStr(e.target.value)}
                    placeholder="Ex: 1042"
                    className="h-14 pl-12 text-xl font-mono"
                    autoFocus
                  />
                  <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 text-lg" disabled={validateTicket.isPending || !ticketIdStr}>
                {validateTicket.isPending ? "Vérification..." : "Vérifier le billet"}
              </Button>
            </form>
          )}

          {lastResult && (
            <div className={`mt-8 p-6 rounded-xl border ${lastResult.success ? 'bg-green-50 border-green-200' : 'bg-destructive/10 border-destructive/20'}`}>
              <div className="flex flex-col items-center text-center">
                {lastResult.success ? (
                  <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                ) : (
                  <XCircle className="w-16 h-16 text-destructive mb-4" />
                )}

                <h3 className={`text-xl font-bold mb-2 ${lastResult.success ? 'text-green-700' : 'text-destructive'}`}>
                  {lastResult.message}
                </h3>

                {lastResult.ticket && (
                  <div className="w-full text-left mt-4 pt-4 border-t border-black/10 text-sm">
                    <p className="mb-1"><span className="text-muted-foreground">Passager:</span> <strong className="text-foreground">{lastResult.ticket.passengerName}</strong></p>
                    <p className="mb-1"><span className="text-muted-foreground">Place:</span> <strong className="text-xl text-primary font-bold">{lastResult.ticket.seatNumber}</strong></p>
                    <p><span className="text-muted-foreground">Trajet:</span> <strong className="text-foreground">{lastResult.ticket.origin} - {lastResult.ticket.destination}</strong></p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
