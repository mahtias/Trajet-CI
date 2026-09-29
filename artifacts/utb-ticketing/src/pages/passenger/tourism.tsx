import { useState } from "react";
import { Link } from "wouter";
import { useListTourismSpots } from "@workspace/api-client-react";
import { Landmark, MapPin, Users, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ImageThumb } from "@/components/image-gallery";
import { Price } from "@/components/price";
import { useLanguage } from "@/hooks/use-language";

export default function Tourism() {
  const { t } = useLanguage();
  const [locationInput, setLocationInput] = useState("");
  const [location, setLocation] = useState("");

  const { data: spots, isLoading, isError } = useListTourismSpots(location ? { location } : undefined);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLocation(locationInput.trim());
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 flex items-center justify-center gap-3">
          <Landmark className="w-8 h-8 text-primary" /> {t("tourism.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("tourism.subtitle")}
        </p>
      </div>

      <Card className="mb-10 max-w-2xl mx-auto">
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex gap-3">
            <Input
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder={t("tourism.filterPlaceholder")}
              className="h-12"
            />
            <Button type="submit" size="lg" className="h-12 font-bold">
              <Search className="mr-2 h-5 w-5" /> {t("tourism.filter")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl text-center">
          {t("tourism.loadError")}
        </div>
      )}

      {spots && spots.length === 0 && (
        <div className="text-center py-20 bg-muted/50 rounded-xl border border-border">
          <Landmark className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">{t("tourism.noneTitle")}</h2>
          <p className="text-muted-foreground">{t("tourism.noneDesc")}</p>
        </div>
      )}

      {spots && spots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {spots.map((spot) => (
            <Card key={spot.id} className="overflow-hidden flex flex-col hover:shadow-md transition-shadow hover:border-primary/40">
              <ImageThumb src={spot.images?.[0]} alt={spot.name} icon={Landmark} className="w-full aspect-video" thumbnail />
              <CardContent className="p-5 flex flex-col flex-1">
                <h3 className="text-lg font-bold text-foreground mb-1">{spot.name}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="w-3.5 h-3.5" /> {spot.location}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
                  <Users className="w-3.5 h-3.5" /> {t("tourism.visitorsPerDay", { count: spot.capacityPerDay })} · {spot.agencyName}
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <Price amountFcfa={spot.price} suffix={t("tourism.perPerson")} className="text-xl font-bold text-accent font-mono" />
                  <Button asChild>
                    <Link href={`/tourism/${spot.id}`}>{t("bookings.view")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
