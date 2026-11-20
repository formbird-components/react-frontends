// The asset register: search, filters (type, location, hire status, lifecycle, service, rego and
// insurance due), a sortable table or a card grid, and more on demand. Filters, sort and view live
// in the URL, so other pages link straight to a filtered list (/assets?hire=On%20Hire).

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, LayoutGrid, Map as MapIcon, Rows3, Search, SearchX, ShieldCheck, Wrench, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AssetIcon, assetIcon } from '@/components/asset-icon';
import { FilterChip, Alert, EmptyState, Page, PageHeader, StatusBadge } from '@react-frontends/shared/components';
import { Button, Card, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Input, Segmented, Skeleton, Table, TBody, TD, TH, THead, TR } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { first, nameOf, type Asset } from '@/domain/types';
import { STATUS_ORDER } from '@/domain/workflow';
import { formatDate } from '@react-frontends/shared/format';
import { formatMeter } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { useDebounced, useMediaQuery } from '../overview/hooks';
import { DueDate, Plate, ServiceBadge } from './bits';
import { usePagedSearch } from './paged';
import { activeFilterCount, assetsRequest, clearedFilters, filtersToParams, parseFilters, SERVICE_OPTIONS, type AssetFilters, type SortKey, type View } from './filters';

const PAGE_SIZE = 30;

/** The fields the register shows. */
const LIST_FIELDS = [
  'documentId', 'assetId', 'makeModel', 'yearNum', 'registration', 'iconKind', 'assetTypeRel.name', 'assetTypeRel.documentId', 'locationRel', 'hireStatusRel', 'assetStatusRel',
  'meterReadingNum', 'primaryMeterUnit', 'serviceDueDate', 'serviceDueMeterNum', 'serviceWarning', 'regDueDate', 'insuranceDueDate', 'responsiblePersonRel',
];

const SORT_LABELS: Record<SortKey, string> = {
  id: 'ID',
  model: 'Make and model',
  type: 'Type',
  location: 'Location',
  hire: 'Hire status',
  lifecycle: 'Lifecycle',
  meter: 'Meter',
  service: 'Next service',
  rego: 'Rego due',
};

const DUE_OPTIONS = [
  { value: 'rego', label: 'Rego due in 30 days' },
  { value: 'insurance', label: 'Insurance due in 30 days' },
];

