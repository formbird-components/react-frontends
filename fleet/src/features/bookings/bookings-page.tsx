// /bookings: the booking calendar (a timeline of assets by location, day or week) or the list of
// bookings, with filters. What is shown lives in the URL (?view, mode, date, filters, the booking
// open in the side sheet), so back and forward work and a view can be shared.

import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, RefreshCw, Search, SlidersHorizontal, Wrench, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Alert, EmptyState, Page, PageHeader } from '@react-frontends/shared/components';
import { Badge, Button, Card, Input, Popover, PopoverContent, PopoverTrigger, Segmented, Select, Switch, Tip } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useSession } from '@/data/session';
import { shiftAnchor, windowFor, type CalendarView } from '@/domain/logic/calendar';
import { addDays, dayLabel, fromInputs, toDateInput } from '@/domain/logic/time';
import { formatDateTime } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { AssetDay } from './asset-day';
import { BookingSheet } from './booking-detail';
import { BookingList } from './booking-list';
import { useBookableRows, useItems, usePrefetchPeriods } from './data';
import { useNow, useWide } from './hooks';
import { isListTab, type ListScope, type ListTab } from './lists';
import { filterRows, groupRows, itemsByAsset as byAsset, legendOf, optionsOf, type Item, type Row, type RowFilters } from './model';
import { BLOCK_STRIPES, OVERDUE_STRIPES } from './parts';
import { Timeline } from './timeline';

type View = 'calendar' | 'list';

const iso = (t: number) => new Date(t).toISOString();

/** The page's state in the URL. */
function useBookingsParams() {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (patch: Record<string, string | null | undefined>, o: { push?: boolean } = {}) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: !o.push, preventScrollReset: true },
      ),
    [setParams],
  );
  return { params, set };
}

