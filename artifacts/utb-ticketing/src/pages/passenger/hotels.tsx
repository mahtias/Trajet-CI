import { useState } from "react";
import { Link } from "wouter";
import { format, addDays } from "date-fns";
import { useSearchHotels } from "@workspace/api-client-react";
import { Hotel, MapPin, Star, Users, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CityCombobox } from "@/components/city-combobox";
import { CITIES } from "@/lib/cities";

export default function Hotels() {
  const searchParams = new URLSearchParams(window.location.search);

  const [city, setCity] = useState(searchParams.get("city") || "");
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") || format(new Date(), "yyyy-MM-dd"));
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") || format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [rooms, setRooms] = useState(1);
  const [submitted, setSubmitted] = useState(!!searchParams.get("city"));

  const { data: hotels, isLoading, isError } = useSearchHotels(
    { city, checkIn, checkOut, rooms },
    { query: { enabled: submitted && !!city } }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!city || checkOut <= checkIn) return;
    setSubmitted(true);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 flex items-center justify-center gap-3">
          <Hotel className="w-8 h-8 text-primary" /> Hôtels
        </h1>
        <p className="text-muted-foreground">
          Trouvez un hôtel dans votre ville d'arrivée, où que vous soyez en Côte d'Ivoire.
        </p>
      </div>

      <Card className="mb-10">
        <CardContent className="p-4 md:p-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-1 block text-foreground">Ville</label>
              <CityCombobox
                cities={CITIES}
                value={city}
                onChange={setCity}
                placeholder="Choisir une ville"
                searchPlaceholder="Rechercher une ville..."
                emptyText="Aucune ville trouvée."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-foreground">Arrivée</label>
              <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="h-12" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-foreground">Départ</label>
              <Input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className="h-12" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-foreground">Chambres</label>
              <Input
                type="number"
                min={1}
                value={rooms}
                onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="h-12"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 font-bold">
              <Search className="mr-2 h-5 w-5" /> Rechercher
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl text-center">
          Impossible de charger les hôtels pour le moment.
        </div>
      )}

      {submitted && hotels && hotels.length === 0 && (
        <div className="text-center py-20 bg-muted/50 rounded-xl border border-border">
          <Hotel className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Aucun hôtel disponible</h2>
          <p className="text-muted-foreground">Essayez une autre ville ou d'autres dates.</p>
        </div>
      )}

      {hotels && hotels.length > 0 && (
        <div className="space-y-4">
          {hotels.map((hotel) => (
            <Card key={hotel.id} className="overflow-hidden hover:shadow-md transition-shadow hover:border-primary/40">
              <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-foreground">{hotel.name}</h3>
                    {hotel.rating && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                        <Star className="w-3.5 h-3.5 fill-accent" /> {hotel.rating}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                    <MapPin className="w-3.5 h-3.5" /> {hotel.address}, {hotel.city}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {hotel.availableRooms} chambre{hotel.availableRooms > 1 ? "s" : ""} disponible{hotel.availableRooms > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-xl font-bold text-accent font-mono">
                    {hotel.pricePerNight.toLocaleString("fr-CI")} FCFA<span className="text-sm text-muted-foreground font-normal">/nuit</span>
                  </span>
                  <Button asChild size="lg">
                    <Link href={`/hotels/${hotel.id}?checkIn=${checkIn}&checkOut=${checkOut}&rooms=${rooms}`}>
                      Voir
                    </Link>
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
