import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetTrip,
  useGetTripSeats,
  getGetTripSeatsQueryKey,
  useGetTripPricing,
  getGetTripPricingQueryKey,
} from "@workspace/api-client-react";
import { Clock, Info, ShieldCheck, ArrowRight, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Price } from "@/components/price";
import { PriceBreakdown } from "@/components/price-breakdown";
import { useSeatPages, SeatPageTabs } from "@/components/seat-pages";
import { formatShortDate } from "@/lib/dates";

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, dateLocale, numberLocale } = useLanguage();
  const queryClient = useQueryClient();

  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);
  // Automatic seat assignment is free; choosing a precise seat adds the seat selection fee
  const [seatMode, setSeatMode] = useState<"auto" | "manual">("auto");
  const { data: pricing } = useGetTripPricing(tripId, { query: { queryKey: getGetTripPricingQueryKey(tripId), enabled: !!tripId } });

  const { data: trip, isLoading: isLoadingTrip } = useGetTrip(tripId, {
    query: { enabled: !!tripId }
  });

  const { data: seats, isLoading: isLoadingSeats } = useGetTripSeats(tripId, {
    query: { 
      enabled: !!tripId,
      refetchInterval: 15000 // Poll every 15s
    }
  });
  // Long buses are shown in parts (pages sized from the bus's real capacity)
  const seatPages = useSeatPages(seats);

  const handleSeatClick = (seatId: number, status: string) => {
    if (status !== "available" || seatMode !== "manual") return;
    setSelectedSeatId(seatId);
  };

  const chooseMode = (mode: "auto" | "manual") => {
    setSeatMode(mode);
    if (mode === "auto") setSelectedSeatId(null);
  };

  const canContinue = seatMode === "auto" || !!selectedSeatId;

  const handleContinue = () => {
    if (!canContinue) return;
    // The seat (chosen or automatic) is held atomically by POST /payments/initiate when the checkout starts
    setLocation(seatMode === "manual" ? `/checkout?tripId=${tripId}&seatId=${selectedSeatId}` : `/checkout?tripId=${tripId}`);
  };

  if (isLoadingTrip || isLoadingSeats) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!trip || !seats) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
        {t("tripDetail.notFound")}
      </div>
    );
  }

  const selectedSeat = seats.find(s => s.id === selectedSeatId);

  return (
    <div className="bg-background min-h-screen">
      <div className="bg-secondary text-secondary-foreground py-8">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white text-xs font-bold mb-3">
                {trip.companyName}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold flex flex-wrap items-center gap-3">
                {trip.origin} <ArrowRight className="w-5 h-5 text-primary" /> {trip.destination}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-white/80">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatShortDate(trip.departureDate, dateLocale)} {t("tripDetail.at")} {trip.departureTime.slice(0, 5)}
                </div>
              </div>
            </div>
            <div className="bg-white/10 px-6 py-4 rounded-xl text-right">
              <div className="text-sm text-white/80 uppercase tracking-wider mb-1">{t("tripDetail.pricePerSeat")}</div>
              <Price amountFcfa={trip.price} align="right" className="text-3xl font-mono font-bold text-accent" fcfaClassName="text-white/80" />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Seat Map */}
          <div className="lg:col-span-2">
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col items-center mb-8 gap-4 border-b border-border pb-6">
                  <div className="w-full flex justify-between px-10 text-muted-foreground text-sm font-medium">
                    <span>{t("tripDetail.driver")}</span>
                    <span>{t("tripDetail.door")}</span>
                  </div>
                  <div className="w-24 h-8 bg-muted rounded-t-lg rounded-b-sm border-2 border-border border-b-0 flex items-center justify-center">
                    <div className="w-16 h-2 bg-background rounded-full"></div>
                  </div>
                </div>

                <SeatPageTabs
                  pages={seatPages.pages}
                  page={seatPages.page}
                  onPageChange={seatPages.setPage}
                  label={(p) => t("tripDetail.seatPage", { from: p.from, to: p.to, free: p.free })}
                  className="mb-6"
                />

                {/* 4 columns layout: [Seat] [Seat]  (Aisle)  [Seat] [Seat] */}
                <div className="grid grid-cols-4 gap-x-4 gap-y-4 max-w-md mx-auto relative">
                  {/* Aisle vertical line for visual clarity */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-8 -ml-4 bg-muted/20 rounded-full z-0"></div>
                  
                  {seatPages.pageSeats.map((seat) => {
                    const isSelected = selectedSeatId === seat.id;
                    let bgColor = "bg-green-100 hover:bg-green-200 border-green-300 text-green-800";
                    let cursor = "cursor-pointer";
                    
                    if (seat.status === "sold") {
                      bgColor = "bg-destructive/10 border-destructive/30 text-destructive";
                      cursor = "cursor-not-allowed opacity-50";
                    } else if (seat.status === "reserved") {
                      bgColor = "bg-accent/20 border-accent/40 text-accent-foreground";
                      cursor = "cursor-not-allowed opacity-50";
                    }

                    if (isSelected) {
                      bgColor = "bg-primary border-primary text-primary-foreground shadow-md scale-105";
                    }

                    if (seatMode === "auto" && seat.status === "available") cursor = "cursor-default";

                    return (
                      <button
                        key={seat.id}
                        disabled={seat.status !== "available" || seatMode !== "manual"}
                        onClick={() => handleSeatClick(seat.id, seat.status)}
                        className={`relative z-10 w-full aspect-square rounded-xl border-2 flex items-center justify-center font-bold text-lg transition-all ${bgColor} ${cursor}`}
                      >
                        {seat.seatNumber}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap justify-center gap-6 mt-10 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border-2 bg-green-100 border-green-300"></div>
                    <span>{t("tripDetail.free")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border-2 bg-primary border-primary"></div>
                    <span>{t("tripDetail.selected")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border-2 bg-accent/20 border-accent/40 opacity-50"></div>
                    <span>{t("tripDetail.reserved")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border-2 bg-destructive/10 border-destructive/30 opacity-50"></div>
                    <span>{t("tripDetail.occupied")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <Card className="border-border bg-card shadow-sm overflow-hidden">
                <div className="bg-muted p-4 border-b border-border flex items-center gap-2 font-bold text-foreground">
                  <UserRound className="w-5 h-5 text-primary" /> {t("tripDetail.selectionTitle")}
                </div>
                <CardContent className="p-6 space-y-5">
                  {/* Seat mode: free automatic assignment or paid seat choice */}
                  <div className="space-y-2" role="radiogroup" aria-label={t("tripDetail.seatModeTitle")}>
                    {([
                      ["auto", t("tripDetail.seatModeAuto"), t("tripDetail.seatModeAutoDesc")],
                      ["manual", t("tripDetail.seatModeManual"), t("tripDetail.seatModeManualDesc", { fee: (pricing?.seatSelectionFee ?? 0).toLocaleString(numberLocale) })],
                    ] as const).map(([mode, label, desc]) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={seatMode === mode}
                        onClick={() => chooseMode(mode)}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border-2 p-3 text-left transition-colors ${seatMode === mode ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                      >
                        <span className="font-medium text-sm">{label}</span>
                        <span className={`text-xs font-bold shrink-0 ${mode === "auto" ? "text-green-700" : "text-accent"}`}>{desc}</span>
                      </button>
                    ))}
                  </div>

                  {seatMode === "manual" && !selectedSeatId ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                        <Info className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p>{t("tripDetail.selectSeatPrompt")}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center pb-4 border-b border-border">
                        <span className="text-muted-foreground">{t("tripDetail.seatNumber")}</span>
                        {seatMode === "manual" ? (
                          <span className="font-bold text-2xl bg-secondary/10 text-secondary w-12 h-12 flex items-center justify-center rounded-xl">{selectedSeat?.seatNumber}</span>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">{t("tripDetail.seatAssignedAtPayment")}</span>
                        )}
                      </div>
                      <PriceBreakdown
                        farePrice={pricing?.farePrice ?? trip.price}
                        serviceFee={pricing?.platformCommission ?? 0}
                        seatSelectionFee={seatMode === "manual" ? pricing?.seatSelectionFee ?? 0 : 0}
                      />
                      {seatMode === "auto" && <p className="text-xs text-muted-foreground">{t("tripDetail.autoSeatInfo")}</p>}

                      <Button onClick={handleContinue} disabled={!canContinue || !pricing} className="w-full h-14 text-lg mt-2" size="lg">
                        {t("common.continue")} <ArrowRight className="w-5 h-5 ml-2" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="bg-muted/50 rounded-xl p-4 flex gap-3 text-sm text-muted-foreground border border-border">
                <ShieldCheck className="w-6 h-6 text-primary shrink-0" />
                <p>{t("tripDetail.securePaymentNote")}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
