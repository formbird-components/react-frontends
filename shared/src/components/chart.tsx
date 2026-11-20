// Chart chrome in the app's style: a card with a title, a legend and a chart/table switch (every
// chart has a table twin), a tooltip box, and the axis and grid look for Recharts.

import { BarChart3, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../utils';
import { Alert, EmptyState } from './page';
import { Card, CardDescription, CardTitle, Skeleton } from '../ui';

/** Axis ticks: small, muted, no lines (Recharts XAxis/YAxis props). */
export const AXIS = { tick: { fontSize: 11, fill: 'var(--muted-foreground)' }, axisLine: false, tickLine: false } as const;
/** Gridlines: horizontal hairlines (Recharts CartesianGrid props). */
export const GRID = { vertical: false, stroke: 'var(--border)', strokeDasharray: undefined } as const;

/**
 * The primary colour, and a lighter step of it (for "upcoming", "so far"). The step is chosen per
 * theme (ChartCard sets --series-soft): on the dark card it needs more of the hue to stay visible.
 */
export const SERIES = { main: 'var(--primary)', soft: 'var(--series-soft, color-mix(in oklab, var(--primary) 38%, var(--card)))' } as const;
const SERIES_VARS = '[--series-soft:color-mix(in_oklab,var(--primary)_38%,var(--card))] dark:[--series-soft:color-mix(in_oklab,var(--primary)_58%,var(--card))]';

export interface LegendItem {
  label: string;
  color: string;
  /** A line key (for line series) instead of a square. */
  line?: boolean;
}

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={item.line ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]'} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A tooltip's box: a heading, then values (strong) with their labels. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: { value: ReactNode; label?: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-36 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-medium text-muted-foreground">{title}</div>
      <div className="grid gap-0.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            {row.color && <span aria-hidden className="h-0.5 w-2.5 rounded-full" style={{ background: row.color }} />}
            <span className="font-semibold text-foreground tabular">{row.value}</span>
            {row.label && <span className="text-muted-foreground">{row.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ChartTable {
  columns: string[];
  rows: ReactNode[][];
  /** Columns (by index) holding numbers: right-aligned. */
  numeric?: number[];
}

/**
 * A chart in a card. `height` is the chart's own height (axes included); the table view takes the
 * same space and scrolls.
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  height = 220,
  loading,
  error,
  empty,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  legend?: LegendItem[];
  table?: ChartTable;
  height?: number;
  loading?: boolean;
  error?: unknown;
  /** Shown instead of the chart when there's nothing to plot. */
  empty?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const toggle = 'inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm [&_svg]:size-3.5';
  return (
    <Card className={cn('flex flex-col', SERIES_VARS, className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table && (
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Show as">
              <button type="button" className={toggle} aria-pressed={view === 'chart'} aria-label="Chart" title="Chart" onClick={() => setView('chart')}>
                <BarChart3 />
              </button>
              <button type="button" className={toggle} aria-pressed={view === 'table'} aria-label="Table" title="Table" onClick={() => setView('table')}>
                <Table2 />
              </button>
            </div>
          )}
        </div>
      </div>
      {legend && legend.length > 1 && view === 'chart' && <ChartLegend items={legend} className="px-5 pt-2" />}
      <div className="flex flex-1 flex-col px-3 pt-3 pb-4" style={{ minHeight: height }}>
        {loading ? (
          <Skeleton className="mx-2 rounded-lg" style={{ height: height - 8 }} />
        ) : error ? (
          <Alert className="mx-2">{error instanceof Error ? error.message : "Couldn't load this chart."}</Alert>
        ) : empty ? (
          <div className="flex items-center justify-center" style={{ height }}>
            {typeof empty === 'string' ? <EmptyState className="py-0" icon={BarChart3} title={empty} /> : empty}
          </div>
        ) : view === 'table' && table ? (
          <div className="overflow-y-auto px-2" style={{ height }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {table.columns.map((c, i) => (
                    <th key={c} className={cn('py-2 text-xs font-medium text-muted-foreground', table.numeric?.includes(i) ? 'text-right' : 'text-left')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b border-border last:border-0">
                    {row.map((cell, i) => (
                      <td key={i} className={cn('py-1.5', table.numeric?.includes(i) && 'text-right tabular')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Grows with the card (charts side by side end level), never below `height`.
          <div className="relative flex-1" style={{ minHeight: height }}>
            <div className="absolute inset-0">{children}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
