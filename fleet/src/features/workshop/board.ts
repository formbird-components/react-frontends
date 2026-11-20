// The workshop board: requests by status, the filters over them, the figures above them, and which
// moves a person may make (fleet's request workflow, as the server enforces it).

import { IN_WORKSHOP } from '@/domain/model';
import { first, nameOf, type StatusValue, type WorkOrder, type WorkshopRequest } from '@/domain/types';
import { validateRequest } from '@/domain/validate';
import { nextStatuses, STATUS_ORDER, type Who } from '@/domain/workflow';
import { toDate } from '@/domain/logic/time';

export const URGENT = 'Urgent – Asset Out of Service';
export const NON_URGENT = 'Non-Urgent – Asset Operational';
/** Statuses the board hides unless asked: the request is over. */
export const DONE = ['Closed', 'Cancelled'];

export const statusOf = (r: Pick<WorkshopRequest, 'requestStatusRel'>) => nameOf(r.requestStatusRel);
export const isUrgent = (r: Pick<WorkshopRequest, 'priorityRel'>) => nameOf(r.priorityRel) === URGENT;
export const isDone = (r: Pick<WorkshopRequest, 'requestStatusRel'>) => DONE.includes(statusOf(r));

/** The board's columns, in workflow order. */
export const boardColumns = (showDone: boolean) => STATUS_ORDER.requestStatus.filter((s) => showDone || !DONE.includes(s));

export interface BoardFilters {
  /** A workshop (location) documentId. */
  workshop?: string;
  /** An assignee's documentId, or "none" for unassigned. */
  assignee?: string;
  priority?: 'urgent' | 'routine' | '';
  /** Typed text: every word must appear somewhere on the request. */
  text?: string;
  /** Only what is assigned to the signed-in person. */
  mine?: boolean;
}

