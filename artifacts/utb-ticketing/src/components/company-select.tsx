import { useGetAdminCompanies } from "@workspace/api-client-react";
import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { SearchableSelect, type SearchableSelectOption } from "@/components/searchable-select";

/**
 * Companies for pickers. Same query as the other admin screens (page 1, 100 per page), so it is
 * shared through the react-query cache. For a company admin the server only returns its own company.
 */
export function useCompanyOptions(group?: string): { options: SearchableSelectOption[]; isLoading: boolean } {
  const { data, isLoading } = useGetAdminCompanies({ page: 1, pageSize: 100 });
  const options = (data?.items ?? []).map((c) => ({ value: String(c.id), label: c.name, group }));
  return { options, isLoading };
}

interface CompanySelectProps {
  /** Selected company id as a string ("" = none), like the <Select> values it replaces */
  value: string;
  onChange: (companyId: string) => void;
  /**
   * Fixed company shown read-only, no search (company admins: their company is imposed).
   * The name comes from the loaded list.
   */
  lockedCompanyId?: number | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Company picker with live search on the name (case and accent insensitive). */
export function CompanySelect({
  value,
  onChange,
  lockedCompanyId,
  placeholder = "Choisir une compagnie",
  className,
  disabled,
}: CompanySelectProps) {
  const { options, isLoading } = useCompanyOptions();

  if (lockedCompanyId) {
    const name = options.find((o) => o.value === String(lockedCompanyId))?.label;
    return (
      <div
        className={cn("flex h-10 w-full items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm", className)}
        aria-label="Compagnie"
        aria-readonly="true"
      >
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">{name ?? (isLoading ? "Chargement..." : "Votre compagnie")}</span>
      </div>
    );
  }

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={isLoading ? "Chargement..." : placeholder}
      searchPlaceholder="Rechercher une compagnie..."
      emptyText="Aucune compagnie ne correspond à cette recherche."
      className={className}
      disabled={disabled}
      ariaLabel="Compagnie"
    />
  );
}