export function BookingsPage() {
  const { params, set } = useBookingsParams();
  const { who, account } = useSession();
  const navigate = useNavigate();
  const wide = useWide();
  const now = useNow();

  const view: View = params.get('view') === 'list' ? 'list' : params.get('view') === 'calendar' ? 'calendar' : wide ? 'calendar' : 'list';
  const mode: CalendarView = params.get('mode') === 'week' && wide ? 'week' : 'day';
  const dateParam = params.get('date');
  const anchor = (dateParam && fromInputs(dateParam, '12:00') ? new Date(fromInputs(dateParam, '12:00')!).getTime() : undefined) ?? now;
  const window = useMemo(() => windowFor(mode, anchor), [mode, anchor]);
  const tab: ListTab = isListTab(params.get('tab')) ? (params.get('tab') as ListTab) : 'upcoming';
  const mine = params.has('mine') ? params.get('mine') === '1' : !who.isManager;
  const filters: RowFilters = { text: params.get('q') ?? '', pool: params.get('pool') ?? '', type: params.get('type') ?? '', location: params.get('loc') ?? '', onlyAvailable: params.get('free') === '1' };
  const openId = params.get('booking');

  // Rows and bars. Bars load by week (a day view pages within it without loading), and the next
  // and previous weeks load ahead.
  const assets = useBookableRows();
  const week = useMemo(() => windowFor('week', anchor), [anchor]);
  const items = useItems(view === 'calendar' ? week : null, now);
  usePrefetchPeriods(view === 'calendar' ? [windowFor('week', addDays(week.start, 7)), windowFor('week', addDays(week.start, -1))] : []);
  const itemsByAsset = useMemo(() => byAsset(items.items), [items.items]);
  const at = now >= window.start && now < window.end ? now : window.start;
  const rows = useMemo(() => filterRows(assets.rows, filters, itemsByAsset, at), [assets.rows, filters.text, filters.pool, filters.type, filters.location, filters.onlyAvailable, itemsByAsset, at]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const legend = useMemo(() => legendOf(items.items.filter((i) => i.start < window.end && i.drawEnd > window.start)), [items.items, window]);

  const pools = useLookup('pool');
  const poolOptions = useMemo(() => {
    const mineIds = (account?.poolsRel ?? []).map((p) => p.documentId);
    return (pools.data ?? []).filter((p) => who.isManager || mineIds.includes(p.documentId)).map((p) => ({ value: p.documentId, label: p.name }));
  }, [pools.data, account, who.isManager]);
  const typeOptions = useMemo(() => optionsOf(assets.rows, (r) => [r.typeId, r.typeName]), [assets.rows]);
  const locationOptions = useMemo(() => optionsOf(assets.rows, (r) => [r.locationId || 'No location', r.location]), [assets.rows]);
  const filtering = !!(filters.text || filters.pool || filters.type || filters.location || filters.onlyAvailable);
  const assetFilterOn = !!(filters.pool || filters.type || filters.location || filters.text);

  const listScope = useMemo<ListScope>(
    () => ({ personId: mine ? who.userId : undefined, assetIds: assetFilterOn ? filterRows(assets.rows, { ...filters, onlyAvailable: false }, itemsByAsset, at).map((r) => r.documentId) : undefined }),
    [mine, who.userId, assetFilterOn, assets.rows, filters.text, filters.pool, filters.type, filters.location],
  );

  const open = useCallback(
    (item: Item) => {
      if (item.kind === 'booking') return set({ booking: item.id }, { push: true });
      if (who.isWorkshop || who.isManager) return navigate(`/workshop/requests/${item.id}`);
      toast(`${item.ref}: in the workshop`, { description: `${item.status}, ${item.openEnded ? 'until further notice' : `until ${formatDateTime(item.end)}`}.`, icon: <Wrench className="size-4" /> });
    },
    [set, navigate, who.isWorkshop, who.isManager],
  );
  const book = useCallback((row: Row, start: number, end: number) => navigate(`/bookings/new?asset=${row.documentId}&start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(end))}`), [navigate]);
  const setDate = (t: number) => set({ date: toDateInput(t) === toDateInput(now) ? null : toDateInput(t) });
  const clearFilters = () => set({ q: null, pool: null, type: null, loc: null, free: null });

  return (
    <Page wide className="pb-10">
      <PageHeader
        title="Bookings"
        description={view === 'calendar' ? (wide ? 'Drag across free time on an asset to book it. Click a booking to see it.' : 'Choose an asset, then tap free time to book it.') : who.isManager ? 'Every booking, by when it happens.' : 'Your bookings and everyone else’s, by when they happen.'}
        className="pb-5"
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => set({ view: v })}
              options={[
                { value: 'calendar', label: <><CalendarDays /> Calendar</> },
                { value: 'list', label: <><List /> List</> },
              ]}
            />
            <Button asChild>
              <Link to="/bookings/new">
                <CalendarPlus />
                New booking
              </Link>
            </Button>
          </>
        }
      />

      {assets.error && (
        <Alert className="mb-4">
          {(assets.error as Error).message}{' '}
          <button type="button" className="cursor-pointer font-medium underline" onClick={() => void assets.refetch()}>
            Try again
          </button>
        </Alert>
      )}

      {view === 'calendar' ? (
        <Card className="overflow-hidden">
          <Toolbar
            mode={mode}
            onMode={(m) => set({ mode: m === 'day' ? null : m })}
            window={window}
            now={now}
            wide={wide}
            onShift={(d) => setDate(shiftAnchor(mode, anchor, d))}
            onToday={() => set({ date: null })}
            onDate={(d) => setDate(d)}
            filters={filters}
            onFilters={(patch) => set(patch)}
            onClear={clearFilters}
            filtering={filtering}
            poolOptions={poolOptions}
            allPoolsLabel={who.isManager ? 'All pools' : 'All my pools'}
            typeOptions={typeOptions}
            locationOptions={locationOptions}
            fetching={items.isFetching || assets.isFetching}
            onRefresh={() => {
              void assets.refetch();
              void items.refetch();
            }}
          />
          {items.error && (
            <div className="border-b border-border px-4 py-3">
              <Alert>
                Bookings couldn’t be loaded: {(items.error as Error).message}{' '}
                <button type="button" className="cursor-pointer font-medium underline" onClick={() => void items.refetch()}>
                  Try again
                </button>
              </Alert>
            </div>
          )}
          {!assets.isLoading && !assets.rows.length && !assets.error ? (
            <EmptyState icon={CalendarDays} title="No assets to book" className="py-16">
              {who.isManager ? 'No asset is Active and bookable yet.' : 'You aren’t in a vehicle hire pool that has bookable assets. Ask the fleet team to add you to one.'}
            </EmptyState>
          ) : !assets.isLoading && !rows.length ? (
            <EmptyState
              icon={Search}
              title="No assets match"
              className="py-16"
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            >
              {filters.onlyAvailable ? 'No asset is free then with these filters.' : 'Try another search or filter.'}
            </EmptyState>
          ) : wide ? (
            <Timeline
              view={mode}
              window={window}
              now={now}
              groups={groups}
              itemsByAsset={itemsByAsset}
              loading={assets.isLoading}
              refreshing={items.isFetching}
              openId={openId ?? undefined}
              myId={who.userId}
              onOpen={open}
              onBook={book}
            />
          ) : (
            <AssetDay
              rows={rows}
              itemsByAsset={itemsByAsset}
              window={window}
              now={now}
              assetId={params.get('asset')}
              onAsset={(id) => set({ asset: id })}
              onOpen={open}
              onBook={book}
              myId={who.userId}
              loading={assets.isLoading}
            />
          )}
          {wide && <Legend statuses={legend} />}
        </Card>
      ) : (
        <BookingList
          tab={tab}
          onTab={(t) => set({ tab: t === 'upcoming' ? null : t })}
          mine={mine}
          onMine={(m) => set({ mine: m === !who.isManager ? null : m ? '1' : '0' })}
          scope={listScope}
          filtered={assetFilterOn}
          now={now}
          openId={openId ?? undefined}
          onOpen={(id) => set({ booking: id }, { push: true })}
        />
      )}

      <BookingSheet id={openId} onClose={() => set({ booking: null })} />
    </Page>
  );
}

