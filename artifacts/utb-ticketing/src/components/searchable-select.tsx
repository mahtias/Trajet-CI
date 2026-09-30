import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional heading: options sharing a group are listed under it (e.g. "Compagnies", "Agences") */
  group?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Lowercase and strip accents, so typing "bouake" finds "Bouaké". */
function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Substring match on the label, ignoring case and accents
function filterOptions(_value: string, search: string, keywords?: string[]) {
  return keywords?.some((k) => k.includes(normalize(search))) ? 1 : 0;
}

/** A dropdown like <Select>, with a search box to filter long lists (cities, stations, companies…). */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = 'Rechercher...',
  emptyText = 'Aucun résultat.',
  className,
  disabled = false,
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  // Keep the options' order, grouped by heading (ungrouped options come as one untitled group)
  const groups = options.reduce<Array<{ heading?: string; options: SearchableSelectOption[] }>>((acc, option) => {
    const group = acc.find((g) => g.heading === option.group);
    if (group) group.options.push(option);
    else acc.push({ heading: option.group, options: [option] });
    return acc;
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[14rem] p-0" align="start">
        <Command filter={filterOptions}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading ?? ''} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[normalize(option.label)]}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
