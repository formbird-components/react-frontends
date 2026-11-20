// Spend, litres or consumption per day, week or month: one series, one axis, the app's primary hue
// (validated against the light and dark card surfaces), a hover readout, and the numbers as a table
// for screen readers.

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@/lib/format';
import { formatNumber } from '@react-frontends/shared/format';
import type { SeriesPoint } from './fuel';

export type Metric = 'spend' | 'litres' | 'consumption';

export const METRICS: Record<Metric, { label: string; title: (bucket: string) => string; format: (v: number) => string; axis: (v: number) => string }> = {
  spend: { label: 'Spend', title: (b) => `Spend per ${b}`, format: (v) => formatMoney(v), axis: (v) => (v >= 1000 ? `$${formatNumber(v / 1000, 1)}K` : `$${formatNumber(v)}`) },
  litres: { label: 'Litres', title: (b) => `Litres per ${b}`, format: (v) => `${formatNumber(v, 1)} L`, axis: (v) => (v >= 1000 ? `${formatNumber(v / 1000, 1)}K` : formatNumber(v)) },
  consumption: { label: 'L/100 km', title: (b) => `Average L/100 km per ${b}`, format: (v) => `${formatNumber(v, 1)} L/100 km`, axis: (v) => formatNumber(v, v % 1 ? 1 : 0) },
};

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

function Readout({ active, payload, metric }: { active?: boolean; payload?: { payload: SeriesPoint }[]; metric: Metric }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const value = point[metric];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-pop">
      <div className="text-sm font-semibold text-foreground tabular">{value === undefined || value === null ? 'No data' : METRICS[metric].format(value)}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
        <span className="h-0.5 w-3 rounded-full bg-primary" />
        {point.label} · {point.receipts} {point.receipts === 1 ? 'receipt' : 'receipts'}
      </div>
    </div>
  );
}

export function FuelChart({ points, metric, bucket }: { points: SeriesPoint[]; metric: Metric; bucket: string }) {
  const m = METRICS[metric];
  const common = {
    data: points,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
    accessibilityLayer: true,
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={18} />
      <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={m.axis} allowDecimals={metric === 'consumption'} />
    </>
  );
  return (
    <figure className="m-0">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {metric === 'consumption' ? (
            <LineChart {...common}>
              {axes}
              <Tooltip cursor={{ stroke: 'var(--input)', strokeWidth: 1 }} content={<Readout metric={metric} />} />
              <Line type="linear" dataKey="consumption" stroke="var(--primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" connectNulls dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          ) : (
            <BarChart {...common}>
              {axes}
              <Tooltip cursor={{ fill: 'var(--accent)' }} content={<Readout metric={metric} />} />
              <Bar dataKey={metric} fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{m.title(bucket)}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{m.label}</th>
            <th scope="col">Receipts</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <th scope="row">{p.label}</th>
              <td>{p[metric] === undefined ? 'No data' : m.format(p[metric] as number)}</td>
              <td>{p.receipts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