function Legend({ statuses }: { statuses: { name: string; color?: string }[] }) {
  const swatch = 'inline-block h-3 w-5 rounded-[3px]';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
      {statuses.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span className={swatch} style={{ background: `color-mix(in oklab, ${s.color ?? 'var(--primary)'} 22%, var(--card))`, boxShadow: `inset 3px 0 0 ${s.color ?? 'var(--primary)'}` }} />
          {s.name}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className={cn(swatch, 'ring-1 ring-danger/60')} style={{ background: OVERDUE_STRIPES }} />
        Hire Overdue
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={swatch} style={{ background: BLOCK_STRIPES }} />
        In the workshop
      </span>
      <span className="ml-auto hidden lg:inline">Drag across free time to book · click a booking to open it</span>
    </div>
  );
}

interface ToolbarProps {
  mode: CalendarView;
  onMode: (m: CalendarView) => void;
  window: { start: number; end: number };
  now: number;
  wide: boolean;
  onShift: (d: -1 | 1) => void;
  onToday: () => void;
  onDate: (t: number) => void;
  filters: RowFilters;
  onFilters: (patch: Record<string, string | null>) => void;
  onClear: () => void;
  filtering: boolean;
  poolOptions: { value: string; label: string }[];
  allPoolsLabel: string;
  typeOptions: { value: string; label: string }[];
  locationOptions: { value: string; label: string }[];
  fetching: boolean;
  onRefresh: () => void;
}

const ALL = '__all';

function Toolbar(p: ToolbarProps) {
  const isToday = p.now >= p.window.start && p.now < p.window.end;
  const label =
    p.mode === 'day'
      ? new Date(p.window.start).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${new Date(p.window.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(p.window.end - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const relativeDay = p.mode === 'day' ? dayLabel(p.window.start, p.now) : '';
  const select = (key: string, value: string | undefined, options: { value: string; label: string }[], all: string) => (
    <Select value={value || ALL} onChange={(v) => p.onFilters({ [key]: v === ALL ? null : v })} options={[{ value: ALL, label: all }, ...options]} className={cn('h-8 w-full text-[13px] lg:w-40', value && 'border-primary/50 bg-primary-soft/40')} />
  );
  const filterCount = [p.filters.pool, p.filters.type, p.filters.location, p.filters.onlyAvailable].filter(Boolean).length;
  const filterControls = (
    <>
      {select('pool', p.filters.pool, p.poolOptions, p.allPoolsLabel)}
      {select('type', p.filters.type, p.typeOptions, 'All types')}
      {select('loc', p.filters.location, p.locationOptions, 'All locations')}
      <Tip content={isToday ? 'Hide assets on hire, booked or in the workshop right now' : 'Hide assets on hire, booked or in the workshop at the start of this period'}>
        <label className="flex h-8 cursor-pointer items-center gap-2 text-[13px] font-medium whitespace-nowrap">
          <Switch checked={!!p.filters.onlyAvailable} onCheckedChange={(c) => p.onFilters({ free: c ? '1' : null })} />
          Only available
        </label>
      </Tip>
    </>
  );
  return (
    <div className="grid gap-3 border-b border-border px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={p.onToday} disabled={isToday} className="disabled:opacity-60">
          Today
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => p.onShift(-1)} aria-label={p.mode === 'day' ? 'Previous day' : 'Previous week'}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => p.onShift(1)} aria-label={p.mode === 'day' ? 'Next day' : 'Next week'}>
            <ChevronRight />
          </Button>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent" aria-label="Choose a date">
              <span className="truncate text-[15px] font-semibold tracking-tight" aria-live="polite">
                {label}
              </span>
              {relativeDay && ['Today', 'Tomorrow', 'Yesterday'].includes(relativeDay) && <Badge tone={relativeDay === 'Today' ? 'primary' : 'neutral'}>{relativeDay}</Badge>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-3">
            <label className="grid gap-1.5 text-[13px] font-medium">
              Go to date
              <Input type="date" defaultValue={toDateInput(p.window.start)} onChange={(e) => e.target.value && p.onDate(new Date(fromInputs(e.target.value, '12:00')!).getTime())} />
            </label>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex items-center gap-2">
          {p.wide && (
            <Segmented
              size="sm"
              value={p.mode}
              onChange={p.onMode}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
              ]}
            />
          )}
          <Tip content="Reload">
            <Button variant="ghost" size="icon-sm" onClick={p.onRefresh} aria-label="Reload">
              <RefreshCw className={cn(p.fetching && 'animate-spin')} />
            </Button>
          </Tip>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 lg:max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Find an asset</span>
          <Input type="search" value={p.filters.text ?? ''} onChange={(e) => p.onFilters({ q: e.target.value || null })} placeholder="Find an asset: ID, model, rego…" className="h-8 pl-8 text-[13px]" />
        </label>
        <div className="hidden flex-wrap items-center gap-2 lg:flex">{filterControls}</div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="lg:hidden">
              <SlidersHorizontal />
              Filters
              {filterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{filterCount}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="grid w-64 gap-2 p-3">
            {filterControls}
          </PopoverContent>
        </Popover>
        {p.filtering && (
          <Button variant="ghost" size="sm" onClick={p.onClear} className="text-muted-foreground">
            <X />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
