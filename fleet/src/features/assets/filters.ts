// The asset register's filters: read from and written to the URL (so other pages can link to a
// filtered list, e.g. /assets?hire=On%20Hire), and turned into the Elasticsearch request.

import { contains, range, term, terms, type Clause } from '@react-frontends/shared/es';
import { fleetQuery } from '@/lib/es';

export type ServiceFilter = 'due' | 'overdue' | 'soon' | 'ok';
export type SortKey = 'id' | 'model' | 'type' | 'location' | 'hire' | 'lifecycle' | 'meter' | 'service' | 'rego';
export type View = 'table' | 'grid';

export interface AssetFilters {
  /** Text typed in the search box. */
  q: string;
  /** Asset type name ("Panel Van"). */
  type?: string;
  /** Location name ("Alexandria Depot"). */
  location?: string;
  /** Hire status name. */
  hire?: string;
  /** Lifecycle (asset status) name. Without one, disposed assets are left out. */
  lifecycle?: string;
  service?: ServiceFilter;
  /** Registration due within this many days (or overdue). */
  rego?: number;
  /** Insurance due within this many days (or overdue). */
  insurance?: number;
  sort: SortKey;
  desc: boolean;
  view?: View;
}

/** Elasticsearch fields each sort key orders by. */
export const SORT_FIELDS: Record<SortKey, string> = {
  id: 'assetId.lcase',
  model: 'makeModel.lcase',
  type: 'assetTypeRel.name',
  location: 'locationRel.name',
  hire: 'hireStatusRel.indexNum',
  lifecycle: 'assetStatusRel.indexNum',
  meter: 'meterReadingNum',
  service: 'serviceDueDate',
  rego: 'regDueDate',
};

export const SERVICE_OPTIONS: { value: ServiceFilter; label: string }[] = [
  { value: 'due', label: 'Due soon or overdue' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'soon', label: 'Due soon' },
  { value: 'ok', label: 'Not due' },
];

const SERVICE_VALUES: Record<ServiceFilter, string[]> = { due: ['Due Soon', 'Overdue'], overdue: ['Overdue'], soon: ['Due Soon'], ok: ['Not Due'] };

const days = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 3650 ? n : undefined;
};

const text = (value: string | null) => (value && value.trim() ? value.trim() : undefined);

/** Filters from the page's query string. Unknown values are ignored. */
export function parseFilters(params: URLSearchParams): AssetFilters {
  const service = params.get('service') as ServiceFilter | null;
  const sortParam = params.get('sort') ?? '';
  const desc = sortParam.startsWith('-');
  const sortKey = (desc ? sortParam.slice(1) : sortParam) as SortKey;
  const view = params.get('view');
  return {
    q: params.get('q') ?? '',
    type: text(params.get('type')),
    location: text(params.get('location')),
    hire: text(params.get('hire')),
    lifecycle: text(params.get('lifecycle')),
    service: service && service in SERVICE_VALUES ? service : undefined,
    rego: days(params.get('rego')),
    insurance: days(params.get('insurance')),
    sort: sortKey in SORT_FIELDS ? sortKey : 'id',
    desc: sortKey in SORT_FIELDS && desc,
    view: view === 'grid' || view === 'table' ? view : undefined,
  };
}

/** The query string for some filters (defaults left out, in a stable order). */
export function filtersToParams(f: AssetFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set('q', f.q);
  if (f.type) params.set('type', f.type);
  if (f.location) params.set('location', f.location);
  if (f.hire) params.set('hire', f.hire);
  if (f.lifecycle) params.set('lifecycle', f.lifecycle);
  if (f.service) params.set('service', f.service);
  if (f.rego !== undefined) params.set('rego', String(f.rego));
  if (f.insurance !== undefined) params.set('insurance', String(f.insurance));
  if (f.sort !== 'id' || f.desc) params.set('sort', `${f.desc ? '-' : ''}${f.sort}`);
  if (f.view) params.set('view', f.view);
  return params;
}

/** How many filters narrow the list (search text included). */
export const activeFilterCount = (f: AssetFilters) =>
  [f.q.trim(), f.type, f.location, f.hire, f.lifecycle, f.service, f.rego, f.insurance].filter((v) => v !== undefined && v !== '').length;

/** The same filters with none set (search, sort and view kept as given). */
export const clearedFilters = (f: AssetFilters, keepSearch = false): AssetFilters => ({ q: keepSearch ? f.q : '', sort: f.sort, desc: f.desc, view: f.view });

/** The end of the local day `n` days from `now`, as ISO: "due within n days" includes that whole day. */
export function endOfDayIn(n: number, now = Date.now()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + n);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/** The clauses for the filters (without the search text). */
export function filterClauses(f: AssetFilters, now = Date.now()): Clause[] {
  const clauses: (Clause | undefined | false | '')[] = [
    f.type && term('assetTypeRel.name', f.type),
    f.location && term('locationRel.name', f.location),
    f.hire && term('hireStatusRel.name', f.hire),
    f.lifecycle && term('assetStatusRel.name', f.lifecycle),
    f.service && terms('serviceWarning', SERVICE_VALUES[f.service]),
    f.rego !== undefined && range('regDueDate', { lte: endOfDayIn(f.rego, now) }),
    f.insurance !== undefined && range('insuranceDueDate', { lte: endOfDayIn(f.insurance, now) }),
  ];
  return clauses.filter((c): c is Clause => !!c);
}

/** Fields searched by the search box (as fleet's register searches them). */
export const SEARCH_FIELDS = ['assetId', 'makeModel', 'registration', 'vin'];

/** The Elasticsearch request for the register. */
export function assetsRequest(f: AssetFilters, now = Date.now()): Record<string, unknown> {
  const sort: Record<string, unknown>[] = [{ [SORT_FIELDS[f.sort]]: { order: f.desc ? 'desc' : 'asc', missing: '_last' } }];
  if (f.sort !== 'id') sort.push({ 'assetId.lcase': { order: 'asc' } });
  return fleetQuery('asset', {
    filter: [...filterClauses(f, now), contains(SEARCH_FIELDS, f.q)],
    mustNot: f.lifecycle ? [] : [term('assetStatusRel.name', 'Disposed')],
    sort,
  });
}

/** Where to link for a filtered register (overview tiles, the map). */
export function assetsLink(f: Partial<AssetFilters>): string {
  const params = filtersToParams({ q: '', sort: 'id', desc: false, ...f });
  const query = params.toString();
  return query ? `/assets?${query}` : '/assets';
}
