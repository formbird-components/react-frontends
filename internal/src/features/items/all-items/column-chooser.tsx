// Choosing All Items' columns (the original list's hidden columns can be shown), remembered in this browser.

import { Columns3 } from 'lucide-react';
import { useState } from 'react';
import { COLUMNS, type ColumnKey } from '@/components/items-table';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger, Separator } from '@react-frontends/shared/ui';
import { ALL_COLUMNS, COLUMNS_KEY, columnsFrom, DEFAULT_COLUMNS, FIXED_COLUMNS, toggleColumn } from './columns';
import { readStored, writeStored } from './filters';

/** The columns shown, and how to change them (kept in localStorage). */
export function useColumns() {
  const [columns, setColumns] = useState<ColumnKey[]>(() => columnsFrom(readStored(COLUMNS_KEY, (v): v is unknown[] => Array.isArray(v))));
  const change = (next: ColumnKey[]) => {
    setColumns(next);
    writeStored(COLUMNS_KEY, next.join() === DEFAULT_COLUMNS.join() ? null : next);
  };
  return [columns, change] as const;
}

export function ColumnChooser({ columns, onChange }: { columns: ColumnKey[]; onChange: (c: ColumnKey[]) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 />
          <span className="sr-only sm:not-sr-only">Columns</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Show columns</div>
        {ALL_COLUMNS.map((key) => {
          const fixed = FIXED_COLUMNS.includes(key);
          return (
            <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
              <Checkbox checked={columns.includes(key)} disabled={fixed} onCheckedChange={() => onChange(toggleColumn(columns, key))} />
              {COLUMNS[key].label}
            </label>
          );
        })}
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">On narrower screens, some of the usual columns give way.</p>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={() => onChange(DEFAULT_COLUMNS)}
          disabled={columns.join() === DEFAULT_COLUMNS.join()}
          className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Reset to the usual columns
        </button>
      </PopoverContent>
    </Popover>
  );
}
