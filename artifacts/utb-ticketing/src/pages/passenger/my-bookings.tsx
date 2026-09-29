import { Link } from "wouter";
import { useGetMyTourismBookings, useGetMyVehicleBookings } from "@workspace/api-client-react";
import { Landmark, Car, CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { Price } from "@/components/price";
import { useLanguage } from "@/hooks/use-language";
import { formatShortDate } from "@/lib/dates";

export default function MyBookings() {
  const { t, tc, dateLocale } = useLanguage();
  const { data: tourismBookings, isLoading: tourismLoading } = useGetMyTourismBookings();
  const { data: vehicleBookings, isLoading: vehicleLoading } = useGetMyVehicleBookings();

  const isLoading = tourismLoading || vehicleLoading;
  const isEmpty = !isLoading && !tourismBookings?.length && !vehicleBookings?.length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold text-foreground mb-8">{t("bookings.myAgencyBookingsTitle")}</h1>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl"></div>)}
        </div>
      )}

      {isEmpty && (
        <div className="text-center py-16 bg-muted/50 rounded-xl border border-border">
          <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">{t("bookings.noBookingsYet")}</p>
          <div className="flex justify-center gap-3">
            <Button asChild variant="outline"><Link href="/tourism">{t("bookings.browseTourism")}</Link></Button>
            <Button asChild variant="outline"><Link href="/vehicles">{t("bookings.rentVehicle")}</Link></Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tourismBookings?.map((b) => (
          <Card key={`t-${b.id}`}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> {b.spotName}</p>
                <p className="text-sm text-muted-foreground">
                  {t("bookings.visitOn", { date: formatShortDate(b.visitDate, dateLocale) })} · {tc("bookings.people", b.nbPeople)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Price amountFcfa={b.totalPrice} align="right" className="font-bold font-mono" />
                <BookingStatusBadge status={b.status} />
              </div>
            </CardContent>
          </Card>
        ))}
        {vehicleBookings?.map((b) => (
          <Card key={`v-${b.id}`}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold flex items-center gap-2"><Car className="w-4 h-4 text-primary" /> {b.vehicleLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {t("bookings.fromTo", { from: formatShortDate(b.startDate, dateLocale), to: formatShortDate(b.endDate, dateLocale) })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Price amountFcfa={b.totalPrice} align="right" className="font-bold font-mono" />
                <BookingStatusBadge status={b.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
