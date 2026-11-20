import { describe, expect, it } from 'vitest';
import { FILTER_FIELDS } from '@/domain/queries';
import { bulkChange, toSavedFilter } from '@/domain/rules';
import type { Account, Item, LookupDoc } from '@/domain/types';
import { MAX_BULK, runBulk, summary, tooMany, type BulkApi } from './bulk';
import { columnsFrom, DEFAULT_COLUMNS, toggleColumn } from './columns';
import { csvCell, csvDate, csvFileName, itemsCsv, toCsv } from './csv';
import { fetchAll } from './export';
import {
  activeFilters,
  dateParam,
  filterNameProblem,
  filtersForSaving,
  filtersOfSaved,
  hasFilters,
  normalizeFilters,
  parseDateParam,
  parseRef,
  parseView,
  periodText,
  refParam,
  sameFilters,
  viewToParams,
  withoutFilter,
  withPresetDates,
} from './filters';

const open = { documentId: 's1', name: 'Open' };
const feedback = { documentId: 's2', name: 'Feedback' };
const resolved = { documentId: 's6', name: 'Resolved' };
const statuses: LookupDoc[] = [
  { documentId: 's1', systemHeader: { summaryName: 'Open' }, indexNum: 15, appTags: ['sdms', 'status'] },
  { documentId: 's6', systemHeader: { summaryName: 'Resolved' }, indexNum: 60, appTags: ['sdms', 'status', 'sdmsConfig'] },
  { documentId: 's7', systemHeader: { summaryName: 'Closed' }, indexNum: 70 },
];

describe('links and dates in the URL', () => {
  it('a link is "<id>.<name>"; names may contain dots', () => {
    expect(refParam({ documentId: 'abc-1', name: 'v1.2 release' })).toBe('abc-1.v1.2 release');
    expect(parseRef('abc-1.v1.2 release')).toEqual({ documentId: 'abc-1', name: 'v1.2 release' });
  });
  it('a link without a name or with a strange id is ignored', () => {
    expect(parseRef('abc-1.')).toBeNull();
    expect(parseRef('abc')).toBeNull();
    expect(parseRef('a b.c')).toBeNull();
  });
  it('a date at local midnight is a plain date; other times stay ISO', () => {
    const midnight = new Date(2026, 10, 5).toISOString();
    expect(dateParam(midnight)).toBe('2026-11-05');
    expect(parseDateParam('2026-11-05')).toBe(midnight);
    const later = new Date(2026, 10, 5, 13, 45).toISOString();
    expect(dateParam(later)).toBe(later);
    expect(parseDateParam(later)).toBe(later);
    expect(parseDateParam('not a date')).toBeUndefined();
  });
});

describe('the view in the URL', () => {
  it('round-trips every filter, the project, search, show all and sort', () => {
    const view = {
      project: { documentId: 'p1', name: 'Fleet' },
      showAll: true,
      q: 'upload',
      sort: { field: 'summary', dir: 'asc' as const },
      filters: {
        presetPeriodCreated: 'Last 30 days' as const,
        presetPeriodUpdated: 'Custom' as const,
        filterFromUpdatedDate: new Date(2026, 9, 1).toISOString(),
        filterToUpdatedDate: new Date(2026, 9, 31).toISOString(),
        filterStatusRel: [open, feedback],
        filterAssigneeRel: [{ documentId: 'a1', name: 'Jo Bloggs' }],
        filterHiddenStatusRel: [resolved],
      },
    };
    const params = viewToParams(view);
    expect(params.get('created')).toBe('last-30-days');
    expect(params.get('updatedFrom')).toBe('2026-10-01');
    expect(params.getAll('status')).toEqual(['s1.Open', 's2.Feedback']);
    expect(params.get('sort')).toBe('summary');
    expect(parseView(new URLSearchParams(params.toString()))).toEqual(view);
  });
  it('leaves defaults out', () => {
    expect(viewToParams({ filters: {}, showAll: false, q: '  ', sort: { field: 'updatedDate', dir: 'desc' } }).toString()).toBe('');
  });
  it('ignores what doesn’t parse', () => {
    const v = parseView(new URLSearchParams('created=someday&status=bad&sort=-a%20b&project=x'));
    expect(v.filters).toEqual({});
    expect(v.sort).toBeUndefined();
    expect(v.project).toBeUndefined();
  });
  it('dates without a period are custom dates', () => {
    expect(parseView(new URLSearchParams('createdFrom=2026-11-01')).filters).toEqual({ presetPeriodCreated: 'Custom', filterFromCreatedDate: new Date(2026, 10, 1).toISOString() });
  });
});

