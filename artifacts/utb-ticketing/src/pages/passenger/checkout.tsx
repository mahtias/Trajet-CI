import { useMemo, useState } from "react";
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
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, getPaymentMethod, type PaymentMethodId } from "@/lib/payment-methods";

function buildCheckoutSchema(t: (key: string) => string) {
  return z.object({
    passengerName: z.string().min(2, t("checkout.nameRequired")),
    passengerPhone: z.string().min(8, t("common.invalidPhone")),
  });
}

export default function Checkout() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const seatId = searchParams.get("seatId");
  const { toast } = useToast();
  const { t } = useLanguage();

  const { data: user } = useGetMe({ query: { retry: false } });
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("wave");
  const selectedMethod = getPaymentMethod(paymentMethod);
  const initiatePayment = useInitiatePayment();

  // If we had an endpoint to get seat details directly, we'd use it.
  // We'll trust the user selection for UI display, actual validation happens on backend.

  const checkoutSchema = useMemo(() => buildCheckoutSchema(t), [t]);

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
        title: t("checkout.loginRequiredTitle"),
        description: t("checkout.loginRequiredDesc"),
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
          paymentMethod,
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
            title: t("common.error"),
            description: err?.message || t("checkout.initiateError"),
          });
        }
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Button variant="ghost" onClick={() => window.history.back()} className="mb-6 -ml-4 text-muted-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> {t("common.back")}
      </Button>

      <h1 className="text-3xl font-bold text-foreground mb-8">{t("checkout.title")}</h1>

      {isSimulatingPayment ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center flex flex-col items-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">{t("checkout.processing")}</h2>
            <p className="text-muted-foreground">
              {t("checkout.processingDesc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          <Card className="border-border">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4">{t("checkout.selectMethod")}</h2>
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
                <Shield className="w-5 h-5 text-primary" /> {t("checkout.passengerInfo")}
              </h2>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="passengerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("checkout.fullNameLabel")}</FormLabel>
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
                        <FormLabel>{t("checkout.phoneLabel")}</FormLabel>
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
                      <h4 className="font-bold">{t("checkout.payWith", { method: selectedMethod.name })}</h4>
                      <p className="text-sm opacity-80">{t("checkout.methodNote", { method: selectedMethod.name })}</p>
                    </div>
                  </div>

                  <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={initiatePayment.isPending}>
                    {initiatePayment.isPending ? t("checkout.initiating") : t("checkout.confirmPay")}
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
