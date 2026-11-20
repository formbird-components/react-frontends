// All Items' view: the project, the filters (under the field names Formbird's form uses, so saved
// filters stay shared with it), the search text and the sort. The URL holds the view, so a view can
// be shared and reloaded; these functions turn it into query string parameters and back, and turn
// filters into saved filters and back (All Items - onFieldState: ruleLoadFilter, ruleSaveFilter).

import { formatDate, fromInputs, toDate, toDateInput } from '@react-frontends/shared/format';
import type { SortState } from '@/components/items-table';
import { DATE_PRESETS, FILTER_FIELDS, presetRange, type DatePreset, type ItemFilters } from '@/domain/queries';
import type { LookupDoc, Ref, SavedFilter } from '@/domain/types';

export interface AllItemsView {
  filters: ItemFilters;
  /** The project picked (one at most). */
  project?: Ref;
  /** An admin's "Show all projects". */
  showAll: boolean;
  /** The search text. */
  q: string;
  /** The table's sort; undefined is the default (Updated, newest first). */
  sort?: SortState;
}

export const DEFAULT_SORT: SortState = { field: 'updatedDate', dir: 'desc' };

/** The filters that pick links (people, lookups, hidden statuses). */
export type RefFilter =
  | 'filterReporterRel'
  | 'filterAssigneeRel'
  | 'filterTypeRel'
  | 'filterSeverityRel'
  | 'filterPriorityRel'
  | 'filterReproducibilityRel'
  | 'filterCategoryRel'
  | 'filterStatusRel'
  | 'filterResolutionRel'
  | 'filterTagsRel'
  | 'filterHiddenStatusRel';

/** Each link filter's URL parameter, in the order the URL lists them. */
export const REF_PARAMS: Record<RefFilter, string> = {
  filterReporterRel: 'reporter',
  filterAssigneeRel: 'assignee',
  filterTypeRel: 'type',
  filterSeverityRel: 'severity',
  filterPriorityRel: 'priority',
  filterReproducibilityRel: 'reproducibility',
  filterCategoryRel: 'category',
  filterStatusRel: 'status',
  filterResolutionRel: 'resolution',
  filterTagsRel: 'tags',
  filterHiddenStatusRel: 'hide',
};
export const REF_FILTERS = Object.keys(REF_PARAMS) as RefFilter[];

export const FILTER_LABELS: Record<RefFilter, string> = {
  filterReporterRel: 'Reporter',
  filterAssigneeRel: 'Assignee',
  filterTypeRel: 'Type',
  filterSeverityRel: 'Severity',
  filterPriorityRel: 'Priority',
  filterReproducibilityRel: 'Reproducibility',
  filterCategoryRel: 'Category',
  filterStatusRel: 'Status',
  filterResolutionRel: 'Resolution',
  filterTagsRel: 'Tags',
  filterHiddenStatusRel: 'Hide status (and above)',
};

export const DATE_KINDS = ['Created', 'Updated'] as const;
export type DateKind = (typeof DATE_KINDS)[number];

const presetKey = (k: DateKind) => `presetPeriod${k}` as const;
const fromKey = (k: DateKind) => `filterFrom${k}Date` as const;
const toKey = (k: DateKind) => `filterTo${k}Date` as const;

/** How the periods read on screen (the stored values are Formbird's: "This Week"). */
export const PRESET_LABELS: Record<DatePreset, string> = {
  Custom: 'Custom dates',
  Today: 'Today',
  'This Week': 'This week',
  'Last Week': 'Last week',
  'Last 30 days': 'Last 30 days',
};

const slug = (p: DatePreset) => p.toLowerCase().replace(/\s+/g, '-');
const presetOfSlug = (s: string | null) => (s ? DATE_PRESETS.find((p) => slug(p) === s.toLowerCase()) : undefined);

// ---------------------------------------------------------------------------------------------
// Links and dates in the URL
// ---------------------------------------------------------------------------------------------

/** A link in the URL: "<documentId>.<name>" (ids never contain a dot; names may). */
export const refParam = (r: Ref) => `${r.documentId}.${r.name}`;

export function parseRef(value: string): Ref | null {
  const i = value.indexOf('.');
  if (i <= 0) return null;
  const documentId = value.slice(0, i);
  const name = value.slice(i + 1);
  if (!/^[\w-]+$/.test(documentId) || !name.trim()) return null;
  return { documentId, name };
}

/** A date in the URL: "2026-11-05" when it is local midnight (what the date inputs give), else ISO. */
export function dateParam(value: string | undefined): string | undefined {
  const date = toDate(value);
  if (!date) return undefined;
  const midnight = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
  return midnight ? toDateInput(date) : date.toISOString();
}

