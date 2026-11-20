import { describe, expect, it } from 'vitest';
import type { WorkshopRequest } from '@/domain/types';
import { whoFor } from '@/domain/workflow';
import { ageInDays, applyMoves, boardColumns, checkMove, compareForBoard, filterRequests, groupByStatus, movesFor, NON_URGENT, primaryMove, URGENT, workOrderCounts, workshopFigures } from './board';

const who = (accountType: string, id = 'me') => whoFor({ documentId: id, systemHeader: { systemType: 'account', templateId: 't' }, accountType });
const driver = who('Driver');
const tech = who('Technician');
const supervisor = who('Supervisor');

let n = 0;
const req = (status: string, extra: Partial<WorkshopRequest> = {}): WorkshopRequest => {
  n++;
  return {
    documentId: `r${n}`,
    systemHeader: { systemType: 'document', templateId: 't', createdDate: '2026-11-01T00:00:00Z', summaryName: `REQ-${n}: V-20${n} Repair` },
    requestRef: `REQ-${n}`,
    requestStatusRel: [{ documentId: status, name: status }],
    priorityRel: [{ documentId: 'p', name: NON_URGENT }],
    assetRel: [{ documentId: `a${n}`, name: `V-20${n} · Toyota HiAce`, assetId: `V-20${n}` }],
    ...extra,
  };
};

describe('board columns and grouping', () => {
  it('hides closed and cancelled unless asked', () => {
    expect(boardColumns(false)).toEqual(['Pending', 'Open', 'Drop Off', 'In Progress', 'Work Complete', 'Pick Up']);
    expect(boardColumns(true)).toContain('Closed');
    expect(boardColumns(true)).toContain('Cancelled');
  });

  it('groups by status: urgent first, deferred last, then expected start, then oldest', () => {
    const late = req('Open', { expectedStartDate: '2026-11-09T00:00:00Z' });
    const early = req('Open', { expectedStartDate: '2026-11-02T00:00:00Z' });
    const urgent = req('Open', { priorityRel: [{ documentId: 'u', name: URGENT }] });
    const deferred = req('Open', { deferredBool: true, deferredReason: 'Parts', priorityRel: [{ documentId: 'u', name: URGENT }] });
    const unscheduled = req('Open');
    const groups = groupByStatus([late, unscheduled, deferred, early, urgent, req('Pending'), req('Mystery')], boardColumns(false));
    expect(groups.Open.map((r) => r.documentId)).toEqual([urgent, deferred, early, late, unscheduled].map((r) => r.documentId));
    expect(groups.Pending).toHaveLength(1);
    expect(Object.values(groups).flat()).toHaveLength(6);
    expect(compareForBoard(early, early)).toBe(0);
  });

  it('counts work orders and lists the open ones', () => {
    const counts = workOrderCounts([
      { requestRel: [{ documentId: 'r1', name: 'x' }], workOrderStatusRel: [{ documentId: 'c', name: 'Complete' }], workOrderRef: 'WO-1' },
      { requestRel: [{ documentId: 'r1', name: 'x' }], workOrderStatusRel: [{ documentId: 'h', name: 'On Hold' }], workOrderRef: 'WO-2' },
      { requestRel: [], workOrderStatusRel: [], workOrderRef: 'WO-3' },
    ]);
    expect(counts.get('r1')).toEqual({ total: 2, done: 1, open: ['WO-2'] });
    expect(counts.size).toBe(1);
  });
});

describe('filters', () => {
  const a = req('Open', { workshopRel: [{ documentId: 'alx', name: 'Alexandria Workshop' }], assignedToRel: [{ documentId: 'tom', name: 'Tom Nguyen' }], reqDescription: 'Grinding brakes' });
  const b = req('Pending', { workshopRel: [{ documentId: 'wpw', name: 'Wetherill Park Workshop' }], priorityRel: [{ documentId: 'u', name: URGENT }] });
  const list = [a, b];

  it('by workshop, assignee, unassigned and mine', () => {
    expect(filterRequests(list, { workshop: 'wpw' })).toEqual([b]);
    expect(filterRequests(list, { assignee: 'tom' })).toEqual([a]);
    expect(filterRequests(list, { assignee: 'none' })).toEqual([b]);
    expect(filterRequests(list, { mine: true }, 'tom')).toEqual([a]);
    expect(filterRequests(list, { mine: true })).toEqual([]);
  });

  it('by priority and by every typed word, anywhere on the request', () => {
    expect(filterRequests(list, { priority: 'urgent' })).toEqual([b]);
    expect(filterRequests(list, { priority: 'routine' })).toEqual([a]);
    expect(filterRequests(list, { text: 'brakes tom' })).toEqual([a]);
    expect(filterRequests(list, { text: a.requestRef!.toLowerCase() })).toEqual([a]);
    expect(filterRequests(list, { text: 'brakes jack' })).toEqual([]);
    expect(filterRequests(list, {})).toEqual(list);
  });
});

