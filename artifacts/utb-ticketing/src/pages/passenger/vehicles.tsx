import { useState } from "react";
import { Link } from "wouter";
import { useListVehicles } from "@workspace/api-client-react";
import { Car, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImageThumb } from "@/components/image-gallery";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Price } from "@/components/price";

const ALL_CATEGORIES = "all";

export default function Vehicles() {
  const [category, setCategory] = useState(ALL_CATEGORIES);

  // Categories come from the unfiltered catalog so the filter always lists every option
  const { data: allVehicles } = useListVehicles();
  const { data: vehicles, isLoading, isError } = useListVehicles(
    category === ALL_CATEGORIES ? undefined : { category }
  );
  const categories = Array.from(new Set(allVehicles?.map((v) => v.category.toLowerCase()) ?? [])).sort();

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 flex items-center justify-center gap-3">
          <Car className="w-8 h-8 text-primary" /> Location de véhicules
        </h1>
        <p className="text-muted-foreground">
          Louez un véhicule auprès d'agences partenaires, à la journée.
        </p>
      </div>

      <div className="flex justify-center mb-10">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-64 h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Toutes les catégories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 bg-muted animate-pulse rounded-xl"></div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl text-center">
          Impossible de charger les véhicules pour le moment.
        </div>
      )}

      {vehicles && vehicles.length === 0 && (
        <div className="text-center py-20 bg-muted/50 rounded-xl border border-border">
          <Car className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Aucun véhicule disponible</h2>
          <p className="text-muted-foreground">Essayez une autre catégorie.</p>
        </div>
      )}

      {vehicles && vehicles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="overflow-hidden flex flex-col hover:shadow-md transition-shadow hover:border-primary/40">
              <ImageThumb src={vehicle.images?.[0]} alt={`${vehicle.brand} ${vehicle.model}`} icon={Car} className="w-full aspect-video" />
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-foreground">{vehicle.brand} {vehicle.model}</h3>
                  <span className="text-xs px-2 py-1 rounded-md bg-secondary/10 text-secondary capitalize">{vehicle.category}</span>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
                  <Users className="w-3.5 h-3.5" /> {vehicle.seats} places · {vehicle.agencyName}
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <Price amountFcfa={vehicle.pricePerDay} suffix="/jour" className="text-xl font-bold text-accent font-mono" />
                  <Button asChild>
                    <Link href={`/vehicles/${vehicle.id}`}>Voir</Link>
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