describe('periods', () => {
  const now = new Date(2026, 10, 11, 15, 0); // Wednesday
  it('a period other than Custom keeps no dates; they are worked out for the search', () => {
    const f = normalizeFilters({ presetPeriodCreated: 'Today', filterFromCreatedDate: '2020-01-01T00:00:00Z' });
    expect(f).toEqual({ presetPeriodCreated: 'Today' });
    expect(withPresetDates(f, now)).toEqual({ presetPeriodCreated: 'Today', filterFromCreatedDate: new Date(2026, 10, 11).toISOString(), filterToCreatedDate: new Date(2026, 10, 12).toISOString() });
  });
  it('Custom keeps its dates', () => {
    const f = { presetPeriodUpdated: 'Custom' as const, filterFromUpdatedDate: '2026-01-01T00:00:00.000Z' };
    expect(withPresetDates(f, now)).toEqual(f);
  });
  it('reads as a chip', () => {
    expect(periodText({ presetPeriodCreated: 'This Week' }, 'Created')).toBe('This week');
    expect(periodText({ presetPeriodCreated: 'Custom', filterFromCreatedDate: new Date(2026, 10, 1).toISOString() }, 'Created')).toBe('after 1 Nov');
    expect(periodText({}, 'Created')).toBeNull();
  });
});

describe('filters', () => {
  it('compares by ids, periods and custom dates', () => {
    expect(sameFilters({ filterStatusRel: [open, feedback] }, { filterStatusRel: [{ ...feedback, indexNum: 20 }, open] })).toBe(true);
    expect(sameFilters({ filterStatusRel: [open] }, { filterStatusRel: [open, feedback] })).toBe(false);
    expect(sameFilters({ filterStatusRel: [] }, {})).toBe(true);
    expect(sameFilters({ presetPeriodCreated: 'Today', filterFromCreatedDate: '2020-01-01T00:00:00Z' }, { presetPeriodCreated: 'Today' })).toBe(true);
    expect(sameFilters({ presetPeriodCreated: 'Custom', filterFromCreatedDate: '2026-01-01T00:00:00Z' }, { presetPeriodCreated: 'Custom', filterFromCreatedDate: '2026-01-02T00:00:00Z' })).toBe(false);
  });
  it('knows when any is set, and removes one', () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ filterTagsRel: [] })).toBe(false);
    expect(hasFilters({ filterTagsRel: [open] })).toBe(true);
    const f = { presetPeriodCreated: 'Custom' as const, filterFromCreatedDate: 'x', filterStatusRel: [open] };
    expect(withoutFilter(f, 'Created')).toEqual({ filterStatusRel: [open] });
    expect(withoutFilter(f, 'filterStatusRel')).toEqual({ presetPeriodCreated: 'Custom', filterFromCreatedDate: 'x' });
  });
  it('lists the active ones for chips', () => {
    expect(activeFilters({ presetPeriodUpdated: 'Last Week', filterStatusRel: [open, feedback], filterHiddenStatusRel: [resolved] })).toEqual([
      { key: 'Updated', label: 'Updated', value: 'Last week' },
      { key: 'filterStatusRel', label: 'Status', value: 'Open, Feedback' },
      { key: 'filterHiddenStatusRel', label: 'Hiding', value: 'Resolved and above' },
    ]);
  });
});

