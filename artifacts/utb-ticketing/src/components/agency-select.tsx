import { useGetAdminAgencies, type AgencyType } from "@workspace/api-client-react";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

export const AGENCY_TYPE_LABELS: Record<AgencyType, string> = {
  hotel: "Hôtel",
  tourism: "Tourisme",
  vehicle_rental: "Location de véhicule",
};

interface AgencySelectProps {
  /** Only list agencies of this type; all agencies when omitted. */
  type?: AgencyType;
  value: string;
  onChange: (agencyId: string) => void;
  placeholder?: string;
}

export function AgencySelect({ type, value, onChange, placeholder = "Choisir une agence" }: AgencySelectProps) {
  const { data: agencies } = useGetAdminAgencies(type ? { type } : undefined);

  return (
    <div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {agencies?.map((a) => (
            <SelectItem key={a.id} value={a.id.toString()}>
              {a.name} ({a.city}){type ? "" : ` · ${AGENCY_TYPE_LABELS[a.type]}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {agencies?.length === 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Aucune agence{type ? ` de type « ${AGENCY_TYPE_LABELS[type]} »` : ""}. Créez-en une depuis la page « Agences ».
        </p>
      )}
    </div>
  );
}
