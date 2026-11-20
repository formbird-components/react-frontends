import { describe, expect, it } from 'vitest';
import {
  boardMove,
  bulkChange,
  byUrgency,
  changeFlags,
  copyOf,
  formState,
  lanesOf,
  linkItemRefs,
  linkMentions,
  newItemDefaults,
  offersQuickNote,
  planLink,
  planUnlink,
  putSavedFilter,
  renameSavedFilter,
  toRef,
  toSavedFilter,
  validateItem,
  versionHistory,
} from '../rules';
import type { Account, Item } from '../types';

const now = new Date('2026-11-11T01:00:00.000Z');
const me: Account = { documentId: 'me', email: 'jo.bloggs@formbird.com', systemHeader: { summaryName: 'Jo Bloggs' }, sdmsProjectRel: [{ documentId: 'p1', name: 'Bake' }, { documentId: 'p2', name: 'Fleet' }] };
const closed = { documentId: 'c', name: 'Closed', disableItemBool: true };
const open = { documentId: 'o', name: 'Open' };
const item = (o: Partial<Item> = {}): Item => ({ documentId: 'i1', itemRef: '100', itemId: '0000100', summary: 'One', systemHeader: { summaryName: '100: One', currentVersion: true }, ...o });

describe('form state', () => {
  it('without a project, lookups and people wait for one', () => {
    const s = formState(null, item({ projectRel: [] }));
    expect(s.lockOf('statusRel')).toBe('no-project');
    expect(s.lockOf('summary')).toBeNull();
    expect(s.showsRelationships).toBe(false);
  });
  it('a closed item locks all but status and progress note — from the SAVED status', () => {
    const saved = item({ projectRel: [{ documentId: 'p1', name: 'Bake' }], statusRel: [closed] });
    const s = formState(saved, saved);
    expect(s.lockOf('summary')).toBe('closed');
    expect(s.lockOf('statusRel')).toBeNull();
    expect(s.lockOf('progressNote')).toBeNull();
    // Picking Closed doesn't lock until saved.
    const openSaved = item({ projectRel: [{ documentId: 'p1', name: 'Bake' }], statusRel: [open] });
    expect(formState(openSaved, { ...openSaved, statusRel: [closed] }).lockOf('summary')).toBeNull();
  });
  it('an inactive project locks everything', () => {
    const saved = item({ projectRel: [{ documentId: 'p1', name: 'Bake' }] });
    expect(formState(saved, saved, { project: { documentId: 'p1', inactiveBool: true } }).lockOf('statusRel')).toBe('inactive-project');
  });
});

describe('new items', () => {
  it('reporter and creator are you; one project is yours to keep', () => {
    const d = newItemDefaults({ ...me, sdmsProjectRel: [{ documentId: 'p1', name: 'Bake', type: 'Developer' }] }, null, now);
    expect(d.reporterRel).toEqual([{ name: 'Jo Bloggs', documentId: 'me', email: 'jo.bloggs@formbird.com' }]);
    expect(d.createdByRel?.[0].date).toBe(now.toISOString());
    expect(d.projectRel).toEqual([{ documentId: 'p1', name: 'Bake' }]);
  });
  it('several projects: the one you last picked', () => {
    expect(newItemDefaults(me, [{ documentId: 'p2', name: 'Fleet' }], now).projectRel).toEqual([{ documentId: 'p2', name: 'Fleet' }]);
    expect(newItemDefaults(me, null, now).projectRel).toBeUndefined();
  });
  it('validation names the missing fields', () => {
    expect(validateItem(item({ summary: '  ', description: '' }), null).map((p) => p.field)).toEqual(['projectRel', 'typeRel', 'summary', 'statusRel', 'description', 'reporterRel']);
  });
});

describe('links keep the related fields', () => {
  it('a status keeps disableItemBool and indexNum, not other fields', () => {
    expect(toRef('statusRel', { documentId: 's', systemHeader: { summaryName: 'Closed' }, disableItemBool: true, indexNum: 70, color: '#888' })).toEqual({ documentId: 's', name: 'Closed', disableItemBool: true, indexNum: 70 });
  });
});

describe('status and snapshot', () => {
  it('quick note is offered when changing to a closing status', () => {
    const saved = item({ statusRel: [open] });
    expect(offersQuickNote(saved, { ...saved, statusRel: [closed] })).toBe(true);
    expect(offersQuickNote(item({ statusRel: [closed] }), item({ statusRel: [closed] }))).toBe(false);
  });
  it('content changes mark the snapshot pending; a progress note is yours', () => {
    expect(changeFlags(['description'], item())).toEqual({ pendingNewSummaryDescriptionBool: true });
    expect(changeFlags(['progressNote'], item())).toEqual({ userProgressNoteBool: true });
    expect(changeFlags(['summary'], item())).toEqual({});
  });
});

describe('mentions and item links', () => {
  const emails = ['joshua.galland@formbird.com', 'jordan.diamante@formbird.com', 'jo.bloggs@formbird.com'];
  it('@first+last becomes a mailto link when it matches one person', () => {
    expect(linkMentions('ping @joshuagalland please', emails)).toBe('ping [@JoshuaGalland](mailto:joshua.galland@formbird.com) please');
  });
  it('ambiguous or unknown mentions stay', () => {
    expect(linkMentions('hi @jo and @nobody', emails)).toBe('hi @jo and @nobody');
  });
  it('linked mentions are left alone', () => {
    const t = '[@JoBloggs](mailto:jo.bloggs@formbird.com)';
    expect(linkMentions(t, emails)).toBe(t);
  });
  it('#12345 becomes a link to the item, unknown ones stay', async () => {
    const found = await linkItemRefs('see #31492 and #9', async (ref) => (ref === '31492' ? { itemId: '0031492', documentId: 'abc' } : null));
    expect(found).toBe('see [0031492](/form/abc) and #9');
    expect(await linkItemRefs('nothing here', async () => null)).toBeNull();
  });
});