describe('saved filters (shared with Formbird’s form)', () => {
  const now = new Date(2026, 10, 11, 15, 0);
  it('saves the period with its dates as ISO, and hidden statuses with indexNum', () => {
    const fields = filtersForSaving({ presetPeriodCreated: 'Last Week', filterHiddenStatusRel: [resolved], filterStatusRel: [open] }, statuses, now);
    const saved = toSavedFilter('Mine', fields, FILTER_FIELDS);
    expect(saved).toEqual({
      name: 'Mine',
      presetPeriodCreated: 'Last Week',
      filterFromCreatedDate: new Date(2026, 10, 2).toISOString(),
      filterToCreatedDate: new Date(2026, 10, 9).toISOString(),
      filterStatusRel: [open],
      filterHiddenStatusRel: [{ documentId: 's6', name: 'Resolved', appTags: ['sdms', 'status', 'sdmsConfig'], indexNum: 60 }],
    });
  });
  it('nothing set can’t be saved', () => {
    expect(typeof toSavedFilter('Empty', filtersForSaving({}, statuses, now), FILTER_FIELDS)).toBe('string');
  });
  it('loads one Formbird saved, dropping empty lists and stale period dates', () => {
    const fromFormbird = {
      name: 'Hide Closed',
      presetPeriodUpdated: 'Today',
      filterFromUpdatedDate: '2025-10-01T00:00:00.000Z',
      filterCategoryRel: [],
      filterHiddenStatusRel: [{ documentId: 's6', name: 'Resolved', appTags: ['sdms'], indexNum: 60 }],
    };
    expect(filtersOfSaved(fromFormbird)).toEqual({ presetPeriodUpdated: 'Today', filterHiddenStatusRel: fromFormbird.filterHiddenStatusRel });
  });
  it('names: not empty, no < or >', () => {
    expect(filterNameProblem(' ')).toBeTruthy();
    expect(filterNameProblem('<b>mine</b>')).toBeTruthy();
    expect(filterNameProblem('Dion’s & Jo’s')).toBeNull();
  });
});

describe('columns', () => {
  it('starts from the original list, keeps known ones in order, always ID and summary', () => {
    expect(columnsFrom(null)).toEqual(DEFAULT_COLUMNS);
    expect(columnsFrom(['tags', 'nonsense', 'status'])).toEqual(['id', 'summary', 'status', 'tags']);
    expect(columnsFrom([])).toEqual(DEFAULT_COLUMNS);
  });
  it('shows and hides, but not the fixed ones', () => {
    expect(toggleColumn(DEFAULT_COLUMNS, 'created')).toContain('created');
    expect(toggleColumn(DEFAULT_COLUMNS, 'project')).not.toContain('project');
    expect(toggleColumn(DEFAULT_COLUMNS, 'id')).toEqual(DEFAULT_COLUMNS);
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });
  it('keeps spreadsheets from running text as a formula', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@me')).toBe("'@me");
    expect(csvCell('-12.5')).toBe('-12.5');
  });
  it('has a byte order mark and CRLF lines', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('﻿a,b\r\n1,2\r\n');
  });
  it('writes items in the columns shown', () => {
    const item: Item = {
      documentId: 'd1',
      itemId: '0031492',
      summary: 'Upload, then fail',
      statusRel: [open],
      tagsRel: [{ documentId: 't1', name: 'UI' }, { documentId: 't2', name: 'Urgent' }],
      updatedDate: new Date(2026, 10, 5, 14, 30).toISOString(),
    };
    const csv = itemsCsv([item], [
      { key: 'id', label: 'ID' },
      { key: 'summary', label: 'Summary' },
      { key: 'status', label: 'Status' },
      { key: 'tags', label: 'Tags' },
      { key: 'updated', label: 'Updated' },
      { key: 'assignee', label: 'Assignee' },
    ]);
    expect(csv).toBe('﻿ID,Summary,Status,Tags,Updated,Assignee\r\n0031492,"Upload, then fail",Open,UI; Urgent,2026-11-05 14:30,\r\n');
  });
  it('dates and file names', () => {
    expect(csvDate(undefined)).toBe('');
    expect(csvFileName(new Date(2026, 0, 9))).toBe('sdms-items-2026-01-09.csv');
  });
});

describe('export', () => {
  it('fetches pages until it has them all, up to the limit', async () => {
    const pages: number[] = [];
    const docs = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ documentId: `d${from + i}` }));
    const search = async (_r: Record<string, unknown>, o: { page?: number; size?: number }) => {
      pages.push(o.page!);
      const from = o.page! * o.size!;
      return { documents: docs(Math.max(0, Math.min(o.size!, 1234 - from)), from), total: 1234 };
    };
    const progress: number[] = [];
    const all = await fetchAll({ query: {} }, ['documentId'], { pageSize: 500, search, onProgress: (n) => progress.push(n) });
    expect(all.items).toHaveLength(1234);
    expect(pages).toEqual([0, 1, 2]);
    expect(progress).toEqual([500, 1000, 1234]);
    const capped = await fetchAll({ query: {} }, ['documentId'], { pageSize: 500, limit: 600, search });
    expect(capped.items).toHaveLength(600);
    expect(capped.total).toBe(1234);
  });
});

