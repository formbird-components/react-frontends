import { describe, expect, it } from 'vitest';
import {
  allItemsQuery,
  boardColumns,
  hiddenStatusNames,
  itemByRefQuery,
  lookupQuery,
  myViewQuery,
  peopleQuery,
  presetRange,
  ProjectConfigError,
  projectOptionsQuery,
  projectScope,
  textSearch,
} from '../queries';
import type { Account, LookupDoc, Project } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = { query: any; sort?: unknown };
const filters = (q: Q) => q.query.bool.filter as Record<string, any>[];
const project = (o: Partial<Project> = {}): Project => ({ documentId: 'p1', systemHeader: { summaryName: 'Bake' }, ...o });
const account: Account = { documentId: 'me', sdmsProjectRel: [{ documentId: 'p1', name: 'Bake' }, { documentId: 'p2', name: 'Fleet' }] };

describe('lookupQuery (project settings)', () => {
  it('Global Default offers global values only', () => {
    const q: Q = lookupQuery('status', project({ configStatus: 'Global Default' }));
    expect(filters(q)).toContainEqual({ term: { isGlobalDefaultBool: true } });
    expect(q.query.bool.must_not).toEqual([{ term: { inactiveBool: true } }]);
    expect(q.sort).toEqual([{ indexNum: 'asc' }, { 'systemHeader.summaryName': 'asc' }]);
  });
  it('Project Specific offers the project’s values', () => {
    expect(filters(lookupQuery('category', project({ configCategory: 'Project Specific' })))).toContainEqual({ term: { 'projectRel.documentId': 'p1' } });
  });
  it('Combined offers either', () => {
    const q: Q = lookupQuery('status', project({ configStatus: 'Combined' }));
    expect(q.query.bool.should).toEqual([{ term: { isGlobalDefaultBool: true } }, { term: { 'projectRel.documentId': 'p1' } }]);
    expect(q.query.bool.minimum_should_match).toBe(1);
  });
  it('no setting: every active value; tags: global ones', () => {
    expect(filters(lookupQuery('type', project()))).toHaveLength(3);
    expect(filters(lookupQuery('tag', project()))).toContainEqual({ term: { isGlobalDefaultBool: true } });
  });
  it('without a project: all values on the form, global ones in filters', () => {
    expect(filters(lookupQuery('priority', null))).toHaveLength(3);
    expect(filters(lookupQuery('priority', null, { noProject: 'global' }))).toContainEqual({ term: { isGlobalDefaultBool: true } });
  });
  it('an unknown setting is an error', () => {
    expect(() => lookupQuery('type', project({ configType: 'Weird' as never }))).toThrow(ProjectConfigError);
  });
});

describe('people and projects', () => {
  it('people are active SDMS accounts on the project', () => {
    const q = peopleQuery(['p1']);
    expect(filters(q)).toEqual([
      { term: { 'systemHeader.systemType': 'account' } },
      { term: { 'appRel.documentId': 'db625088-19bf-4eb6-9783-5f0f11c5aede' } },
      { terms: { 'sdmsProjectRel.documentId': ['p1'] } },
    ]);
  });
  it('projects are your own unless an admin shows all', () => {
    expect(filters(projectOptionsQuery(account))).toContainEqual({ terms: { documentId: ['p1', 'p2'] } });
    expect(filters(projectOptionsQuery(account, true))).not.toContainEqual({ terms: { documentId: ['p1', 'p2'] } });
  });
  it('scope: picked projects, else yours, else all', () => {
    expect(projectScope([{ documentId: 'p9', name: 'x' }], account)).toEqual({ terms: { 'projectRel.documentId': ['p9'] } });
    expect(projectScope([], account)).toEqual({ terms: { 'projectRel.documentId': ['p1', 'p2'] } });
    expect(projectScope([], account, true)).toBeUndefined();
    expect(projectScope(undefined, { documentId: 'x' })).toBeUndefined();
  });
});

