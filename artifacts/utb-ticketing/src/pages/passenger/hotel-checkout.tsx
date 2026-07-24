import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useInitiateHotelBooking, useHotelBookingCallback, useGetMe } from "@workspace/api-client-react";
import { ArrowLeft, Shield } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, getPaymentMethod, type PaymentMethodId } from "@/lib/payment-methods";

const checkoutSchema = z.object({
  guestName: z.string().min(2, "Nom du client requis"),
  guestPhone: z.string().min(8, "Numéro de téléphone invalide"),
});

export default function HotelCheckout() {
  const { id } = useParams<{ id: string }>();
  const hotelId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const rooms = parseInt(searchParams.get("rooms") || "1", 10);

  const { toast } = useToast();
  const { data: user } = useGetMe({ query: { retry: false } });
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("wave");
  const selectedMethod = getPaymentMethod(paymentMethod);

  const initiateBooking = useInitiateHotelBooking();
  const bookingCallback = useHotelBookingCallback();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      guestName: user?.name || "",
      guestPhone: user?.phone || "",
    },
  });

  if (!hotelId || !checkIn || !checkOut) {
    setLocation("/hotels");
    return null;
  }

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    if (!user) {
      toast({ title: "Connexion requise", description: "Veuillez vous connecter pour réserver." });
      setLocation("/login");
      return;
    }

    initiateBooking.mutate(
      {
        data: {
          hotelId,
          guestName: values.guestName,
          guestPhone: values.guestPhone,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          rooms,
          paymentMethod,
        },
      },
      {
        onSuccess: (res) => {
          setIsSimulatingPayment(true);
          setTimeout(() => {
            bookingCallback.mutate(
              { data: { paymentId: res.paymentId, status: "success" } },
              {
                onSuccess: () => {
                  if (res.bookingId) {
                    setLocation(`/hotel-bookings/${res.bookingId}`);
                  } else {
                    setLocation("/hotel-bookings");
                  }
                },
              }
            );
          }, 2000);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Erreur",
            description: err?.message || "Impossible d'initier la réservation. Chambres peut-être indisponibles.",
          });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Button variant="ghost" onClick={() => window.history.back()} className="mb-6 -ml-4 text-muted-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Retour
      </Button>

      <h1 className="text-3xl font-bold text-foreground mb-8">Paiement de la réservation</h1>

      {isSimulatingPayment ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center flex flex-col items-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Paiement en cours...</h2>
            <p className="text-muted-foreground">Veuillez valider la transaction sur votre téléphone. Simulation en cours (MVP)...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          <Card className="border-border">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4">Choisissez votre moyen de paiement</h2>
              <div className="grid grid-cols-3 gap-3">
                {PAYMENT_METHODS.map((method) => {
                  const isSelected = paymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        isSelected ? "border-primary shadow-md" : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs", method.badgeClass)}>
                        {method.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-center">{method.name}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Informations du client
              </h2>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="guestName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom complet</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} className="h-12" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guestPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Numéro de téléphone (Mobile Money)</FormLabel>
                        <FormControl>
                          <Input placeholder="07 XX XX XX XX" {...field} className="h-12" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className={cn("border rounded-xl p-4 flex gap-4 mt-8", selectedMethod.panelClass)}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0", selectedMethod.badgeClass)}>
                      {selectedMethod.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold">Payer avec {selectedMethod.name}</h4>
                      <p className="text-sm opacity-80">Vous recevrez un prompt sur votre téléphone {selectedMethod.name} pour confirmer le paiement.</p>
                    </div>
                  </div>

                  <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={initiateBooking.isPending}>
                    {initiateBooking.isPending ? "Initialisation..." : "Confirmer et Payer"}
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
