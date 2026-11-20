// The overview, the home page for Administrators and Asset Managers: the fleet at a glance (live
// counts that open the matching lists), today's pickups and returns, what needs attention, charts
// of bookings, fuel and utilisation, the fleet map and the workshop queue. It refreshes every two
// minutes while open.

import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CalendarRange, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Page, PageHeader } from '@react-frontends/shared/components';
import { Button, Tip } from '@react-frontends/shared/ui';
import { useSearch } from '@/data/records';
import { useSession } from '@/data/session';
import { addDays } from '@/domain/logic/time';
import type { Asset, Booking, FuelReceipt, WorkshopRequest } from '@/domain/types';
import { api } from '@react-frontends/shared/api';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { BookingsPerDayChart, FuelSpendChart, UtilisationChart } from './charts';
import { useAutoRefresh, useNow, useToday } from './hooks';
import { AttentionPanel, FleetMapCard, KpiTiles, TodayPanel, WorkshopQueue } from './panels';
import { assetWarningsRequest, chartBookingsRequest, countRequests, fuelRequest, HIRE_OVERDUE, HIREABLE_ASSETS, OPEN_REQUESTS, todayBookingsRequest, URGENT_REQUESTS, type CountKey } from './queries';
import { attentionItems, bookingsPerDay, fuelByWeek, greeting, utilisationByKind, weekStart } from './stats';

const BOOKING_FIELDS = ['documentId', 'bookingRef', 'bookingStatusRel', 'assetRel.assetId', 'assetRel.iconKind', 'assetRel.documentId', 'requestedByRel', 'bookingReasonRel', 'startDate', 'endDate'];
const REQUEST_FIELDS = [
  'documentId', 'requestRef', 'requestStatusRel', 'priorityRel', 'requestTypeRel', 'assetRel.assetId', 'assetRel.iconKind', 'assignedToRel', 'expectedStartDate', 'createdDate', 'systemHeader.createdDate',
];
const WARNING_FIELDS = ['documentId', 'assetId', 'registration', 'iconKind', 'regDueDate', 'insuranceDueDate', 'serviceWarning', 'serviceDueDate', 'serviceDueMeterNum', 'meterReadingNum', 'primaryMeterUnit', 'servicePlanRel.name'];

const CHART_DAYS_BACK = 13;
const CHART_DAYS_AHEAD = 7;
const FUEL_WEEKS = 12;

/** The tiles' counts: one search each (size 0), sharing the cache key shape of useSearch. */
function useCounts(today: number) {
  const defs = useMemo(() => Object.entries(countRequests(today)) as [CountKey, ReturnType<typeof countRequests>[CountKey]][], [today]);
  const results = useQueries({
    queries: defs.map(([, { kind, request }]) => ({
      queryKey: ['search', kind, request, { size: 0 }],
      queryFn: () => api.search(request, { size: 0 }),
      placeholderData: keepPreviousData,
    })),
  });
  const counts: Partial<Record<CountKey, number>> = {};
  defs.forEach(([key], i) => {
    if (results[i].data) counts[key] = results[i].data.total;
  });
  return {
    counts,
    loading: results.some((r) => r.isPending),
    fetching: results.some((r) => r.isFetching),
    updatedAt: Math.max(0, ...results.map((r) => r.dataUpdatedAt)),
  };
}

