// A work order's parts, labour and other costs, line by line, with the totals and GST the server
// will store (lineTotals). Parts come from the materials list, with their stock and unit cost.

import { Command } from 'cmdk';
import { Clock, Package, Plus, Receipt, Search, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NumberInput } from '@react-frontends/shared/components';
import { Badge, Button, Input, Popover, PopoverContent, PopoverTrigger, Tip } from '@react-frontends/shared/ui';
import { useSearch } from '@/data/records';
import { lineTotals } from '@/domain/logic/money';
import { GST, LABOUR_RATE } from '@/domain/model';
import type { Material } from '@/domain/types';
import { newId } from '@react-frontends/shared/api';
import { contains, term, terms } from '@react-frontends/shared/es';
import { fleetQuery } from '@/lib/es';
import { formatMoney } from '@/lib/format';
import { formatNumber } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { addMaterial, labourLine, lineAmount, otherLine, removeLine, stockWarnings, updateLine, type Line } from './lines';

const KIND = {
  part: { icon: Package, label: 'Part', tone: 'bg-info/12 text-info' },
  labour: { icon: Clock, label: 'Labour', tone: 'bg-primary-soft text-primary' },
  other: { icon: Receipt, label: 'Other', tone: 'bg-muted text-muted-foreground' },
} as const;

const MATERIAL_FIELDS = ['documentId', 'nameId', 'partNo', 'unit', 'unitCost', 'qtyAvailable', 'reorderThreshold', 'reorderBool', 'storeLocationRel'];