describe('My View', () => {
  it('assigned to me leaves out Closed and Resolved', () => {
    const q: Q = myViewQuery('assigned', 'me', undefined);
    expect(filters(q)).toContainEqual({ term: { 'assigneeRel.documentId': 'me' } });
    expect(q.query.bool.must_not).toEqual([{ terms: { 'statusRel.name': ['Closed', 'Resolved'] } }]);
    expect(q.sort).toEqual([{ updatedDate: 'desc' }]);
  });
  it('unassigned has no assignee', () => {
    expect((myViewQuery('unassigned', 'me', undefined) as Q).query.bool.must_not).toContainEqual({ exists: { field: 'assigneeRel' } });
  });
  it('recent is the last 30 days, in scope', () => {
    const scope = { terms: { 'projectRel.documentId': ['p1'] } };
    const q = myViewQuery('recent', 'me', scope);
    expect(filters(q)).toContainEqual({ range: { updatedDate: { gte: 'now-30d' } } });
    expect(filters(q)).toContainEqual(scope);
  });
  it('board columns are statuses 10–59', () => {
    const s = (name: string, indexNum: number, color?: string): LookupDoc => ({ documentId: name, indexNum, color, systemHeader: { summaryName: name } });
    const cols = boardColumns([s('Draft', 1), s('Open', 15, '#bde5f2'), s('Released awaiting test', 50), s('Resolved', 60)]);
    expect(cols.map((c) => c.name)).toEqual(['Open', 'Released awaiting test']);
    expect(cols[1].color).toBe('#e0e0e0');
  });
});

describe('All Items', () => {
  const statuses: LookupDoc[] = [
    { documentId: 'o', indexNum: 15, systemHeader: { summaryName: 'Open' } },
    { documentId: 'r', indexNum: 60, systemHeader: { summaryName: 'Resolved' } },
    { documentId: 'c', indexNum: 70, systemHeader: { summaryName: 'Closed' } },
    { documentId: 'd', indexNum: 80, systemHeader: { summaryName: 'Deferred' } },
  ];
  it('hiding a status hides it and every later one', () => {
    expect(hiddenStatusNames([{ documentId: 'r', name: 'Resolved', indexNum: 60 }], statuses)).toEqual(['Resolved', 'Closed', 'Deferred']);
    expect(hiddenStatusNames([{ documentId: 'c', name: 'Closed' }], statuses)).toEqual(['Closed', 'Deferred']);
  });
  it('link filters match by name, dates by range', () => {
    const q: Q = allItemsQuery(
      { filterTypeRel: [{ documentId: 't', name: 'Bug' }], filterResolutionRel: [{ documentId: 'x', name: 'Done' }], filterFromCreatedDate: '2026-01-01T00:00:00.000Z' },
      { hiddenStatuses: ['Closed'] },
    );
    expect(filters(q)).toContainEqual({ terms: { 'typeRel.name': ['Bug'] } });
    expect(filters(q)).toContainEqual({ terms: { 'resolutionRel.name': ['Done'] } });
    expect(filters(q)).toContainEqual({ range: { createdDate: { gte: '2026-01-01T00:00:00.000Z' } } });
    expect(q.query.bool.must_not).toEqual([{ terms: { 'statusRel.name': ['Closed'] } }]);
  });
  it('search is a case-insensitive wildcard; wildcard characters are escaped', () => {
    const s = textSearch('a*b') as Record<string, any>;
    expect(s.bool.should[0]).toEqual({ wildcard: { 'systemHeader.summaryName.lcase': { value: '*a\\*b*', case_insensitive: true, boost: 20 } } });
  });
  it('preset periods: weeks start on Monday', () => {
    const wed = new Date(2026, 10, 11, 15, 30); // Wed 11 Nov 2026
    expect(presetRange('This Week', wed)).toEqual({ from: new Date(2026, 10, 9), to: new Date(2026, 10, 16) });
    expect(presetRange('Last Week', wed)).toEqual({ from: new Date(2026, 10, 2), to: new Date(2026, 10, 9) });
    expect(presetRange('Today', wed)).toEqual({ from: new Date(2026, 10, 11), to: new Date(2026, 10, 12) });
    expect(presetRange('Custom', wed)).toBeNull();
  });
});

describe('itemByRefQuery', () => {
  it('finds 31492, 0031492 or an id', () => {
    const should = (itemByRefQuery('0031492') as Q).query.bool.should;
    expect(should).toContainEqual({ term: { itemRef: '31492' } });
    expect(should).toContainEqual({ term: { itemId: '0031492' } });
  });
});
