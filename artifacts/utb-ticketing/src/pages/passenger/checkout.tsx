import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useInitiatePayment, 
  useGetMe,
  useGetTrip,
  useGetTripSeats
} from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2, Shield } from "lucide-react";

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

const checkoutSchema = z.object({
  passengerName: z.string().min(2, "Nom du passager requis"),
  passengerPhone: z.string().min(8, "Numéro de téléphone invalide"),
});

export default function Checkout() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const seatId = searchParams.get("seatId");
  const { toast } = useToast();
  
  const { data: user } = useGetMe({ query: { retry: false } });
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const initiatePayment = useInitiatePayment();

  // If we had an endpoint to get seat details directly, we'd use it.
  // We'll trust the user selection for UI display, actual validation happens on backend.

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      passengerName: user?.name || "",
      passengerPhone: user?.phone || "",
    },
  });

  if (!seatId) {
    setLocation("/");
    return null;
  }

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Veuillez vous connecter pour procéder au paiement",
      });
      setLocation(`/login`);
      return;
    }

    initiatePayment.mutate(
      {
        data: {
          seatId: parseInt(seatId, 10),
          passengerName: values.passengerName,
          passengerPhone: values.passengerPhone,
        }
      },
      {
        onSuccess: (res) => {
          setIsSimulatingPayment(true);
          // Simuler le succès du paiement OM après 2 secondes
          setTimeout(() => {
            if (res.ticketId) {
              setLocation(`/tickets/${res.ticketId}`);
            } else {
              setLocation(`/tickets`);
            }
          }, 2000);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: err?.message || "Impossible d'initier le paiement. Place peut-être déjà prise.",
          });
        }
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Button variant="ghost" onClick={() => window.history.back()} className="mb-6 -ml-4 text-muted-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour
      </Button>

      <h1 className="text-3xl font-bold text-foreground mb-8">Paiement</h1>

      {isSimulatingPayment ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center flex flex-col items-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center animate-pulse">
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="w-10 h-10 text-orange-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Paiement en cours...</h2>
            <p className="text-muted-foreground">
              Veuillez valider la transaction sur votre téléphone.
              Simulation en cours (MVP)...
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          <Card className="border-border">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Informations Passager
              </h2>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="passengerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom complet du passager</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} className="h-12" />
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
                        <FormLabel>Numéro de téléphone (Orange Money)</FormLabel>
                        <FormControl>
                          <Input placeholder="07 XX XX XX XX" {...field} className="h-12" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-4 mt-8">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg" alt="Orange" className="w-10 h-10 object-contain" />
                    <div>
                      <h4 className="font-bold text-orange-900">Payer avec Orange Money</h4>
                      <p className="text-sm text-orange-800/80">Vous recevrez un prompt sur votre téléphone pour confirmer le paiement.</p>
                    </div>
                  </div>

                  <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={initiatePayment.isPending}>
                    {initiatePayment.isPending ? "Initialisation..." : "Confirmer et Payer"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
