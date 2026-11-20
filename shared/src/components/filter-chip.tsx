// A filter as a compact chip: "Type" until a value is chosen, then "Type: Panel Van" with a clear
// button. The options open in a searchable list. Chips wrap, so a row of them works on a phone.

import { Command } from 'cmdk';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { cn } from '../utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui';

export interface ChipOption {
  value: string;
  label: ReactNode;
  /** Text matched by the search box (default: the value). */
  keywords?: string;
  /** A coloured dot (a status colour). */
  color?: string;
  icon?: ComponentType<{ className?: string }>;
  /** A count or note on the right. */
  hint?: ReactNode;
}

export function FilterChip({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  searchable,
  className,
}: {
  label: string;
  value: string | undefined;
  options: ChipOption[];
  onChange: (value: string | undefined) => void;
  icon?: ComponentType<{ className?: string }>;
  /** Show a search box (default: more than 8 options). */
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find((o) => o.value === value);
  const showSearch = searchable ?? options.length > 8;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => (o.keywords ?? o.value).toLowerCase().includes(q)) : options;
  const active = value !== undefined && value !== '';

  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-full border text-[13px] shadow-xs transition-colors',
        active ? 'border-primary/40 bg-primary-soft text-foreground' : 'border-dashed border-input bg-card text-muted-foreground hover:border-solid hover:text-foreground',
        className,
      )}
    >
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn('inline-flex h-full cursor-pointer items-center gap-1.5 rounded-full pl-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/30', active ? 'pr-1.5' : 'pr-2.5')} aria-label={active ? `${label}: ${typeof current?.label === 'string' ? current.label : value}. Change` : `Filter by ${label.toLowerCase()}`}>
            {Icon && <Icon className="size-3.5 opacity-70" />}
            <span className={cn(active && 'text-muted-foreground')}>{label}</span>
            {active && (
              <>
                <span className="text-muted-foreground/60">·</span>
                {current?.color && <span className="size-2 rounded-full" style={{ background: current.color }} />}
                <span className="max-w-40 truncate font-medium">{current?.label ?? value}</span>
              </>
            )}
            {!active && <ChevronDown className="size-3.5 opacity-60" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0">
          <Command loop shouldFilter={false} label={`Filter by ${label.toLowerCase()}`}>
            {showSearch && (
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-muted-foreground" />
                <Command.Input value={query} onValueChange={setQuery} placeholder={`Search ${label.toLowerCase()}`} className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
            )}
            <Command.List className="max-h-72 overflow-y-auto p-1">
              {!shown.length && <div className="px-3 py-5 text-center text-sm text-muted-foreground">No matches.</div>}
              {shown.map((o) => (
                <Command.Item
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value === value ? undefined : o.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[selected=true]:bg-accent"
                >
                  {o.color ? <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} /> : o.icon ? <o.icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint !== undefined && <span className="text-xs text-muted-foreground tabular">{o.hint}</span>}
                  <Check className={cn('size-4 shrink-0 text-primary', o.value !== value && 'invisible')} />
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {active && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="mr-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
          aria-label={`Clear ${label.toLowerCase()} filter`}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