describe('figures', () => {
  it('counts open, urgent, triage, in the workshop, late, and averages downtime', () => {
    const now = new Date('2026-11-10T00:00:00Z').getTime();
    const figures = workshopFigures(
      [
        req('Pending', { priorityRel: [{ documentId: 'u', name: URGENT }] }),
        req('In Progress', { expectedCompletionDate: '2026-11-08T00:00:00Z' }),
        req('Work Complete', { expectedCompletionDate: '2026-11-08T00:00:00Z' }),
        req('Closed'),
      ],
      [req('Closed', { downTimeHours: 10 }), req('Closed', { downTimeHours: 5 }), req('Cancelled', { downTimeHours: 99 }), req('Closed', { downTimeHours: 0 })],
      now,
    );
    expect(figures).toEqual({ open: 3, urgent: 1, triage: 1, inWorkshop: 2, averageDowntime: 7.5, late: 1 });
    expect(workshopFigures([], []).averageDowntime).toBeUndefined();
  });

  it('ages requests in whole days', () => {
    expect(ageInDays(req('Open'), new Date('2026-11-04T12:00:00Z').getTime())).toBe(3);
  });
});

describe('moves', () => {
  it('lets a supervisor triage and the workshop work, as the server does', () => {
    const pending = req('Pending');
    expect(checkMove(pending, 'Open', supervisor)).toEqual({ ok: true, reason: '', need: 'triage' });
    expect(checkMove(pending, 'Open', tech).reason).toBe('Only a workshop supervisor can move a request to Open.');
    expect(checkMove(pending, 'Open', driver).ok).toBe(false);
    expect(checkMove(req('Open'), 'In Progress', tech)).toEqual({ ok: true, reason: '', need: 'none' });
    expect(checkMove(req('Open'), 'In Progress', driver).reason).toBe('Only the workshop can move a request to In Progress.');
  });

  it("refuses moves the workflow doesn't have", () => {
    expect(checkMove(req('Pending'), 'In Progress', supervisor).reason).toBe("A request can't go from Pending to In Progress.");
    expect(checkMove(req('Open'), 'Open', supervisor).ok).toBe(false);
  });

  it('asks for a reason to cancel, and for complete work orders to close', () => {
    expect(checkMove(req('Open'), 'Cancelled', supervisor)).toEqual({ ok: true, reason: '', need: 'cancelReason' });
    expect(checkMove(req('Pick Up'), 'Closed', supervisor)).toEqual({ ok: true, reason: '', need: 'closeDetails' });
    expect(checkMove(req('Pick Up'), 'Closed', supervisor, ['WO-4', 'WO-5']).reason).toBe('Complete WO-4, WO-5 before closing the request.');
  });

  it('refuses a deferred request without a reason', () => {
    expect(checkMove(req('Open', { deferredBool: true }), 'In Progress', tech).reason).toBe('Give the Reason Deferred.');
  });

  it('lists the moves with why not, and picks the usual next one', () => {
    const open = req('Open');
    expect(movesFor(open, tech).map((m) => [m.to, m.ok])).toEqual([
      ['Drop Off', true],
      ['In Progress', true],
      ['Cancelled', false],
    ]);
    expect(primaryMove(open, tech)).toBe('In Progress');
    expect(primaryMove(req('Pending'), tech)).toBeUndefined();
    expect(primaryMove(req('Work Complete'), tech)).toBe('Pick Up');
    expect(primaryMove(req('Pick Up'), supervisor, ['WO-1'])).toBeUndefined();
    expect(primaryMove(req('Closed'), supervisor)).toBeUndefined();
  });
});

describe('moves on the board before search sees them', () => {
  it('show the new status, and settle once search agrees', () => {
    const a = req('Open');
    const b = req('Open');
    const moved = { [a.documentId]: { documentId: 's', name: 'In Progress' }, [b.documentId]: { documentId: 'o', name: 'Open' } };
    const { list, settled } = applyMoves([a, b, req('Pending')], moved);
    expect(list[0].requestStatusRel?.[0].name).toBe('In Progress');
    expect(list[1]).toBe(b);
    expect(settled).toEqual([b.documentId]);
  });
});