/** The words a request can be found by. */
function haystack(r: WorkshopRequest): string {
  const asset = first(r.assetRel);
  return [
    r.requestRef,
    r.systemHeader?.summaryName,
    asset?.assetId,
    asset?.name,
    asset?.registration,
    nameOf(r.requestTypeRel),
    nameOf(r.requestReasonRel),
    nameOf(r.requestedByRel),
    nameOf(r.assignedToRel),
    r.reqDescription,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** The requests that pass the filters. */
export function filterRequests(list: WorkshopRequest[], f: BoardFilters, meId?: string): WorkshopRequest[] {
  const words = (f.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((r) => {
    if (f.workshop && first(r.workshopRel)?.documentId !== f.workshop) return false;
    const assignee = first(r.assignedToRel)?.documentId;
    if (f.assignee === 'none' ? !!assignee : f.assignee && assignee !== f.assignee) return false;
    if (f.mine && (!meId || assignee !== meId)) return false;
    if (f.priority === 'urgent' && !isUrgent(r)) return false;
    if (f.priority === 'routine' && isUrgent(r)) return false;
    if (words.length) {
      const text = haystack(r);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

const time = (value: unknown) => toDate(value)?.getTime();
/**
 * When a record was first saved. systemHeader.createdDate is the current version's date (fieldtec-web
 * versions every save); documentCreatedDate, or the record's own createdDate, is the first one.
 */
export const createdAt = (d: { systemHeader?: unknown; createdDate?: unknown }): string | undefined => {
  const header = (d.systemHeader ?? {}) as { documentCreatedDate?: string; createdDate?: string };
  return header.documentCreatedDate ?? (typeof d.createdDate === 'string' ? d.createdDate : undefined) ?? header.createdDate;
};
const createdOf = (r: WorkshopRequest) => time(createdAt(r)) ?? 0;

/** Board order within a column: urgent first, deferred last, then by expected start, then oldest first. */
export function compareForBoard(a: WorkshopRequest, b: WorkshopRequest): number {
  if (isUrgent(a) !== isUrgent(b)) return isUrgent(a) ? -1 : 1;
  if (!!a.deferredBool !== !!b.deferredBool) return a.deferredBool ? 1 : -1;
  const sa = time(a.expectedStartDate);
  const sb = time(b.expectedStartDate);
  if (sa !== sb) {
    if (sa === undefined) return 1;
    if (sb === undefined) return -1;
    return sa - sb;
  }
  return createdOf(a) - createdOf(b);
}

/** Requests by status name, each column sorted for the board. Unknown statuses are left out. */
export function groupByStatus(list: WorkshopRequest[], columns: string[]): Record<string, WorkshopRequest[]> {
  const groups: Record<string, WorkshopRequest[]> = Object.fromEntries(columns.map((c) => [c, []]));
  for (const r of list) groups[statusOf(r)]?.push(r);
  for (const c of columns) groups[c].sort(compareForBoard);
  return groups;
}

/** Work orders per request: how many, and how many are complete. */
export function workOrderCounts(workOrders: Pick<WorkOrder, 'requestRel' | 'workOrderStatusRel' | 'workOrderRef'>[]) {
  const counts = new Map<string, { total: number; done: number; open: string[] }>();
  for (const w of workOrders) {
    const id = first(w.requestRel)?.documentId;
    if (!id) continue;
    const c = counts.get(id) ?? { total: 0, done: 0, open: [] };
    c.total++;
    if (nameOf(w.workOrderStatusRel) === 'Complete') c.done++;
    else c.open.push(w.workOrderRef ?? 'a work order');
    counts.set(id, c);
  }
  return counts;
}

export interface WorkshopFigures {
  /** Not closed or cancelled. */
  open: number;
  /** Open and urgent. */
  urgent: number;
  /** Pending: waiting for a supervisor. */
  triage: number;
  /** Drop Off, In Progress, Work Complete: the asset is off hire. */
  inWorkshop: number;
  /** Mean downtime of the closed requests given, hours (undefined: none). */
  averageDowntime?: number;
  /** Open, past their expected completion. */
  late: number;
}

/** The figures above the board, from the open requests and some recently closed ones. */
export function workshopFigures(active: WorkshopRequest[], closed: WorkshopRequest[] = [], now = Date.now()): WorkshopFigures {
  const open = active.filter((r) => !isDone(r));
  const downtimes = closed.filter((r) => statusOf(r) === 'Closed' && typeof r.downTimeHours === 'number' && r.downTimeHours > 0).map((r) => r.downTimeHours as number);
  return {
    open: open.length,
    urgent: open.filter(isUrgent).length,
    triage: open.filter((r) => statusOf(r) === 'Pending').length,
    inWorkshop: open.filter((r) => IN_WORKSHOP.includes(statusOf(r))).length,
    averageDowntime: downtimes.length ? Math.round((downtimes.reduce((a, b) => a + b, 0) / downtimes.length) * 10) / 10 : undefined,
    late: open.filter((r) => {
      const end = time(r.expectedCompletionDate);
      return end !== undefined && end < now && !['Work Complete', 'Pick Up'].includes(statusOf(r));
    }).length,
  };
}

// ------------------------------------------------------------------------------------------------
// Moves
// ------------------------------------------------------------------------------------------------

/** What a move needs from the person before it can be saved. */
export type MoveNeed = 'cancelReason' | 'closeDetails' | 'triage' | 'none';

export interface MoveCheck {
  /** The person may make this move now. */
  ok: boolean;
  /** Why not (the server's words where it has them). */
  reason: string;
  need: MoveNeed;
}

/**
 * Whether the person may move a request to a status, and what the move needs. Runs the server's
 * validation (validateRequest) with the need met, so a refusal is about the move itself.
 * @param openWorkOrders - References of the request's work orders that aren't complete (closing needs none)
 */
export function checkMove(r: WorkshopRequest, to: string, who: Who, openWorkOrders: string[] = []): MoveCheck {
  const from = statusOf(r);
  if (from === to) return { ok: false, reason: `Already ${to}.`, need: 'none' };
  if (!nextStatuses('requestStatus', from).includes(to)) return { ok: false, reason: `A request can't go from ${from} to ${to}.`, need: 'none' };
  const need: MoveNeed = to === 'Cancelled' ? 'cancelReason' : to === 'Closed' ? 'closeDetails' : from === 'Pending' && to === 'Open' ? 'triage' : 'none';
  const placeholder = [{ documentId: '-', name: '-' }];
  const message = validateRequest(
    { ...r, lastStatus: from, requestStatusRel: [{ documentId: to, name: to }], closeReasonRel: to === 'Cancelled' ? placeholder : r.closeReasonRel },
    who,
  );
  if (message) return { ok: false, reason: message, need };
  if (to === 'Closed' && openWorkOrders.length) return { ok: false, reason: `Complete ${openWorkOrders.join(', ')} before closing the request.`, need };
  return { ok: true, reason: '', need };
}

/** The moves a person may make from a request's status (allowed or not, with why). */
export function movesFor(r: WorkshopRequest, who: Who, openWorkOrders: string[] = []): ({ to: string } & MoveCheck)[] {
  return nextStatuses('requestStatus', statusOf(r)).map((to) => ({ to, ...checkMove(r, to, who, openWorkOrders) }));
}

/** A move as an action: "Start work", "Close"… */
export function moveLabel(from: string, to: string): string {
  if (to === 'Open') return from === 'Pending' ? 'Triage and open' : 'Back to Open';
  if (to === 'Drop Off') return 'Drop off';
  if (to === 'In Progress') return from === 'Work Complete' ? 'Reopen work' : 'Start work';
  if (to === 'Work Complete') return 'Work complete';
  if (to === 'Pick Up') return 'Ready for pick up';
  if (to === 'Closed') return 'Close request';
  if (to === 'Cancelled') return 'Cancel request';
  if (to === 'Pending') return 'Reopen for triage';
  return to;
}

/** The move a status usually takes next (the primary button), if the person may make it. */
export function primaryMove(r: WorkshopRequest, who: Who, openWorkOrders: string[] = []): string | undefined {
  const order: Record<string, string[]> = {
    Pending: ['Open'],
    Open: ['In Progress', 'Drop Off'],
    'Drop Off': ['In Progress'],
    'In Progress': ['Work Complete'],
    'Work Complete': ['Pick Up', 'Closed'],
    'Pick Up': ['Closed'],
    Cancelled: ['Pending'],
  };
  return (order[statusOf(r)] ?? []).find((to) => checkMove(r, to, who, openWorkOrders).ok);
}

/** Whole days since a request was raised. */
export function ageInDays(r: WorkshopRequest, now = Date.now()): number {
  const created = createdOf(r);
  return created ? Math.max(0, Math.floor((now - created) / 86_400_000)) : 0;
}

/**
 * Moves made on the board but not yet seen by search (Elasticsearch lags a save by about a second):
 * the request shows in its new column meanwhile. Overrides search already agrees with are dropped.
 */
export function applyMoves<T extends WorkshopRequest>(list: T[], moves: Record<string, StatusValue>): { list: T[]; settled: string[] } {
  const settled: string[] = [];
  const out = list.map((r) => {
    const moved = moves[r.documentId];
    if (!moved) return r;
    if (statusOf(r) === moved.name) {
      settled.push(r.documentId);
      return r;
    }
    return { ...r, requestStatusRel: [moved] };
  });
  return { list: out, settled };
}
