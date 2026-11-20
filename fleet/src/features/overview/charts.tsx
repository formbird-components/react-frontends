// The overview's charts: bookings per day (the last two weeks and the next), fuel spend per week,
// and utilisation by kind of asset. Each is one series in the primary colour (a lighter step for
// what is still to come or partial), with a tooltip and a table twin.

import { Bar, BarChart, CartesianGrid, LabelList, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from 'recharts';
import { AXIS, ChartCard, GRID, SERIES, TooltipBox } from '@react-frontends/shared/components';
import { addDays } from '@/domain/logic/time';
import { formatMoney } from '@/lib/format';
import { formatNumber } from '@react-frontends/shared/format';
import { KIND_LABELS, type DayCount, type Utilisation, type WeekSpend } from './stats';

const dayLong = (time: number) => new Date(time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const dayShort = (time: number) => new Date(time).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** A bar whose colour depends on its datum (past or upcoming, full or partial week). */
const shapeBy = (fill: (payload: unknown) => string) => (props: BarShapeProps) => <Rectangle {...props} fill={fill(props.payload)} />;

const compactMoney = (value: number) => (value >= 1000 ? `$${formatNumber(value / 1000, value >= 10_000 ? 0 : 1)}k` : `$${formatNumber(value)}`);

export function BookingsPerDayChart({ days, loading, error }: { days: DayCount[]; loading: boolean; error: unknown }) {
  const past = days.filter((d) => d.when !== 'future').reduce((s, d) => s + d.count, 0);
  const ahead = days.filter((d) => d.when === 'future').reduce((s, d) => s + d.count, 0);
  // Every fourth day, counted from today, so "Today" always has its label.
  const todayIndex = Math.max(0, days.findIndex((d) => d.when === 'today'));
  const todayTick = days[todayIndex]?.day;
  const ticks = days.filter((_, i) => (i - todayIndex) % 4 === 0).map((d) => d.day);
  return (
    <ChartCard
      title="Bookings per day"
      description={loading ? 'Bookings by start day' : `${past} in the last 14 days · ${ahead} in the next 7`}
      legend={[
        { label: 'Last 14 days', color: SERIES.main },
        { label: 'Next 7 days', color: SERIES.soft },
      ]}
      loading={loading}
      error={error}
      height={200}
      table={{ columns: ['Day', 'Bookings'], numeric: [1], rows: days.map((d) => [d.when === 'today' ? `Today (${dayShort(d.day)})` : dayLong(d.day), d.count]) }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 6, right: 4, bottom: 0, left: -12 }} barCategoryGap="22%" accessibilityLayer>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="day" {...AXIS} ticks={ticks} interval={0} tickFormatter={(t: number) => (t === todayTick ? 'Today' : dayShort(t))} />
          <YAxis {...AXIS} allowDecimals={false} width={36} />
          <Tooltip
            cursor={{ fill: 'var(--accent)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as DayCount | undefined) : undefined;
              if (!d) return null;
              return <TooltipBox title={d.when === 'today' ? `Today, ${dayShort(d.day)}` : dayLong(d.day)} rows={[{ value: d.count, label: d.count === 1 ? 'booking' : 'bookings', color: d.when === 'future' ? SERIES.soft : SERIES.main }]} />;
            }}
          />
          <Bar dataKey="count" name="Bookings" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} shape={shapeBy((p) => ((p as DayCount).when === 'future' ? SERIES.soft : SERIES.main))} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function FuelSpendChart({ weeks, loading, error }: { weeks: WeekSpend[]; loading: boolean; error: unknown }) {
  const total = weeks.reduce((s, w) => s + w.cost, 0);
  const thisWeek = weeks[weeks.length - 1]?.week;
  const isThisWeek = (w: WeekSpend) => w.week === thisWeek;
  return (
    <ChartCard
      title="Fuel spend by week"
      description={loading ? 'Fuel receipts, Monday to Sunday' : `${formatMoney(total, 0)} over ${weeks.length} weeks`}
      legend={[
        { label: 'Week', color: SERIES.main },
        { label: 'This week so far', color: SERIES.soft },
      ]}
      loading={loading}
      error={error}
      empty={!loading && !error && total === 0 ? 'No fuel receipts in these weeks.' : undefined}
      height={200}
      table={{
        columns: ['Week of', 'Spend', 'Litres', 'Receipts'],
        numeric: [1, 2, 3],
        rows: weeks.map((w) => [`${dayShort(w.week)}${isThisWeek(w) ? ' (so far)' : ''}`, formatMoney(w.cost), formatNumber(w.litres, 1), w.count]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} margin={{ top: 6, right: 4, bottom: 0, left: -6 }} barCategoryGap="24%" accessibilityLayer>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="week" {...AXIS} ticks={weeks.filter((_, i) => (weeks.length - 1 - i) % 3 === 0).map((w) => w.week)} interval={0} tickFormatter={(t: number) => dayShort(t)} />
          <YAxis {...AXIS} width={42} tickFormatter={compactMoney} />
          <Tooltip
            cursor={{ fill: 'var(--accent)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const w = active ? (payload?.[0]?.payload as WeekSpend | undefined) : undefined;
              if (!w) return null;
              return (
                <TooltipBox
                  title={`Week of ${dayShort(w.week)}${isThisWeek(w) ? ' (so far)' : ''}`}
                  rows={[
                    { value: formatMoney(w.cost), label: 'spent', color: isThisWeek(w) ? SERIES.soft : SERIES.main },
                    { value: `${formatNumber(w.litres, 1)} L`, label: `${w.count} ${w.count === 1 ? 'receipt' : 'receipts'}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="cost" name="Spend" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} shape={shapeBy((p) => (isThisWeek(p as WeekSpend) ? SERIES.soft : SERIES.main))} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function UtilisationChart({ rows, loading, error, today }: { rows: Utilisation[]; loading: boolean; error: unknown; today: number }) {
  const hours = rows.reduce((s, r) => s + r.hours, 0);
  const available = rows.reduce((s, r) => s + r.available, 0);
  const data = rows.map((r) => ({ ...r, label: KIND_LABELS[r.kind] ?? r.kind, pct: Math.round(r.share * 100) }));
  const height = Math.max(160, data.length * 30 + 16);
  return (
    <ChartCard
      title="Utilisation"
      description={
        loading ? 'Business hours on hire' : `Weekday hours on hire since ${dayShort(addDays(today, -13))}${available ? ` · fleet ${Math.round((hours / available) * 100)}%` : ''}`
      }
      loading={loading}
      error={error}
      empty={!loading && !error && !data.length ? 'No hireable assets.' : undefined}
      height={height}
      table={{
        columns: ['Kind', 'Assets', 'Hours on hire', 'Utilisation'],
        numeric: [1, 2, 3],
        rows: data.map((r) => [r.label, r.assets, formatNumber(r.hours, 1), `${r.pct}%`]),
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap="28%" accessibilityLayer>
          <CartesianGrid {...GRID} horizontal={false} vertical />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="label" {...AXIS} width={108} tick={{ ...AXIS.tick, fontSize: 12, fill: 'var(--foreground)' }} />
          <Tooltip
            cursor={{ fill: 'var(--accent)', opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!r) return null;
              return (
                <TooltipBox
                  title={`${r.label} · ${r.assets} ${r.assets === 1 ? 'asset' : 'assets'}`}
                  rows={[
                    { value: `${r.pct}%`, label: 'of business hours on hire', color: SERIES.main },
                    { value: `${formatNumber(r.hours, 1)} h`, label: `of ${formatNumber(r.available)} h available` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="pct" name="Utilisation" fill={SERIES.main} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} background={{ fill: 'var(--muted)', radius: 4 }}>
            <LabelList dataKey="pct" position="right" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11, fill: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