function MaterialPicker({ onPick }: { onPick: (m: Material) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const request = useMemo(
    () => fleetQuery('material', { filter: [contains(['nameId', 'partNo'], query)], mustNot: [term('inactiveBool', true)], sort: [{ indexNum: 'asc' }, { 'systemHeader.summaryName': 'asc' }] }),
    [query],
  );
  const { data, isFetching } = useSearch<Material>('material', open ? request : null, { size: 30, include: MATERIAL_FIELDS });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Package />
          Add part
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input value={query} onValueChange={setQuery} placeholder="Search parts by name or part number" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1">
            {!data?.documents.length && <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{isFetching ? 'Searching…' : 'No parts match.'}</Command.Empty>}
            {data?.documents.map((m) => {
              const stock = Number(m.qtyAvailable ?? 0);
              const low = stock <= Number(m.reorderThreshold ?? 0);
              return (
                <Command.Item
                  key={m.documentId}
                  value={m.documentId}
                  onSelect={() => {
                    onPick(m);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm outline-none select-none data-[selected=true]:bg-accent"
                >
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', KIND.part.tone)}>
                    <Package className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.nameId}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.partNo} · {formatMoney(m.unitCost)} / {m.unit ?? 'ea'}
                    </div>
                  </div>
                  <Badge tone={stock <= 0 ? 'danger' : low ? 'warning' : 'neutral'} className="tabular">
                    {stock <= 0 ? 'Out of stock' : `${formatNumber(stock)} ${m.unit ?? ''} in stock`}
                  </Badge>
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function KindIcon({ kind }: { kind: Line['kind'] }) {
  const k = KIND[kind] ?? KIND.other;
  return (
    <Tip content={k.label}>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', k.tone)}>
        <k.icon className="size-4" />
      </span>
    </Tip>
  );
}

/** The totals under the lines: parts, labour, other, GST and the total. */
export function LineTotals({ lines, className }: { lines: Line[]; className?: string }) {
  const t = lineTotals(lines, GST);
  const row = (label: string, value: number, extra?: string) => (
    <div className="flex justify-between gap-6 text-sm">
      <dt className="text-muted-foreground">
        {label}
        {extra && <span className="ml-1 text-xs">{extra}</span>}
      </dt>
      <dd className="tabular">{formatMoney(value)}</dd>
    </div>
  );
  return (
    <dl className={cn('grid gap-1.5', className)}>
      {row('Parts', t.parts)}
      {row('Labour', t.labour, t.labourHours ? `(${t.labourHours.toLocaleString('en-AU', { maximumFractionDigits: 2 })} h)` : undefined)}
      {t.other !== 0 && row('Other', t.other)}
      {row(`GST ${Math.round(GST * 100)}%`, t.tax)}
      <div className="mt-1 flex justify-between gap-6 border-t border-border pt-2 text-[15px] font-semibold">
        <dt>Total</dt>
        <dd className="tabular">{formatMoney(t.total)}</dd>
      </div>
    </dl>
  );
}

export function LineItemsEditor({ lines, onChange, readOnly, problems = [] }: { lines: Line[]; onChange?: (update: (lines: Line[]) => Line[]) => void; readOnly?: boolean; problems?: string[] }) {
  const ids = useMemo(() => [...new Set(lines.flatMap((l) => (l.kind === 'part' && l.materialRel?.[0]?.documentId ? [l.materialRel[0].documentId] : [])))].sort(), [lines]);
  const stockRequest = useMemo(() => (ids.length ? fleetQuery('material', { filter: [terms('documentId', ids)] }) : null), [ids]);
  const stock = useSearch<Material>('material', readOnly ? null : stockRequest, { size: 100, include: MATERIAL_FIELDS });
  const warnings = useMemo(
    () => stockWarnings(lines, Object.fromEntries((stock.data?.documents ?? []).map((m) => [m.documentId, { qty: m.qtyAvailable, unit: m.unit }]))),
    [lines, stock.data],
  );
  const change = (fn: (lines: Line[]) => Line[]) => onChange?.(fn);

  if (readOnly && !lines.length) return <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No parts or labour recorded.</div>;

  return (
    <div className="grid gap-4">
      {lines.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_6.5rem_2.25rem] gap-3 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit cost</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {lines.map((line, i) => {
              const part = line.materialRel?.[0];
              const warning = warnings[line.id];
              return (
                <li key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_6.5rem_2.25rem] sm:items-center">
                  <div className="col-span-1 flex min-w-0 items-center gap-2.5">
                    <KindIcon kind={line.kind} />
                    <div className="min-w-0 flex-1">
                      {readOnly || part ? (
                        <div className="truncate text-sm font-medium">{line.description || <span className="text-muted-foreground">No description</span>}</div>
                      ) : (
                        <Input
                          value={line.description}
                          onChange={(e) => change((ls) => updateLine(ls, line.id, { description: e.target.value }))}
                          placeholder={line.kind === 'labour' ? 'What was done' : 'Describe the cost'}
                          aria-label={`Line ${i + 1} description`}
                          aria-invalid={!String(line.description ?? '').trim() || undefined}
                          className="h-8"
                        />
                      )}
                      {(part?.partNo || warning) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {part?.partNo && <span className="tabular">{part.partNo}</span>}
                          {warning && (
                            <span className="inline-flex items-center gap-1 font-medium text-[color-mix(in_oklab,var(--warning)_75%,var(--foreground))]">
                              <TriangleAlert className="size-3" />
                              {warning}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium tabular sm:order-4">{formatMoney(lineAmount(line))}</div>
                  <div className="col-span-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:contents">
                    {readOnly ? (
                      <>
                        <span className="text-sm text-muted-foreground tabular sm:order-2 sm:text-right">
                          {formatNumber(line.qty, Number(line.qty) % 1 ? 2 : 0)} {line.unit}
                        </span>
                        <span className="text-sm text-muted-foreground tabular sm:order-3 sm:text-right">{formatMoney(line.unitCost)}</span>
                        <span className="sm:order-5" />
                      </>
                    ) : (
                      <>
                        <NumberInput
                          value={line.qty}
                          onValueChange={(v) => change((ls) => updateLine(ls, line.id, { qty: v as number }))}
                          suffix={line.unit}
                          aria-label={`Line ${i + 1} quantity`}
                          aria-invalid={!(Number(line.qty) > 0) || undefined}
                          className="sm:order-2"
                          inputClassName="h-8 text-right"
                        />
                        <NumberInput
                          value={line.unitCost}
                          onValueChange={(v) => change((ls) => updateLine(ls, line.id, { unitCost: v as number }))}
                          prefix="$"
                          aria-label={`Line ${i + 1} unit cost`}
                          className="sm:order-3"
                          inputClassName="h-8 text-right"
                        />
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-danger sm:order-5" aria-label={`Remove line ${i + 1}`} onClick={() => change((ls) => removeLine(ls, line.id))}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No parts or labour yet. Add what was used and the time spent.</div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <MaterialPicker onPick={(m) => change((ls) => addMaterial(ls, m, newId()))} />
            <Button variant="outline" size="sm" onClick={() => change((ls) => [...ls, labourLine(newId())])}>
              <Clock />
              Add labour
              <span className="text-xs text-muted-foreground">{formatMoney(LABOUR_RATE, 0)}/h</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => change((ls) => [...ls, otherLine(newId())])}>
              <Plus />
              Other cost
            </Button>
          </div>
        ) : (
          <span />
        )}
        <LineTotals lines={lines} className="w-full sm:ml-auto sm:max-w-64" />
      </div>
      {problems.length > 0 && <div className="text-xs font-medium text-danger">{problems[0]}</div>}
    </div>
  );
}
