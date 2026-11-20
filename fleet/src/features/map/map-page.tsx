// The fleet map: every mapped asset at its last known position, coloured by hire status, with the
// sites' boundaries. A side panel searches, filters and lists them; the list and the map highlight
// each other, and choosing an asset opens its card. Filters and the selection live in the URL.

import { Building2, List, LocateFixed, MapPinOff, Search, SearchX, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { FilterChip, Alert, EmptyState } from '@react-frontends/shared/components';
import { pointOf } from '@/components/map-geo';
import { MapView, type MapMarker, type MapViewHandle } from '@/components/map-view';
import { Button, Dialog, Input, Skeleton, Tip } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { first, nameOf, type Asset } from '@/domain/types';
import { STATUS_ORDER } from '@/domain/workflow';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { useDebounced, useNow } from '../overview/hooks';
import { AssetPopup } from './asset-popup';
import { countBy, mapFiltersActive, matchesMapFilters, parseMapFilters, type MapFilters } from './filters';
import { assetMarker, hireColor, positionLabel, siteAreas, useMapAssets, useSites } from './layers';

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseMapFilters(params), [params]);
  const selectedId = params.get('asset');
  const [query, setQuery] = useState(filters.q);
  const debouncedQuery = useDebounced(query, 200);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [showSites, setShowSites] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);
  useNow(60_000); // "seen 5 minutes ago" keeps up

  const assets = useMapAssets();
  const sites = useSites();
  const hireStatuses = useLookup('hireStatus');

  const update = (changes: Partial<Record<'q' | 'hire' | 'type' | 'location' | 'asset', string | undefined | null>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  // The search box writes the URL once typing settles.
  useEffect(() => {
    if (debouncedQuery !== filters.q) update({ q: debouncedQuery.trim() ? debouncedQuery : undefined });
    // update() is stable in effect; filters.q is compared, not depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const all = useMemo(() => assets.data?.documents ?? [], [assets.data]);
  const live: MapFilters = { ...filters, q: query };
  const shown = useMemo(() => all.filter((a) => matchesMapFilters(a, live)), [all, live.q, live.hire, live.type, live.location]); // eslint-disable-line react-hooks/exhaustive-deps
  const markers = useMemo(() => shown.map(assetMarker).filter((m): m is MapMarker => !!m), [shown]);
  const unplaced = shown.length - markers.length;
  const byId = useMemo(() => new Map(all.map((a) => [a.documentId, a])), [all]);
  const areas = useMemo(() => (showSites ? siteAreas(sites.data) : []), [sites.data, showSites]);
  const selected = selectedId ? byId.get(selectedId) : undefined;

  // A selection the filters now hide is dropped.
  useEffect(() => {
    if (selectedId && assets.data && !shown.some((a) => a.documentId === selectedId)) update({ asset: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, selectedId, assets.data]);

  const select = (id: string | null) => update({ asset: id });
  const fitKey = JSON.stringify([filters.hire, filters.type, filters.location, debouncedQuery.trim()]);

  const hireCounts = useMemo(() => countBy(all, live, 'hire'), [all, live.q, live.type, live.location]); // eslint-disable-line react-hooks/exhaustive-deps
  const typeCounts = useMemo(() => countBy(all, live, 'type'), [all, live.q, live.hire, live.location]); // eslint-disable-line react-hooks/exhaustive-deps
  const locationCounts = useMemo(() => countBy(all, live, 'location'), [all, live.q, live.hire, live.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const statuses = useMemo(() => {
    const order = STATUS_ORDER.hireStatus;
    return [...(hireStatuses.data ?? [])].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }, [hireStatuses.data]);

  const clearFilters = () => {
    setQuery('');
    update({ q: undefined, hire: undefined, type: undefined, location: undefined });
  };

  const panel = (
    <MapPanel
      assets={shown}
      total={all.length}
      loading={assets.isPending}
      error={assets.error}
      retry={() => void assets.refetch()}
      query={query}
      onQuery={setQuery}
      filters={filters}
      onFilter={(changes) => update(changes)}
      onClear={clearFilters}
      statuses={statuses.map((s) => ({ name: s.name, color: s.color, count: hireCounts.get(s.name) ?? 0 }))}
      typeOptions={[...typeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ value: name, label: name, hint: count }))}
      locationOptions={(sites.data ?? []).filter((s) => locationCounts.has(s.name) || filters.location === s.name).map((s) => ({ value: s.name, label: s.name, hint: locationCounts.get(s.name) ?? 0 }))}
      unplaced={unplaced}
      selectedId={selectedId}
      highlighted={highlighted}
      onHighlight={setHighlighted}
      onSelect={(id) => {
        setListOpen(false);
        select(id);
        if (id && id === selectedId) mapRef.current?.focus(id);
      }}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[420px]">
      <h1 className="sr-only">Fleet map</h1>
      <aside className="hidden w-[23rem] shrink-0 flex-col border-r border-border bg-card lg:flex" aria-label="Assets on the map">
        {panel}
      </aside>

      <div className="relative min-w-0 flex-1">
        <MapView
          ref={mapRef}
          className="absolute inset-0"
          aria-label="Fleet map"
          markers={markers}
          areas={areas}
          fit="markers"
          fitKey={fitKey}
          selectedId={selected ? selectedId : null}
          highlightedId={highlighted}
          onSelect={select}
          onHighlight={setHighlighted}
          renderPopup={(m) => {
            const asset = byId.get(m.id);
            return asset ? <AssetPopup asset={asset} onClose={() => select(null)} /> : null;
          }}
        >
          {/* Phones: search and the list over the map. */}
          <div className="absolute top-3 right-14 left-3 z-10 flex gap-2 lg:hidden">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assets" aria-label="Search assets" className="h-10 rounded-full bg-card/95 pl-9 shadow-pop backdrop-blur" />
            </div>
            <Button variant="outline" className="h-10 rounded-full bg-card/95 shadow-pop backdrop-blur" onClick={() => setListOpen(true)}>
              <List />
              {assets.isPending ? 'List' : shown.length}
            </Button>
          </div>

          <Legend statuses={statuses.map((s) => ({ name: s.name, color: s.color ?? '#8b8d98', count: markers.filter((m) => nameOf(byId.get(m.id)?.hireStatusRel) === s.name).length }))} />

          <div className="absolute right-2.5 bottom-8 z-10 flex flex-col gap-2">
            <Tip content={showSites ? 'Hide sites' : 'Show sites'} side="left">
              <Button variant="outline" size="icon" aria-pressed={showSites} aria-label={showSites ? 'Hide sites' : 'Show sites'} className={cn('bg-card shadow-sm', showSites && 'text-primary')} onClick={() => setShowSites((s) => !s)}>
                <Building2 />
              </Button>
            </Tip>
            <Tip content="Fit to the assets shown" side="left">
              <Button variant="outline" size="icon" aria-label="Fit to the assets shown" className="bg-card shadow-sm" onClick={() => mapRef.current?.fit()} disabled={!markers.length}>
                <LocateFixed />
              </Button>
            </Tip>
          </div>

          {!assets.isPending && !markers.length && (
            <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4 lg:top-6">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm shadow-pop backdrop-blur">
                <MapPinOff className="size-4 text-muted-foreground" />
                {all.length ? 'No assets on the map match.' : 'No assets have a position yet.'}
                {mapFiltersActive(filters) && (
                  <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}
        </MapView>
      </div>

      {/* Phones: the list as a bottom sheet. */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-[fade_150ms_ease-out] lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card shadow-pop data-[state=open]:animate-in lg:hidden">
            <DialogPrimitive.Title className="sr-only">Assets on the map</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Search, filter and choose an asset</DialogPrimitive.Description>
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
            <DialogPrimitive.Close className="absolute top-3 right-3 cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
            {panel}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </div>
  );
}

function Legend({ statuses }: { statuses: { name: string; color: string; count: number }[] }) {
  if (!statuses.length) return null;
  return (
    <div className="absolute bottom-8 left-3 z-10 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur max-sm:right-14 max-sm:rounded-full max-sm:py-1.5">
      <div className="mb-1 font-medium text-muted-foreground max-sm:sr-only">Hire status</div>
      <ul className="grid gap-1 max-sm:flex max-sm:flex-wrap max-sm:gap-x-3">
        {statuses.map((s) => (
          <li key={s.name} className="flex items-center gap-2 max-sm:gap-1.5">
            <span className="size-2.5 rounded-full ring-2 ring-white dark:ring-card" style={{ background: s.color }} aria-hidden />
            <span className="flex-1 max-sm:hidden">{s.name}</span>
            <span className="sm:hidden">{shortHire(s.name)}</span>
            <span className="font-medium tabular sm:pl-3">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MapPanel({
  assets,
  total,
  loading,
  error,
  retry,
  query,
  onQuery,
  filters,
  onFilter,
  onClear,
  statuses,
  typeOptions,
  locationOptions,
  unplaced,
  selectedId,
  highlighted,
  onHighlight,
  onSelect,
}: {
  assets: Asset[];
  total: number;
  loading: boolean;
  error: unknown;
  retry: () => void;
  query: string;
  onQuery: (q: string) => void;
  filters: MapFilters;
  onFilter: (changes: Partial<Record<'hire' | 'type' | 'location', string | undefined>>) => void;
  onClear: () => void;
  statuses: { name: string; color?: string; count: number }[];
  typeOptions: { value: string; label: string; hint: number }[];
  locationOptions: { value: string; label: string; hint: number }[];
  unplaced: number;
  selectedId: string | null;
  highlighted: string | null;
  onHighlight: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
  const active = mapFiltersActive({ ...filters, q: query });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 border-b border-border p-4">
        <div className="hidden lg:block">
          <div className="text-[15px] font-semibold tracking-tight">Fleet map</div>
          <p className="text-xs text-muted-foreground">Last known positions, coloured by hire status.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search ID, model, rego, place" aria-label="Search assets" className="pr-8 pl-9" />
          {query && (
            <button type="button" onClick={() => onQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hire status">
          {statuses.map((s) => {
            const on = filters.hire === s.name;
            return (
              <button
                key={s.name}
                type="button"
                aria-pressed={on}
                onClick={() => onFilter({ hire: on ? undefined : s.name })}
                className={cn(
                  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                  on ? 'border-transparent text-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
                style={on ? { background: `color-mix(in oklab, ${s.color} 16%, var(--card))`, borderColor: `color-mix(in oklab, ${s.color} 45%, transparent)` } : undefined}
              >
                <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {shortHire(s.name)}
                <span className="text-muted-foreground tabular">{s.count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="Type" value={filters.type} options={typeOptions} onChange={(type) => onFilter({ type })} />
          <FilterChip label="Location" value={filters.location} options={locationOptions} onChange={(location) => onFilter({ location })} />
          {active && (
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-1.5 text-xs text-muted-foreground">
        <span aria-live="polite">{loading ? 'Loading assets…' : active ? `${assets.length} of ${total} assets` : `${total} assets`}</span>
        {unplaced > 0 && (
          <Tip content="These assets have no position yet (no telematics or manual position).">
            <span className="cursor-help">{unplaced} without a position</span>
          </Tip>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {error ? (
          <Alert className="mx-2 mt-2">
            {error instanceof Error ? error.message : "Couldn't load the assets."}{' '}
            <button type="button" className="cursor-pointer font-medium underline" onClick={retry}>
              Try again
            </button>
          </Alert>
        ) : loading ? (
          <div className="grid gap-1 px-2 pt-1">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="size-9 rounded-lg" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : !assets.length ? (
          <EmptyState icon={SearchX} title="No assets match" className="py-10">
            {active ? (
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={onClear}>
                Clear the filters
              </button>
            ) : (
              'Assets show here once they are included in the map.'
            )}
          </EmptyState>
        ) : (
          <ul ref={listRef} className="grid gap-0.5">
            {assets.map((asset) => (
              <AssetRow
                key={asset.documentId}
                asset={asset}
                selected={asset.documentId === selectedId}
                highlighted={asset.documentId === highlighted}
                onSelect={() => onSelect(asset.documentId === selectedId ? null : asset.documentId)}
                onHighlight={onHighlight}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "Available", "On hire", "Unavailable": hire statuses where space is short. */
const shortHire = (name: string) => ({ 'Available For Hire': 'Available', 'On Hire': 'On hire', 'Unavailable For Hire': 'Unavailable' })[name] ?? name;

function AssetRow({ asset, selected, highlighted, onSelect, onHighlight }: { asset: Asset; selected: boolean; highlighted: boolean; onSelect: () => void; onHighlight: (id: string | null) => void }) {
  const placed = !!pointOf(asset.locationGeo);
  const where = positionLabel(asset) || nameOf(asset.locationRel);
  let meta: ReactNode = where;
  if (asset.lastPositionDate) meta = `${where} · ${relative(asset.lastPositionDate)}`;
  if (!placed) meta = 'No position';
  return (
    <li data-id={asset.documentId}>
      <button
        type="button"
        onClick={onSelect}
        onPointerEnter={() => onHighlight(asset.documentId)}
        onPointerLeave={() => onHighlight(null)}
        onFocus={() => onHighlight(asset.documentId)}
        onBlur={() => onHighlight(null)}
        aria-pressed={selected}
        disabled={!placed}
        title={asset.lastPositionDate ? `Last position ${formatDateTime(asset.lastPositionDate)}` : undefined}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors disabled:cursor-default disabled:opacity-60',
          selected ? 'bg-primary-soft' : highlighted ? 'bg-accent' : 'hover:bg-accent',
        )}
      >
        <AssetIcon kind={asset.iconKind} color={hireColor(asset)} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-sm font-semibold whitespace-nowrap">{asset.assetId}</span>
            <span className="min-w-0 truncate text-[13px] text-muted-foreground">{asset.makeModel}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{meta}</div>
        </div>
        {first(asset.hireStatusRel) && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: hireColor(asset) }} aria-hidden />
            {shortHire(nameOf(asset.hireStatusRel))}
          </span>
        )}
      </button>
    </li>
  );
}