describe('bulk changes', () => {
  const account: Account = { documentId: 'me', systemHeader: { summaryName: 'Dion' } };
  const items: Item[] = [
    { documentId: 'i1', itemId: '0000001', projectRel: [{ documentId: 'p1', name: 'Fleet' }], notesCommentsArr: [] },
    { documentId: 'i2', itemId: '0000002', projectRel: [{ documentId: 'p2', name: 'Internal' }] },
    { documentId: 'i3', itemId: '0000003' },
  ];
  const fake = (fail = new Set<string>()) => {
    const calls: { kind: string; id: string; fields?: Record<string, unknown> }[] = [];
    const api: BulkApi = {
      get: async (id) => {
        calls.push({ kind: 'get', id });
        return items.find((i) => i.documentId === id)!;
      },
      update: async (id, fields) => {
        calls.push({ kind: 'update', id, fields });
        if (fail.has(id)) throw new Error('Refused');
        return { documentId: id, ...fields } as Item;
      },
      create: async (templateId, fields) => {
        calls.push({ kind: 'create', id: templateId, fields });
        return { documentId: 'new', itemId: '0990000', ...fields } as Item;
      },
    };
    return { api, calls };
  };

  it('updates one item at a time, reading each first, and reports each', async () => {
    const { api, calls } = fake(new Set(['i2']));
    const heard: string[] = [];
    const results = await runBulk(items, { action: 'Update', update: { statusRel: [open] } }, account, api, { onResult: (r) => heard.push(r.label) });
    expect(calls.map((c) => `${c.kind} ${c.id}`)).toEqual(['get i1', 'update i1', 'get i2', 'update i2', 'get i3', 'update i3']);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].message).toBe('Refused');
    expect(heard).toEqual(['0000001', '0000002', '0000003']);
    expect(calls[1].fields).toMatchObject({ statusRel: [open], pendingNewSummaryDescriptionBool: true, updatedByRel: [{ documentId: 'me' }] });
    expect(summary('Update', results, 3)).toBe('2 of 3 updated. 1 failed and stays selected.');
  });

  it('moves, skipping items already in the project', async () => {
    const { api, calls } = fake();
    const results = await runBulk(items, { action: 'Move', project: { documentId: 'p1', name: 'Fleet' } }, account, api);
    expect(results[0]).toMatchObject({ ok: true, message: 'Already in Fleet' });
    expect(calls.filter((c) => c.kind === 'update').map((c) => c.id)).toEqual(['i2', 'i3']);
    expect(calls[2].fields).toMatchObject({ projectRel: [{ documentId: 'p1', name: 'Fleet' }] });
  });

  it('copies into the project from the Item template', async () => {
    const { api, calls } = fake();
    const results = await runBulk([items[1]], { action: 'Copy', project: { documentId: 'p1', name: 'Fleet' } }, account, api);
    expect(calls[1]).toMatchObject({ kind: 'create', id: '376eb771-043c-4139-b651-1712d7e36cab' });
    expect(calls[1].fields).toMatchObject({ projectRel: [{ documentId: 'p1', name: 'Fleet' }] });
    expect(results[0].message).toBe('Copied as 0990000');
  });

  it('stops when asked, and refuses more than the cap', async () => {
    const { api } = fake();
    let n = 0;
    const results = await runBulk(items, { action: 'Update', update: { progressNote: 'x' } }, account, api, { stopped: () => n++ >= 1 });
    expect(results).toHaveLength(1);
    expect(summary('Update', results, 3)).toBe('1 of 3 items updated. Stopped before the last 2.');
    expect(tooMany(MAX_BULK)).toBeNull();
    const many = Array.from({ length: MAX_BULK + 1 }, (_, i) => ({ documentId: `x${i}` }));
    await expect(runBulk(many, { action: 'Update', update: {} }, account, api)).rejects.toThrow(/up to 100/);
  });

  it('a release item’s note goes in its notesArr (as the bulk rule saves it)', () => {
    const release: Item = { documentId: 'r1', appTags: ['releaseItem', 'sdms', 'item'], notesArr: [{ dataId: 'n0', detail: 'old', createdDate: 'x' }] };
    const change = bulkChange(release, { note: 'Shipped' }, account);
    expect(change.notesCommentsArr).toBeUndefined();
    expect((change.notesArr as unknown[]).length).toBe(2);
    expect(change.pendingNewSummaryDescriptionBool).toBe(true);
  });
});
