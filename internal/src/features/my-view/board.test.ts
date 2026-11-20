import { describe, expect, it } from 'vitest';
import type { BoardColumn } from '@/domain/queries';
import type { Item, LookupDoc } from '@/domain/types';
import { applyMoves, filterCards, layoutBoard, planMove, showsMove, WIDE_AFTER } from './board';

const status = (name: string, indexNum: number): LookupDoc => ({ documentId: `s-${name}`, systemHeader: { summaryName: name }, indexNum, color: '#eee' });
const column = (name: string, indexNum: number): BoardColumn => ({ name, color: '#eee', status: status(name, indexNum) });
const COLUMNS = [column('Open', 15), column('In development', 30), column('Ready for release', 40)];

let n = 0;
const item = (o: { status?: string; assignee?: string; priority?: number; severity?: number; summary?: string; project?: string } = {}): Item => ({
  documentId: `i${++n}`,
  itemRef: String(n),
  itemId: String(n).padStart(7, '0'),
  summary: o.summary ?? `Item ${n}`,
  statusRel: o.status ? [{ documentId: `s-${o.status}`, name: o.status }] : undefined,
  assigneeRel: o.assignee ? [{ documentId: `p-${o.assignee}`, name: o.assignee }] : undefined,
  priorityRel: o.priority !== undefined ? [{ documentId: `pr${o.priority}`, name: `P${o.priority}`, indexNum: o.priority }] : undefined,
  severityRel: o.severity !== undefined ? [{ documentId: `sv${o.severity}`, name: `S${o.severity}`, indexNum: o.severity }] : undefined,
  projectRel: o.project ? [{ documentId: o.project, name: o.project }] : undefined,
});

describe('layoutBoard', () => {
  it('puts items in lanes by assignee (name order) and cells by status, most urgent first', () => {
    const low = item({ status: 'Open', assignee: 'Bo', priority: 10 });
    const high = item({ status: 'Open', assignee: 'Bo', priority: 30 });
    const highSevere = item({ status: 'Open', assignee: 'Bo', priority: 30, severity: 50 });
    const ann = item({ status: 'In development', assignee: 'Ann' });
    const board = layoutBoard([low, high, ann, highSevere], COLUMNS);
    expect(board.lanes.map((l) => l.name)).toEqual(['Ann', 'Bo']);
    expect(board.lanes[1].cells[0].map((i) => i.documentId)).toEqual([highSevere.documentId, high.documentId, low.documentId]);
    expect(board.lanes[0].cells[1]).toEqual([ann]);
    expect(board.columns.map((c) => c.count)).toEqual([3, 1, 0]);
    expect(board.outside).toBe(0);
  });
  it('widens a column when a cell holds more than six cards', () => {
    const many = Array.from({ length: WIDE_AFTER + 1 }, () => item({ status: 'Open', assignee: 'Bo' }));
    const few = Array.from({ length: WIDE_AFTER }, () => item({ status: 'In development', assignee: 'Bo' }));
    const board = layoutBoard([...many, ...few], COLUMNS);
    expect(board.columns.map((c) => c.wide)).toEqual([true, false, false]);
  });
  it('counts items in statuses the board doesn’t show, and leaves out lanes with none shown', () => {
    const board = layoutBoard([item({ status: 'Deferred', assignee: 'Cy' }), item({ status: 'Open', assignee: 'Bo' })], COLUMNS);
    expect(board.outside).toBe(1);
    expect(board.lanes.map((l) => l.name)).toEqual(['Bo']);
  });
  it('has an Unassigned lane for items without an assignee', () => {
    expect(layoutBoard([item({ status: 'Open' })], COLUMNS).lanes[0].name).toBe('Unassigned');
  });
});

describe('planMove', () => {
  const it1 = item({ status: 'Open', assignee: 'Bo' });
  it('changes the status when dropped in another column', () => {
    expect(planMove(it1, { column: COLUMNS[1], lane: { name: 'Bo' } })).toEqual({ status: COLUMNS[1].status, assignee: undefined, message: 'Moved to In development' });
  });
  it('changes the assignee when dropped in another lane', () => {
    const ann = { documentId: 'p-Ann', name: 'Ann' };
    expect(planMove(it1, { column: COLUMNS[0], lane: { name: 'Ann', assignee: ann } })).toEqual({ status: undefined, assignee: ann, message: 'Moved to Ann' });
    expect(planMove(it1, { column: COLUMNS[2], lane: { name: 'Ann', assignee: ann } })?.message).toBe('Moved to Ready for release / Ann');
  });
  it('changes nothing in its own cell, or in a lane without an assignee', () => {
    expect(planMove(it1, { column: COLUMNS[0], lane: { name: 'Bo' } })).toBeNull();
    expect(planMove(it1, { lane: { name: 'Unassigned' } })).toBeNull();
  });
});

describe('applyMoves', () => {
  it('shows moves search hasn’t caught up with, and settles the ones it has', () => {
    const a = item({ status: 'Open', assignee: 'Bo' });
    const b = item({ status: 'In development', assignee: 'Bo' });
    const moves = {
      [a.documentId]: { statusRel: [{ documentId: 's-In development', name: 'In development' }] },
      [b.documentId]: { statusRel: [{ documentId: 's-In development', name: 'In development' }] },
    };
    const { items, settled } = applyMoves([a, b], moves);
    expect(items[0].statusRel?.[0].name).toBe('In development');
    expect(items[1]).toBe(b);
    expect(settled).toEqual([b.documentId]);
  });
  it('compares assignees by id and name (lanes are by name)', () => {
    const a = item({ status: 'Open', assignee: 'Bo' });
    expect(showsMove(a, { assigneeRel: [{ documentId: 'p-Bo', name: 'Bo' }] })).toBe(true);
    expect(showsMove(a, { assigneeRel: [{ documentId: 'p-Bo', name: 'Bo B' }] })).toBe(false);
  });
});

describe('filterCards', () => {
  it('matches every word in the number, summary, project or type', () => {
    const a = item({ summary: 'Login fails on Safari', project: 'FieldTec3' });
    const b = item({ summary: 'Export to CSV', project: 'Fleet' });
    expect(filterCards([a, b], 'safari fieldtec')).toEqual([a]);
    expect(filterCards([a, b], b.itemId!)).toEqual([b]);
    expect(filterCards([a, b], '  ')).toEqual([a, b]);
  });
});
