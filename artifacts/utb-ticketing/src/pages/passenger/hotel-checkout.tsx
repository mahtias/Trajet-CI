import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useInitiateHotelBooking, useGetMe, useGetHotel, getGetHotelQueryKey } from "@workspace/api-client-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
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
import { useLanguage } from "@/hooks/use-language";
import { PaymentAmount } from "@/components/price";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, getPaymentMethod, type PaymentMethodId } from "@/lib/payment-methods";
import { PhoneInput } from "@/components/phone-input";
import { isValidPhone, normalizePhone } from "@/lib/phone";

function buildCheckoutSchema(t: (key: string) => string) {
  return z.object({
    guestName: z.string().min(2, t("hotels.guestNameRequired")),
    guestPhone: z.string().refine(isValidPhone, t("common.invalidPhone")),
  });
}

export default function HotelCheckout() {
  const { id } = useParams<{ id: string }>();
  const hotelId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const rooms = parseInt(searchParams.get("rooms") || "1", 10);

  // Same formula as the server (price/night × nights × rooms); the server's amount is the one charged
  const { data: hotel } = useGetHotel(hotelId, { query: { queryKey: getGetHotelQueryKey(hotelId), enabled: !!hotelId } });
  const nights = checkIn && checkOut ? differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)) : 0;
  const amountToPay = hotel && nights > 0 ? hotel.pricePerNight * nights * rooms : null;
  const { t, tc } = useLanguage();
  const checkoutSchema = useMemo(() => buildCheckoutSchema(t), [t]);

  const { toast } = useToast();
  const { data: user } = useGetMe({ query: { retry: false } });
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("wave");
  const selectedMethod = getPaymentMethod(paymentMethod);

  const initiateBooking = useInitiateHotelBooking();

  const form = useForm<z.infer<typeof checkoutSchema>>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      guestName: user?.name || "",
      // The account's number, whatever format it was stored in, as the full +… number
      guestPhone: normalizePhone(user?.phone),
    },
  });

  // The account often loads after the first render (page opened directly): fill the fields then,
  // unless the person already typed something
  useEffect(() => {
    if (!user) return;
    if (!form.getValues("guestName") && user.name) form.setValue("guestName", user.name);
    if (!form.getValues("guestPhone") && user.phone) form.setValue("guestPhone", normalizePhone(user.phone));
  }, [user, form]);

  if (!hotelId || !checkIn || !checkOut) {
    setLocation("/hotels");
    return null;
  }

  const onSubmit = (values: z.infer<typeof checkoutSchema>) => {
    if (!user) {
      toast({ title: t("hotels.loginRequired"), description: t("hotels.loginRequiredDesc") });
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
          if (!res.redirectUrl) {
            toast({ variant: "destructive", title: t("common.error"), description: t("hotels.initiateError") });
            return;
          }
          // Full-page redirect to PayDunya; the customer comes back on /payment/return
          setIsRedirecting(true);
          window.location.assign(res.redirectUrl);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || err?.message || t("hotels.initiateError"),
          });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Button variant="ghost" onClick={() => window.history.back()} className="mb-6 -ml-4 text-muted-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> {t("common.back")}
      </Button>

      <h1 className="text-3xl font-bold text-foreground mb-8">{t("hotels.checkoutTitle")}</h1>

      {isRedirecting ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center flex flex-col items-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">{t("checkout.processing")}</h2>
            <p className="text-muted-foreground">{t("checkout.processingDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {amountToPay !== null && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-6 flex items-center justify-between gap-4">
              <span className="text-muted-foreground font-medium">{t("price.amountToPay")} · {tc("hotels.nights", nights)}, {tc("hotels.rooms", rooms)}</span>
              <PaymentAmount amountFcfa={amountToPay} className="text-2xl font-bold text-primary font-mono" />
            </CardContent>
            </Card>
          )}
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
                        {method.shortLabel}
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
                <Shield className="w-5 h-5 text-primary" /> {t("hotels.guestInfo")}
              </h2>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="guestName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("hotels.fullName")}</FormLabel>
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
                        <FormLabel>{t("checkout.phoneLabel")}</FormLabel>
                        <FormControl>
                          <PhoneInput {...field} countryLabel={t("common.phoneCountry")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className={cn("border rounded-xl p-4 flex gap-4 mt-8", selectedMethod.panelClass)}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0", selectedMethod.badgeClass)}>
                      {selectedMethod.shortLabel}
                    </div>
                    <div>
                      <h4 className="font-bold">{t("checkout.payWith", { method: selectedMethod.name })}</h4>
                      <p className="text-sm opacity-80">
                        {t(selectedMethod.kind === "card" ? "checkout.cardNote" : "checkout.methodNote", { method: selectedMethod.name })}
                      </p>
                    </div>
                  </div>

                  <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={initiateBooking.isPending}>
                    {initiateBooking.isPending ? t("checkout.initiating") : t("checkout.confirmPay")}
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