export function OverviewPage() {
  const { account } = useSession();
  const today = useToday();
  const now = useNow(60_000);
  useAutoRefresh(120_000);
  const client = useQueryClient();

  const tiles = useCounts(today);
  const todays = useSearch<Booking>('booking', useMemo(() => todayBookingsRequest(today), [today]), { size: 200, include: BOOKING_FIELDS });
  const overdue = useSearch<Booking>('booking', HIRE_OVERDUE, { size: 50, include: [...BOOKING_FIELDS, 'requestedByRel.name'] });
  const warnings = useSearch<Asset>('asset', useMemo(() => assetWarningsRequest(today), [today]), { size: 200, include: WARNING_FIELDS });
  const urgent = useSearch<WorkshopRequest>('request', URGENT_REQUESTS, { size: 50, include: REQUEST_FIELDS });
  const open = useSearch<WorkshopRequest>('request', OPEN_REQUESTS, { size: 500, include: REQUEST_FIELDS });
  const chartBookings = useSearch<Booking>('booking', useMemo(() => chartBookingsRequest(today, CHART_DAYS_BACK, CHART_DAYS_AHEAD), [today]), {
    size: 5000,
    include: ['startDate', 'endDate', 'commencedDate', 'closedDate', 'bookingStatusRel.name', 'assetRel.iconKind'],
  });
  const hireable = useSearch<Asset>('asset', HIREABLE_ASSETS, { size: 2000, include: ['iconKind'] });
  const fuelFrom = addDays(weekStart(today), -7 * (FUEL_WEEKS - 1));
  const fuel = useSearch<FuelReceipt>('fuelReceipt', useMemo(() => fuelRequest(fuelFrom), [fuelFrom]), { size: 5000, include: ['fuelDate', 'costNum', 'litresNum'] });

  const attention = useMemo(
    () => attentionItems({ overdueBookings: overdue.data?.documents ?? [], assets: warnings.data?.documents ?? [], urgentRequests: urgent.data?.documents ?? [] }, now),
    [overdue.data, warnings.data, urgent.data, now],
  );
  const days = useMemo(() => bookingsPerDay(chartBookings.data?.documents ?? [], { from: addDays(today, -CHART_DAYS_BACK), days: CHART_DAYS_BACK + 1 + CHART_DAYS_AHEAD, now }), [chartBookings.data, today, now]);
  const weeks = useMemo(() => fuelByWeek(fuel.data?.documents ?? [], { weeks: FUEL_WEEKS, now }), [fuel.data, now]);
  const utilisation = useMemo(
    () => utilisationByKind(chartBookings.data?.documents ?? [], hireable.data?.documents ?? [], { from: addDays(today, -CHART_DAYS_BACK), to: now, now }),
    [chartBookings.data, hireable.data, today, now],
  );

  const firstName = account?.usersName?.firstName ?? account?.systemHeader?.summaryName?.split(' ')[0] ?? '';
  const refresh = () => void client.invalidateQueries({ queryKey: ['search'] });

  return (
    <Page wide>
      <PageHeader
        eyebrow={new Date(now).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ''}`}
        description="The fleet right now, and what needs a hand."
        actions={
          <>
            {tiles.updatedAt > 0 && (
              <span className="hidden text-xs text-muted-foreground md:inline" title={formatDateTime(tiles.updatedAt)}>
                Updated {relative(tiles.updatedAt, now)}
              </span>
            )}
            <Tip content="Refresh">
              <Button variant="ghost" size="icon-sm" onClick={refresh} aria-label="Refresh">
                <RefreshCw className={cn(tiles.fetching && 'animate-spin')} />
              </Button>
            </Tip>
            <Button variant="outline" asChild>
              <Link to="/bookings">
                <CalendarRange />
                Bookings
              </Link>
            </Button>
            <Button asChild>
              <Link to="/bookings/new">
                <CalendarPlus />
                New booking
              </Link>
            </Button>
          </>
        }
      />

      <KpiTiles counts={tiles.counts} loading={tiles.loading} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <TodayPanel bookings={todays.data?.documents ?? []} today={today} now={now} loading={todays.isPending} error={todays.error} />
        <AttentionPanel items={attention} loading={overdue.isPending || warnings.isPending || urgent.isPending} error={overdue.error ?? warnings.error ?? urgent.error} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BookingsPerDayChart days={days} loading={chartBookings.isPending} error={chartBookings.error} />
        <FuelSpendChart weeks={weeks} loading={fuel.isPending} error={fuel.error} />
        <UtilisationChart rows={utilisation} loading={chartBookings.isPending || hireable.isPending} error={chartBookings.error ?? hireable.error} today={today} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <FleetMapCard />
        <WorkshopQueue requests={open.data?.documents ?? []} total={open.data?.total ?? 0} loading={open.isPending} error={open.error} now={now} />
      </div>
    </Page>
  );
}
