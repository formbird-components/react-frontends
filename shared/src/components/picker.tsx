// Choosing from many: a field-like trigger that opens a searchable, keyboard-friendly list.
//
// - PickerPopover: the popover with its search box and list; the caller renders the items (apps
//   build their own pickers on it, e.g. an asset picker with icons and statuses).
// - Combobox: a ready picker over options, single or multiple, from a list or loaded per search
//   text (an Elasticsearch search).

import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '../utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui';

/** A picker's trigger: looks like an input. */
export const pickerTriggerClass =
  'flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger';

/** A row in a picker's list (a cmdk Command.Item). */
export const pickerItemClass = 'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm outline-none select-none data-[selected=true]:bg-accent';

/** The popover of a picker: a search box over a list. Render Command.Item rows (with pickerItemClass) as children. */
export function PickerPopover({
  open,
  onOpenChange,
  trigger,
  children,
  placeholder,
  query,
  onQuery,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  placeholder: string;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0">
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input value={query} onValueChange={onQuery} placeholder={placeholder} className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">{children}</Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface ComboOption {
  /** Unique: a document id, or a value. */
  value: string;
  /** What the option is called (shown, and searched in a static list). */
  label: string;
  /** A second line. */
  description?: ReactNode;
  /** Before the label (an avatar, an icon, a colour dot). */
  icon?: ReactNode;
  /** On the right (a status badge). */
  trailing?: ReactNode;
  /** Greyed out and not choosable; a string says why (shown as the second line). */
  disabled?: boolean | string;
  /** Anything the caller wants back with the choice (the whole document). */
  data?: unknown;
}

interface ComboboxBase {
  /**
   * The options: a list (filtered here by the search text), or a function that loads them for the
   * search text (called while the list is open; cached by `queryKey` and the text).
   */
  options: ComboOption[] | ((text: string) => Promise<ComboOption[]>);
  /** The cache key of loaded options (required with a function; e.g. ['people']). */
  queryKey?: unknown[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** When nothing matches (default "No matches."). */
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export type ComboboxProps = ComboboxBase &
  (
    | { multiple?: false; value: ComboOption | undefined; onChange: (value: ComboOption | undefined) => void; clearable?: boolean }
    | { multiple: true; value: ComboOption[]; onChange: (value: ComboOption[]) => void; clearable?: boolean }
  );

/** A searchable single or multiple choice over options from a list or loaded per search. */
export function Combobox(props: ComboboxProps) {
  const { options, queryKey, placeholder = 'Choose…', searchPlaceholder = 'Search', emptyText = 'No matches.', invalid, disabled, id, className } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const text = query.trim();
  const load = typeof options === 'function' ? options : undefined;
  const loaded = useQuery({
    queryKey: ['picker', ...(queryKey ?? []), text],
    queryFn: () => load!(text),
    enabled: open && !!load,
    placeholderData: (previous) => previous,
  });
  const shown = useMemo(() => {
    if (load) return loaded.data ?? [];
    const list = options as ComboOption[];
    const q = text.toLowerCase();
    return q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list;
  }, [load, loaded.data, options, text]);

  const chosen = props.multiple ? props.value : props.value ? [props.value] : [];
  const isChosen = (o: ComboOption) => chosen.some((c) => c.value === o.value);
  const choose = (o: ComboOption) => {
    if (props.multiple) {
      props.onChange(isChosen(o) ? props.value.filter((c) => c.value !== o.value) : [...props.value, o]);
    } else {
      props.onChange(o);
      setOpen(false);
    }
  };
  const clear = () => (props.multiple ? props.onChange([]) : props.onChange(undefined));

  return (
    <PickerPopover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
      query={query}
      onQuery={setQuery}
      placeholder={searchPlaceholder}
      trigger={
        <button type="button" id={id} disabled={disabled} aria-invalid={invalid || undefined} className={cn(pickerTriggerClass, props.multiple && chosen.length > 0 && 'h-auto min-h-9 py-1', className)}>
          {chosen.length === 0 ? (
            <span className="text-muted-foreground/80">{placeholder}</span>
          ) : props.multiple ? (
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {chosen.map((c) => (
                <span key={c.value} className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                  <span className="truncate">{c.label}</span>
                </span>
              ))}
            </span>
          ) : (
            <>
              {chosen[0].icon}
              <span className="truncate">{chosen[0].label}</span>
            </>
          )}
          {props.clearable && chosen.length > 0 && !disabled ? (
            <X
              aria-label="Clear"
              className="ml-auto size-4 shrink-0 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
            />
          ) : (
            <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
          )}
        </button>
      }
    >
      {!shown.length && <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{load && loaded.isFetching ? 'Searching…' : emptyText}</Command.Empty>}
      {shown.map((o) => {
        const reason = typeof o.disabled === 'string' ? o.disabled : undefined;
        return (
          <Command.Item
            key={o.value}
            value={o.value}
            disabled={!!o.disabled}
            onSelect={() => choose(o)}
            // Choosing several: a click keeps the focus in the search box.
            onMouseDown={props.multiple ? (e) => e.preventDefault() : undefined}
            className={cn(pickerItemClass, o.disabled && 'opacity-50')}
          >
            {o.icon}
            <div className="min-w-0 flex-1">
              <div className="truncate">{o.label}</div>
              {(reason ?? o.description) && <div className="truncate text-xs text-muted-foreground">{reason ?? o.description}</div>}
            </div>
            {o.trailing}
            <Check className={cn('size-4 shrink-0 text-primary', !isChosen(o) && 'invisible')} />
          </Command.Item>
        );
      })}
    </PickerPopover>
  );
}