export function RegisterPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const wide = useMediaQuery('(min-width: 768px)');
  const view: View = filters.view ?? (wide ? 'table' : 'grid');

  const set = (next: AssetFilters) => setParams(filtersToParams(next), { replace: true });
  const patch = (changes: Partial<AssetFilters>) => set({ ...filters, ...changes });

  // The search box: typed here, written to the URL once typing settles; follows the URL back.
  const [query, setQuery] = useState(filters.q);
  const debounced = useDebounced(query, 250);
  useEffect(() => {
    if (debounced !== filters.q) patch({ q: debounced });
    // patch() reads the latest filters; only typing should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    setQuery((q) => (q.trim() === filters.q.trim() ? q : filters.q));
  }, [filters.q]);

  const request = useMemo(() => assetsRequest(filters), [filters]);
  const pages = usePagedSearch<Asset>('asset', request, { pageSize: PAGE_SIZE, include: LIST_FIELDS });
  const { items: assets, total } = pages;
  const active = activeFilterCount(filters);

  const types = useLookup('assetType', ['iconKind']);
  const locations = useLookup('location');
  const hireStatuses = useLookup('hireStatus');
  const lifecycles = useLookup('assetStatus');
  const ordered = (list: { name: string; color?: string }[] | undefined, order: string[]) => [...(list ?? [])].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  const sortBy = (key: SortKey) => patch({ sort: key, desc: filters.sort === key ? !filters.desc : false });
  const clear = () => {
    setQuery('');
    set(clearedFilters(filters));
  };

  return (
    <Page wide>
      <PageHeader
        title="Assets"
        description={pages.isPending ? 'Loading the register…' : active ? (total ? `${total} ${total === 1 ? 'asset matches' : 'assets match'}` : 'No assets match') : `${total} assets in the fleet`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/map">
                <MapIcon />
                Map
              </Link>
            </Button>
            <Segmented
              value={view}
              onChange={(v) => patch({ view: v })}
              options={[
                { value: 'table', label: <><Rows3 /><span className="sr-only sm:not-sr-only">Table</span></> },
                { value: 'grid', label: <><LayoutGrid /><span className="sr-only sm:not-sr-only">Cards</span></> },
              ]}
            />
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, model, rego, VIN" aria-label="Search assets" className="pr-8 pl-9" type="search" />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </div>
          <FilterChip label="Type" value={filters.type} onChange={(type) => patch({ type })} options={(types.data ?? []).map((t) => ({ value: t.name, label: t.name, icon: assetIcon(t.iconKind as string) }))} />
          <FilterChip label="Location" value={filters.location} onChange={(location) => patch({ location })} options={(locations.data ?? []).map((l) => ({ value: l.name, label: l.name }))} />
          <FilterChip label="Hire status" value={filters.hire} onChange={(hire) => patch({ hire })} options={ordered(hireStatuses.data, STATUS_ORDER.hireStatus).map((s) => ({ value: s.name, label: s.name, color: s.color }))} />
          <FilterChip label="Lifecycle" value={filters.lifecycle} onChange={(lifecycle) => patch({ lifecycle })} options={ordered(lifecycles.data, STATUS_ORDER.assetStatus).map((s) => ({ value: s.name, label: s.name, color: s.color }))} />
          <FilterChip label="Service" icon={Wrench} value={filters.service} onChange={(service) => patch({ service: service as AssetFilters['service'] })} options={SERVICE_OPTIONS} />
          <FilterChip
            label="Due"
            icon={ShieldCheck}
            value={filters.rego !== undefined ? 'rego' : filters.insurance !== undefined ? 'insurance' : undefined}
            onChange={(due) => patch({ rego: due === 'rego' ? 30 : undefined, insurance: due === 'insurance' ? 30 : undefined })}
            options={
              // A link with another window (e.g. ?rego=60) shows as itself.
              [...DUE_OPTIONS.map((o) => ({ ...o, label: o.value === 'rego' && filters.rego !== undefined && filters.rego !== 30 ? `Rego due in ${filters.rego} days` : o.value === 'insurance' && filters.insurance !== undefined && filters.insurance !== 30 ? `Insurance due in ${filters.insurance} days` : o.label }))]
            }
          />
          {active > 0 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clear}>
              Clear all
            </Button>
          )}
        </div>
      </div>

      {pages.error ? (
        <Alert>
          {pages.error instanceof Error ? pages.error.message : "Couldn't load the assets."}{' '}
          <button type="button" className="cursor-pointer font-medium underline" onClick={() => void pages.refetch()}>
            Try again
          </button>
        </Alert>
      ) : !pages.isPending && !assets.length ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={active ? 'No assets match' : 'No assets yet'}
            action={
              active ? (
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            {active ? 'Try another search, or clear the filters.' : 'Assets appear here once they are added to the register.'}
          </EmptyState>
        </Card>
      ) : (
        <div className={cn('transition-opacity', pages.isPlaceholderData && 'opacity-60')} aria-busy={pages.isFetching}>
          {view === 'table' ? (
            <AssetTable assets={assets} loading={pages.isPending} filters={filters} onSort={sortBy} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-end">
                <SortMenu filters={filters} onSort={(sort, desc) => patch({ sort, desc })} />
              </div>
              <AssetGrid assets={assets} loading={pages.isPending} />
            </>
          )}
          {!pages.isPending && (
            <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <span aria-live="polite">
                Showing {assets.length} of {total}
              </span>
              {pages.hasNextPage && (
                <Button variant="outline" onClick={() => void pages.fetchNextPage()} disabled={pages.isFetchingNextPage}>
                  {pages.isFetchingNextPage ? 'Loading…' : `Show ${Math.min(PAGE_SIZE, total - assets.length)} more`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function SortMenu({ filters, onSort }: { filters: AssetFilters; onSort: (sort: SortKey, desc: boolean) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowUpDown />
          {SORT_LABELS[filters.sort]}
          {filters.desc ? ' (high to low)' : ''}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={() => onSort(key, filters.sort === key ? !filters.desc : false)}>
            {SORT_LABELS[key]}
            {filters.sort === key && <span className="ml-auto text-xs text-muted-foreground">{filters.desc ? 'Descending' : 'Ascending'}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortHeader({ label, sortKey, filters, onSort, className }: { label: string; sortKey: SortKey; filters: AssetFilters; onSort: (key: SortKey) => void; className?: string }) {
  const sorted = filters.sort === sortKey;
  const Icon = sorted ? (filters.desc ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <TH className={className} aria-sort={sorted ? (filters.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className={cn('-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:text-foreground', sorted && 'text-foreground')}>
        {label}
        <Icon className={cn('size-3.5', !sorted && 'opacity-0 [button:hover>&]:opacity-60')} />
      </button>
    </TH>
  );
}

const COLUMN_CLASSES = ['hidden md:table-cell', 'hidden lg:table-cell', '', 'hidden lg:table-cell', 'hidden md:table-cell', 'hidden xl:table-cell'];

function AssetTable({ assets, loading, filters, onSort }: { assets: Asset[]; loading: boolean; filters: AssetFilters; onSort: (key: SortKey) => void }) {
  const navigate = useNavigate();
  const head = (label: string, key: SortKey, className?: string) => <SortHeader label={label} sortKey={key} filters={filters} onSort={onSort} className={className} />;
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead className="bg-muted/40">
          <tr>
            {head('Asset', 'id')}
            <TH className={COLUMN_CLASSES[0]}>Rego</TH>
            {head('Location', 'location', COLUMN_CLASSES[1])}
            {head('Status', 'hire', COLUMN_CLASSES[2])}
            {head('Meter', 'meter', `${COLUMN_CLASSES[3]} text-right`)}
            {head('Next service', 'service', COLUMN_CLASSES[4])}
            {head('Rego due', 'rego', COLUMN_CLASSES[5])}
          </tr>
        </THead>
        <TBody>
          {loading
            ? Array.from({ length: 8 }, (_, i) => (
                <TR key={i}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-lg" />
                      <div className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-16" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  </TD>
                  {COLUMN_CLASSES.map((c, j) => (
                    <TD key={j} className={c}>
                      <Skeleton className="h-4 w-20" />
                    </TD>
                  ))}
                </TR>
              ))
            : assets.map((a) => {
                const lifecycle = nameOf(a.assetStatusRel);
                return (
                  <TR
                    key={a.documentId}
                    data-clickable
                    onClick={(e) => {
                      if ((e.target as Element).closest('a, button')) return;
                      navigate(`/assets/${a.documentId}`);
                    }}
                  >
                    <TD>
                      <div className="flex items-center gap-3">
                        <AssetIcon kind={a.iconKind} color={first(a.hireStatusRel)?.color} size={36} />
                        <div className="min-w-0">
                          <Link to={`/assets/${a.documentId}`} className="font-semibold hover:underline focus-visible:underline">
                            {a.assetId}
                          </Link>
                          <div className="max-w-[18rem] truncate text-xs text-muted-foreground">
                            {[a.makeModel, a.yearNum].filter(Boolean).join(' · ')}
                            <span className="md:hidden">{a.registration ? ` · ${a.registration}` : ''}</span>
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className={COLUMN_CLASSES[0]}>{a.registration ? <Plate rego={a.registration} /> : <span className="text-muted-foreground">–</span>}</TD>
                    <TD className={cn(COLUMN_CLASSES[1], 'whitespace-nowrap')}>{nameOf(a.locationRel) || <span className="text-muted-foreground">–</span>}</TD>
                    <TD className={COLUMN_CLASSES[2]}>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge value={a.hireStatusRel} />
                        {lifecycle && lifecycle !== 'Active' && <StatusBadge value={a.assetStatusRel} />}
                      </div>
                    </TD>
                    <TD className={cn(COLUMN_CLASSES[3], 'text-right whitespace-nowrap tabular')}>{formatMeter(a.meterReadingNum, a.primaryMeterUnit) || <span className="text-muted-foreground">–</span>}</TD>
                    <TD className={COLUMN_CLASSES[4]}>
                      <NextService asset={a} />
                    </TD>
                    <TD className={cn(COLUMN_CLASSES[5], 'whitespace-nowrap')}>
                      <DueDate value={a.regDueDate} empty="Not registered" />
                    </TD>
                  </TR>
                );
              })}
        </TBody>
      </Table>
    </Card>
  );
}

function NextService({ asset }: { asset: Asset }) {
  if (!asset.serviceDueDate && asset.serviceDueMeterNum === undefined) return <span className="text-muted-foreground">–</span>;
  return (
    <div className="flex flex-col items-start gap-0.5 leading-tight whitespace-nowrap">
      <span className="flex items-center gap-2">
        <span className="tabular">{formatDate(asset.serviceDueDate) || '–'}</span>
        {asset.serviceWarning && asset.serviceWarning !== 'Not Due' && <ServiceBadge warning={asset.serviceWarning} />}
      </span>
      {asset.serviceDueMeterNum !== undefined && <span className="text-xs text-muted-foreground tabular">or {formatMeter(asset.serviceDueMeterNum, asset.primaryMeterUnit)}</span>}
    </div>
  );
}

function AssetGrid({ assets, loading }: { assets: Asset[]; loading: boolean }) {
  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {assets.map((a) => (
        <li key={a.documentId}>
          <AssetCard asset={a} />
        </li>
      ))}
    </ul>
  );
}

function AssetCard({ asset: a }: { asset: Asset }) {
  const lifecycle = nameOf(a.assetStatusRel);
  const fact = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13px]">{value}</dd>
    </div>
  );
  return (
    <Link
      to={`/assets/${a.documentId}`}
      className="group block h-full rounded-xl border border-border bg-card p-4 shadow-card transition-[box-shadow,border-color,transform] outline-none hover:-translate-y-px hover:border-input hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <div className="flex items-start gap-3">
        <AssetIcon kind={a.iconKind} color={first(a.hireStatusRel)?.color} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">{a.assetId}</span>
            {a.registration && <Plate rego={a.registration} className="h-5 text-[11px]" />}
          </div>
          <div className="truncate text-[13px] text-muted-foreground">{[a.makeModel, a.yearNum].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge value={a.hireStatusRel} />
        {lifecycle && lifecycle !== 'Active' && <StatusBadge value={a.assetStatusRel} />}
        {a.serviceWarning && a.serviceWarning !== 'Not Due' && <ServiceBadge warning={a.serviceWarning} />}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3">
        {fact('Location', nameOf(a.locationRel) || '–')}
        {fact('Meter', formatMeter(a.meterReadingNum, a.primaryMeterUnit) || '–')}
        {fact('Next service', formatDate(a.serviceDueDate) || '–')}
        {fact('Rego due', <DueDate value={a.regDueDate} empty="Not registered" className="flex-row gap-1.5" />)}
      </dl>
    </Link>
  );
}