describe('relationships', () => {
  const self = item({ relationshipsRel: [] });
  const other = item({ documentId: 'i2', itemRef: '200', itemId: '0000200', systemHeader: { summaryName: '200: Two' }, relationshipsRel: [] });
  it('linking as Parent makes this item the other’s Child', () => {
    const plan = planLink(self, [other], 'Parent', me, now);
    expect(Array.isArray(plan)).toBe(true);
    const [theirs, mine] = plan as Exclude<typeof plan, string>;
    expect(theirs.documentId).toBe('i2');
    expect(theirs.change.relationshipsRel).toEqual([{ documentId: 'i1', name: '100: One', relationshipType: 'Child' }]);
    expect(mine.change.relationshipsRel).toEqual([{ name: '200: Two', itemId: '0000200', relationshipType: 'Parent', documentId: 'i2' }]);
    expect(mine.change.updatedByRel?.[0].documentId).toBe('me');
  });
  it('no more than 10 at once', () => {
    expect(planLink(self, Array.from({ length: 11 }, (_, i) => item({ documentId: `x${i}` })), 'Related', me)).toMatch(/more than 10/);
  });
  it('unlinking removes both sides', () => {
    const a = item({ relationshipsRel: [{ documentId: 'i2', relationshipType: 'Related' }] });
    const b = item({ documentId: 'i2', relationshipsRel: [{ documentId: 'i1', relationshipType: 'Related' }] });
    const plan = planUnlink(a, [b], me, now) as Exclude<ReturnType<typeof planUnlink>, string>;
    expect(plan.map((p) => [p.documentId, p.change.relationshipsRel])).toEqual([
      ['i2', []],
      ['i1', []],
    ]);
  });
});

describe('history', () => {
  it('describes what each version changed', () => {
    const v1 = item({ statusRel: [open], updatedByRel: [{ documentId: 'a', name: 'Ann' }], systemHeader: { versionId: 'v1', createdDate: '2026-01-01' } });
    const v2 = item({ statusRel: [closed], notesCommentsArr: [{ dataId: 'n', detail: 'x', createdDate: '' }], updatedByRel: [{ documentId: 'b', name: 'Bo' }], systemHeader: { versionId: 'v2', currentVersion: true } });
    const [first, second] = versionHistory([v1, v2]);
    expect(first.initial).toBe(true);
    expect(second.by).toBe('Bo');
    expect(second.changes).toEqual([
      { field: 'statusRel', label: 'Status', kind: 'changed', value: 'Closed' },
      { field: 'notesCommentsArr', label: 'Notes', kind: 'note', value: '1 note added' },
    ]);
  });
});

describe('saved filters', () => {
  const fields = ['filterTypeRel', 'filterStatusRel'];
  it('needs at least one filter', () => {
    expect(toSavedFilter('x', {}, fields)).toMatch(/one or more/);
    expect(toSavedFilter('x', { filterTypeRel: [{ documentId: 't', name: 'Bug' }], other: 1 }, fields)).toEqual({ name: 'x', filterTypeRel: [{ documentId: 't', name: 'Bug' }] });
  });
  it('names are unique', () => {
    expect(putSavedFilter([{ name: 'a' }], { name: 'a' })).toBe('The filter name already exists.');
    expect(renameSavedFilter([{ name: 'a' }, { name: 'b' }], 'a', 'b')).toBe('The filter name already exists.');
    expect(renameSavedFilter([{ name: 'a' }], 'a', 'c')).toEqual([{ name: 'c' }]);
  });
});

describe('board and bulk', () => {
  it('cards: highest priority, then severity', () => {
    const a = item({ priorityRel: [{ documentId: 'h', name: 'High', indexNum: 30 }] });
    const b = item({ priorityRel: [{ documentId: 'u', name: 'Urgent', indexNum: 40 }] });
    expect([a, b].sort(byUrgency)[0]).toBe(b);
    expect(lanesOf([item({ assigneeRel: [{ documentId: 'z', name: 'Zed' }] }), item()]).map((l) => l.name)).toEqual(['Unassigned', 'Zed']);
  });
  it('a move sets the status as a link and stamps who', () => {
    const change = boardMove({ status: { documentId: 's', systemHeader: { summaryName: 'Open' }, indexNum: 15 } }, me, now);
    expect(change.statusRel).toEqual([{ documentId: 's', name: 'Open', indexNum: 15 }]);
    expect(change.updatedDate).toBe(now.toISOString());
  });
  it('a bulk update adds tags and notes, sets fields', () => {
    const it1 = item({ tagsRel: [{ documentId: 't1', name: 'a' }] });
    const change = bulkChange(it1, { tagsRel: [{ documentId: 't1', name: 'a' }, { documentId: 't2', name: 'b' }], note: 'hi', priorityRel: [{ documentId: 'p', name: 'High' }] }, me, now);
    expect(change.tagsRel?.map((t) => t.name)).toEqual(['a', 'b']);
    expect(change.notesCommentsArr?.[0].detail).toBe('hi');
    expect(change.priorityRel?.[0].name).toBe('High');
  });
  it('a copy gets a new summary and project, not the identity', () => {
    const c = copyOf(item({ systemHeader: { summaryName: 'x' } }), { documentId: 'p2', name: 'Fleet' }, me, now);
    expect(c.summary).toBe('COPY OF #100 - One');
    expect(c).not.toHaveProperty('itemRef');
    expect(c).not.toHaveProperty('documentId');
    expect(c.projectRel).toEqual([{ documentId: 'p2', name: 'Fleet' }]);
  });
});
