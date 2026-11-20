import { describe, expect, it } from 'vitest';
import { lineTotals } from '@/domain/logic/money';
import { changedFields, hasChanges } from './edits';
import { addMaterial, cleanLines, labourLine, lineAmount, lineProblems, otherLine, parseAmount, removeLine, stockWarnings, updateLine, type Line } from './lines';
import { requestDefaults, requestTimeline, statusValue, workshopOf } from './request';
import { whoFor } from '@/domain/workflow';

const filter = { documentId: 'm1', nameId: 'Oil filter (light vehicle)', partNo: 'OF-LV-90915', unit: 'ea', unitCost: 18.5 };
const oil = { documentId: 'm2', nameId: 'Engine oil 5W-30', partNo: 'OIL-5W30', unit: 'L', unitCost: 12 };

describe('line items', () => {
  it('reads amounts typed with commas, spaces and $', () => {
    expect(parseAmount('1,234.5')).toBe(1234.5);
    expect(parseAmount(' $ 18.50 ')).toBe(18.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.2.3')).toBeNull();
    expect(parseAmount(7)).toBe(7);
    expect(parseAmount(Number.NaN)).toBeNull();
  });

  it('adds a part once, then counts it up', () => {
    let lines: Line[] = addMaterial([], filter, 'l1');
    expect(lines).toEqual([{ id: 'l1', kind: 'part', description: 'Oil filter (light vehicle)', materialRel: [{ documentId: 'm1', name: 'Oil filter (light vehicle)', partNo: 'OF-LV-90915' }], qty: 1, unit: 'ea', unitCost: 18.5 }]);
    lines = addMaterial(lines, filter, 'l2');
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(2);
    lines = addMaterial(lines, oil, 'l3');
    expect(lines.map((l) => l.id)).toEqual(['l1', 'l3']);
  });

  it('adds labour at the workshop rate and other costs to fill in', () => {
    expect(labourLine('x')).toEqual({ id: 'x', kind: 'labour', description: 'Labour', qty: 1, unit: 'h', unitCost: 120 });
    expect(otherLine('y')).toMatchObject({ kind: 'other', description: '', qty: 1, unitCost: 0 });
  });

  it('edits, removes and prices lines; totals with GST', () => {
    let lines: Line[] = [...addMaterial([], oil, 'a'), labourLine('b', 'Service', 1.5)];
    lines = updateLine(lines, 'a', { qty: 6 });
    expect(lineAmount(lines[0])).toBe(72);
    expect(lineAmount({ qty: 0.333, unitCost: 10 })).toBe(3.33);
    expect(lineTotals(lines)).toMatchObject({ parts: 72, labour: 180, subtotal: 252, tax: 25.2, total: 277.2, labourHours: 1.5 });
    expect(removeLine(lines, 'a').map((l) => l.id)).toEqual(['b']);
  });

  it('warns when parts use more than is in stock (across lines)', () => {
    const lines: Line[] = [{ ...addMaterial([], filter, 'a')[0], qty: 3 }, { ...addMaterial([], filter, 'b')[0], qty: 2 }, labourLine('c')];
    expect(stockWarnings(lines, { m1: { qty: 4, unit: 'ea' } })).toEqual({ a: 'Only 4 ea in stock', b: 'Only 4 ea in stock' });
    expect(stockWarnings(lines, { m1: { qty: 5 } })).toEqual({});
    expect(stockWarnings(lines, {})).toEqual({});
  });

  it('finds lines that are not ready to save, and cleans them', () => {
    const lines: Line[] = [{ ...otherLine('a'), qty: 0 }, labourLine('b')];
    expect(lineProblems(lines)).toEqual(['Line 1 needs a description.', 'Line 1 needs a quantity above 0.']);
    expect(cleanLines([{ ...otherLine('a'), description: ' Freight ', qty: '2' as unknown as number, unitCost: null as unknown as number }])).toEqual([
      { id: 'a', kind: 'other', description: 'Freight', qty: 2, unit: 'ea', unitCost: 0 },
    ]);
  });
});

describe('changed fields', () => {
  it('sends only what differs; empty values count as none', () => {
    const base = { a: 1, b: [{ x: 1 }], c: '', d: 'same' };
    expect(changedFields(base, { a: 1, b: [{ x: 2 }], c: undefined, d: 'same' })).toEqual({ b: [{ x: 2 }] });
    expect(changedFields(base, { a: 2, d: 'other' }, ['a'])).toEqual({ a: 2 });
    expect(hasChanges(changedFields(base, { ...base }))).toBe(false);
  });
});

describe('requests', () => {
  const statuses = [
    { documentId: 's1', name: 'Pending', color: '#a35bd1', statusCategory: 'todo' as const, indexNum: 10 },
    { documentId: 's2', name: 'Open', color: '#3e63dd', statusCategory: 'todo' as const, indexNum: 20 },
  ];
  const types = [{ documentId: 't1', name: 'Repair/General Request', indexNum: 10 }];
  const priorities = [{ documentId: 'p2', name: 'Non-Urgent – Asset Operational', indexNum: 20 }];
  const who = (accountType: string) => whoFor({ documentId: 'u', systemHeader: { systemType: 'account', templateId: 't' }, accountType });

  it('start Pending for drivers and Open for the workshop, as a non-urgent repair', () => {
    expect(requestDefaults(who('Driver'), { statuses, types, priorities })).toEqual({
      requestStatusRel: [{ documentId: 's1', name: 'Pending', color: '#a35bd1', statusCategory: 'todo', indexNum: 10 }],
      requestTypeRel: [{ documentId: 't1', name: 'Repair/General Request', indexNum: 10 }],
      priorityRel: [{ documentId: 'p2', name: 'Non-Urgent – Asset Operational', indexNum: 20 }],
      disableBooking: 'Auto Disable',
    });
    expect(requestDefaults(who('Technician'), { statuses, types, priorities }).requestStatusRel[0].name).toBe('Open');
    expect(requestDefaults(who('Driver'), {})).toMatchObject({ requestStatusRel: [], requestTypeRel: [] });
    expect(statusValue({ documentId: 'x', name: 'X' })).toEqual({ documentId: 'x', name: 'X' });
  });

  it("go to the asset's workshop", () => {
    expect(workshopOf({ documentId: 'a', name: 'V', assetId: 'V', responsibleWorkshopRel: [{ documentId: 'w', name: 'Alexandria Workshop', indexNum: 20 }] })).toEqual([{ documentId: 'w', name: 'Alexandria Workshop', indexNum: 20 }]);
    expect(workshopOf(undefined)).toEqual([]);
  });

  it('tell their story: raised, stages and comments, in order', () => {
    const timeline = requestTimeline({
      documentId: 'r',
      systemHeader: { systemType: 'document', templateId: 't', createdDate: '2026-11-01T00:00:00Z' },
      requestedByRel: [{ documentId: 'p', name: 'Sofia Russo' }],
      requestStatusRel: [{ documentId: 'c', name: 'Closed' }],
      startedDate: '2026-11-02T00:00:00Z',
      closedDate: '2026-11-04T00:00:00Z',
      notesCommentsArr: [{ dataId: 'n', detail: 'Parts ordered', createdBy: { name: 'Tom Nguyen' }, createdDate: '2026-11-03T00:00:00Z' }],
    });
    expect(timeline.map((e) => [e.title, e.by ?? ''])).toEqual([
      ['Raised', 'Sofia Russo'],
      ['Work started', ''],
      ['Comment', 'Tom Nguyen'],
      ['Closed', ''],
    ]);
  });
});
