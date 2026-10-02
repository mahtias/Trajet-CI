import { SearchableSelect } from "@/components/searchable-select";

interface StationSelectProps {
  stations: Array<{ id: number; name: string; cityName: string }> | undefined;
  /** Selected station id as a string ("" = none), like the <Select> values it replaces */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Station picker with live search while typing ("Gare, Ville"): matches the station or the city name,
 * ignoring case and accents (same filtering as every SearchableSelect).
 */
export function StationSelect({ stations, value, onChange, placeholder = "Choisir une gare", disabled, className }: StationSelectProps) {
  return (
    <SearchableSelect
      options={(stations ?? []).map((s) => ({ value: s.id.toString(), label: `${s.name}, ${s.cityName}` }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Rechercher une gare ou une ville..."
      emptyText="Aucune gare ne correspond à cette recherche."
      ariaLabel={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}
