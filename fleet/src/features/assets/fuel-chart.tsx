// Fuel consumption (L/100 km) at each fill, over time: one series, a line with dots.

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, ChartCard, GRID, SERIES, TooltipBox } from '@react-frontends/shared/components';
import { formatMoney } from '@/lib/format';
import { formatNumber } from '@react-frontends/shared/format';
import type { ConsumptionPoint } from './logic';

const day = (time: number) => new Date(time).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

export function ConsumptionChart({ points, average, loading }: { points: ConsumptionPoint[]; average?: number; loading?: boolean }) {
  return (
    <ChartCard
      title="Fuel consumption"
      description={average ? `L/100 km at each fill · average ${formatNumber(average, 1)}` : 'L/100 km at each fill'}
      loading={loading}
      empty={points.length < 2 ? (points.length ? 'One measured fill so far: the chart starts at two.' : 'No measured fills yet: consumption needs two fills with meter readings.') : undefined}
      height={220}
      table={{
        columns: ['Fill', 'Date', 'L/100 km', 'Litres', 'Cost'],
        numeric: [2, 3, 4],
        rows: points.map((p) => [p.ref, day(p.time), formatNumber(p.consumption, 1), formatNumber(p.litres, 1), formatMoney(p.cost)]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={day} {...AXIS} minTickGap={24} padding={{ left: 12, right: 12 }} />
          <YAxis {...AXIS} width={36} domain={[0, 'auto']} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as ConsumptionPoint | undefined) : undefined;
              if (!p) return null;
              return (
                <TooltipBox
                  title={`${p.ref} · ${day(p.time)}`}
                  rows={[
                    { value: `${formatNumber(p.consumption, 1)} L/100 km`, color: SERIES.main },
                    { value: `${formatNumber(p.litres, 1)} L`, label: formatMoney(p.cost) },
                  ]}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="consumption" name="L/100 km" stroke={SERIES.main} strokeWidth={2} dot={{ r: 4, fill: SERIES.main, stroke: 'var(--card)', strokeWidth: 2 }} activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