export function parseDateParam(value: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fromInputs(value, '00:00');
  return toDate(value)?.toISOString();
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

/**
 * Filters as this page keeps them: a period other than Custom keeps no dates (they are worked out
 * when the search runs, so "Last 30 days" stays the last 30 days); dates without a period are
 * Custom; dates are ISO; empty lists are left out.
 */
export function normalizeFilters(input: Record<string, unknown>): ItemFilters {
  const out: ItemFilters = {};
  for (const kind of DATE_KINDS) {
    const raw = input[presetKey(kind)];
    let preset = DATE_PRESETS.find((p) => p === raw);
    const from = toDate(input[fromKey(kind)])?.toISOString();
    const to = toDate(input[toKey(kind)])?.toISOString();
    if (!preset && (from || to)) preset = 'Custom';
    if (!preset) continue;
    out[presetKey(kind)] = preset;
    if (preset === 'Custom') {
      if (from) out[fromKey(kind)] = from;
      if (to) out[toKey(kind)] = to;
    }
  }
  for (const field of REF_FILTERS) {
    const refs = input[field];
    if (Array.isArray(refs)) {
      const valid = refs.filter((r): r is Ref => !!r && typeof r === 'object' && typeof (r as Ref).documentId === 'string' && typeof (r as Ref).name === 'string');
      if (valid.length) out[field] = valid;
    }
  }
  return out;
}

/** The filters with each period's dates filled in (for the search, and for saving). */
export function withPresetDates(filters: ItemFilters, now = new Date()): ItemFilters {
  const out: ItemFilters = { ...filters };
  for (const kind of DATE_KINDS) {
    const range = presetRange(filters[presetKey(kind)], now);
    if (range) {
      out[fromKey(kind)] = range.from.toISOString();
      out[toKey(kind)] = range.to.toISOString();
    }
  }
  return out;
}

/** Whether any filter is set. */
export const hasFilters = (filters: ItemFilters) => Object.keys(normalizeFilters(filters as Record<string, unknown>)).length > 0;

const ids = (refs: Ref[] | undefined) => (refs ?? []).map((r) => r.documentId).sort().join(',');
const time = (iso: string | undefined) => toDate(iso)?.getTime() ?? null;

/** Whether two sets of filters pick the same items (links by id, periods by name, custom dates by time). */
export function sameFilters(a: ItemFilters, b: ItemFilters): boolean {
  const x = normalizeFilters(a as Record<string, unknown>);
  const y = normalizeFilters(b as Record<string, unknown>);
  for (const kind of DATE_KINDS) {
    if (x[presetKey(kind)] !== y[presetKey(kind)]) return false;
    if (time(x[fromKey(kind)]) !== time(y[fromKey(kind)]) || time(x[toKey(kind)]) !== time(y[toKey(kind)])) return false;
  }
  return REF_FILTERS.every((f) => ids(x[f]) === ids(y[f]));
}

/** The same filters without one: a period (its dates too) or a link filter. */
export function withoutFilter(filters: ItemFilters, key: DateKind | RefFilter): ItemFilters {
  const out: ItemFilters = { ...filters };
  if (key === 'Created' || key === 'Updated') {
    delete out[presetKey(key)];
    delete out[fromKey(key)];
    delete out[toKey(key)];
  } else {
    delete out[key];
  }
  return out;
}

/** A period as a chip reads: "Last 30 days", "after 1 Nov", "1 Nov to 5 Nov". */
export function periodText(filters: ItemFilters, kind: DateKind): string | null {
  const preset = filters[presetKey(kind)];
  if (!preset) return null;
  if (preset !== 'Custom') return PRESET_LABELS[preset];
  const from = filters[fromKey(kind)];
  const to = filters[toKey(kind)];
  if (from && to) return `${formatDate(from)} to ${formatDate(to)}`;
  if (from) return `after ${formatDate(from)}`;
  if (to) return `before ${formatDate(to)}`;
  return 'any date';
}

export interface ActiveFilter {
  key: DateKind | RefFilter;
  label: string;
  value: string;
}

/** The filters that are set, as chips show them (in the panel's order). */
export function activeFilters(filters: ItemFilters): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const kind of DATE_KINDS) {
    const text = periodText(filters, kind);
    if (text) out.push({ key: kind, label: kind, value: text });
  }
  for (const field of REF_FILTERS) {
    const refs = filters[field];
    if (!refs?.length) continue;
    const names = refs.map((r) => r.name).join(', ');
    out.push(field === 'filterHiddenStatusRel' ? { key: field, label: 'Hiding', value: `${names} and above` } : { key: field, label: FILTER_LABELS[field], value: names });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The view in the URL
// ---------------------------------------------------------------------------------------------

const SORT_FIELD = /^[\w.]+$/;

/** The view a query string describes. Values that don't parse are ignored. */
export function parseView(params: URLSearchParams): AllItemsView {
  const filters: Record<string, unknown> = {};
  for (const kind of DATE_KINDS) {
    const k = kind.toLowerCase();
    filters[presetKey(kind)] = presetOfSlug(params.get(k));
    filters[fromKey(kind)] = parseDateParam(params.get(`${k}From`));
    filters[toKey(kind)] = parseDateParam(params.get(`${k}To`));
  }
  for (const field of REF_FILTERS) {
    filters[field] = params
      .getAll(REF_PARAMS[field])
      .map(parseRef)
      .filter((r): r is Ref => !!r);
  }
  const project = params.get('project');
  const sort = params.get('sort');
  const sortField = sort?.replace(/^-/, '');
  return {
    filters: normalizeFilters(filters),
    project: (project && parseRef(project)) || undefined,
    showAll: params.get('all') === '1',
    q: params.get('q') ?? '',
    sort: sortField && SORT_FIELD.test(sortField) ? { field: sortField, dir: sort!.startsWith('-') ? 'desc' : 'asc' } : undefined,
  };
}

/** The query string of a view (defaults left out, in a stable order). */
export function viewToParams(view: AllItemsView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.project) params.set('project', refParam(view.project));
  if (view.showAll) params.set('all', '1');
  if (view.q.trim()) params.set('q', view.q);
  const filters = normalizeFilters(view.filters as Record<string, unknown>);
  for (const kind of DATE_KINDS) {
    const preset = filters[presetKey(kind)];
    if (!preset) continue;
    const k = kind.toLowerCase();
    params.set(k, slug(preset));
    const from = dateParam(filters[fromKey(kind)]);
    const to = dateParam(filters[toKey(kind)]);
    if (from) params.set(`${k}From`, from);
    if (to) params.set(`${k}To`, to);
  }
  for (const field of REF_FILTERS) for (const ref of filters[field] ?? []) params.append(REF_PARAMS[field], refParam(ref));
  if (view.sort && (view.sort.field !== DEFAULT_SORT.field || view.sort.dir !== DEFAULT_SORT.dir)) params.set('sort', `${view.sort.dir === 'desc' ? '-' : ''}${view.sort.field}`);
  return params;
}

