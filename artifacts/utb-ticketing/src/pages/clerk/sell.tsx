import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Banknote, MapPin } from "lucide-react";
import { useGetTrip, useClerkSellSeat } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const sellSchema = z.object({
  passengerName: z.string().min(2, "Nom requis"),
  passengerPhone: z.string().min(8, "Téléphone invalide"),
});

export default function ClerkSell() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const seatIdStr = searchParams.get("seatId");
  const tripIdStr = location.split("/")[3]; // /clerk/trips/1/sell
  const tripId = parseInt(tripIdStr, 10);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trip } = useGetTrip(tripId, { query: { enabled: !!tripId } });
  const sellSeat = useClerkSellSeat();

  const form = useForm<z.infer<typeof sellSchema>>({
    resolver: zodResolver(sellSchema),
    defaultValues: {
      passengerName: "",
      passengerPhone: "",
    },
  });

  if (!seatIdStr || !tripId) {
    setLocation("/clerk");
    return null;
  }
  const seatId = parseInt(seatIdStr, 10);

  const onSubmit = (values: z.infer<typeof sellSchema>) => {
    sellSeat.mutate(
      { seatId, data: values },
      {
        onSuccess: () => {
          toast({
            title: "Vente réussie",
            description: "Le billet a été émis avec succès.",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "seats"] });
          setLocation(`/clerk/trips/${tripId}`);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: err?.message || "Impossible de finaliser la vente",
          });
        }
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Button variant="ghost" onClick={() => window.history.back()} className="mb-6 -ml-4 text-muted-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour au plan
      </Button>

      <h1 className="text-2xl md:text-3xl font-bold mb-6">Vente Guichet (Espèces)</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2">
          <Card className="border-border">
            <CardContent className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="passengerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du passager</FormLabel>
                        <FormControl>
                          <Input placeholder="Saisir le nom..." {...field} className="h-12" autoFocus />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="passengerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numéro de téléphone</FormLabel>
                        <FormControl>
                          <Input placeholder="07 XX XX XX XX" {...field} className="h-12" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" size="lg" className="w-full h-14" disabled={sellSeat.isPending}>
                    {sellSeat.isPending ? "Traitement..." : "Encaisser et Émettre"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1">
          <Card className="bg-secondary text-secondary-foreground border-none">
            <CardContent className="p-6 flex flex-col h-full">
              <h3 className="font-bold opacity-80 uppercase text-xs mb-4">Détails de la vente</h3>
              
              <div className="space-y-4 flex-1">
                <div>
                  <p className="text-sm opacity-60">Voyage</p>
                  <p className="font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {trip?.origin.substring(0,3)} - {trip?.destination.substring(0,3)}
                  </p>
                </div>
                <div>
                  <p className="text-sm opacity-60">Départ</p>
                  <p className="font-bold">{trip?.departureTime.slice(0, 5)}</p>
                </div>
                <div>
                  <p className="text-sm opacity-60">Place ID sélectionnée</p>
                  <p className="font-bold font-mono">#{seatId}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/20 mt-4">
                <p className="text-sm opacity-60 mb-1">Montant à percevoir</p>
                <p className="text-2xl font-black text-primary font-mono flex items-center gap-2">
                  {trip?.price.toLocaleString("fr-CI")} F
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