/** Whether a query string sets anything of the view (else the page starts from what was remembered). */
export const describesView = (params: URLSearchParams) => [...params.keys()].length > 0;

// ---------------------------------------------------------------------------------------------
// Saved filters (shared with Formbird's All Items form)
// ---------------------------------------------------------------------------------------------

/** The filters a saved filter sets (stale dates of a period are dropped: the period is worked out again). */
export const filtersOfSaved = (saved: SavedFilter): ItemFilters => normalizeFilters(Object.fromEntries(FILTER_FIELDS.filter((f) => saved[f] !== undefined).map((f) => [f, saved[f]])));

/**
 * The filter fields to save, as Formbird's form saves them: a period with its dates (ISO), links
 * as { documentId, name }, hidden statuses with their indexNum (the form's rule reads it).
 */
export function filtersForSaving(filters: ItemFilters, statuses: LookupDoc[], now = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = { ...withPresetDates(normalizeFilters(filters as Record<string, unknown>), now) };
  const hidden = filters.filterHiddenStatusRel;
  if (hidden?.length) {
    out.filterHiddenStatusRel = hidden.map((r) => {
      const doc = statuses.find((s) => s.documentId === r.documentId);
      const indexNum = r.indexNum ?? doc?.indexNum;
      return { documentId: r.documentId, name: r.name, ...(doc?.appTags ? { appTags: doc.appTags } : {}), ...(indexNum !== undefined ? { indexNum } : {}) };
    });
  }
  return out;
}

/** What's wrong with a filter name, or null. Formbird's form drops HTML from names, so < and > can't be used. */
export function filterNameProblem(name: string): string | null {
  if (!name.trim()) return 'Enter a name.';
  if (/[<>]/.test(name)) return 'Names can’t contain < or >.';
  if (name.trim().length > 80) return 'Use 80 characters or fewer.';
  return null;
}

/** Saved filters by name, as the original's dropdown lists them. */
export const sortedFilters = (list: SavedFilter[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

// ---------------------------------------------------------------------------------------------
// Remembered in this browser
// ---------------------------------------------------------------------------------------------

/** Reads JSON from localStorage; null when missing, unreadable or storage is off. */
export function readStored<T>(key: string, valid: (v: unknown) => v is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: nothing to remember
  }
}

export const isSavedFilter = (v: unknown): v is SavedFilter => !!v && typeof v === 'object' && typeof (v as SavedFilter).name === 'string' && !!(v as SavedFilter).name;
