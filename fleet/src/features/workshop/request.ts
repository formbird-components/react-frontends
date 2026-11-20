// A workshop request's defaults (what fleet's client rules set on a new one) and its history.

import { lookupValue } from '@/data/values';
import { first, type AssetValue, type LookupValue, type StatusValue, type WorkshopRequest } from '@/domain/types';
import type { Who } from '@/domain/workflow';
import { toDate } from '@/domain/logic/time';
import { createdAt, NON_URGENT } from './board';

type Named = { documentId: string; name: string; indexNum?: number; color?: string; statusCategory?: StatusValue['statusCategory'] };

/** A status value as records store it ({ documentId, name, color, statusCategory, indexNum }). */
export const statusValue = (v: Named): StatusValue => ({
  documentId: v.documentId,
  name: v.name,
  ...(v.color ? { color: v.color } : {}),
  ...(v.statusCategory ? { statusCategory: v.statusCategory } : {}),
  ...(v.indexNum !== undefined ? { indexNum: v.indexNum } : {}),
});

const byName = <T extends Named>(list: T[] | undefined, name: string) => list?.find((v) => v.name === name);

/**
 * A new request, as fleet's client rules start one: a Non-Urgent Repair/General Request with booking
 * auto-disabled, Pending for a supervisor to triage, or Open when the workshop raises it.
 */
export function requestDefaults(who: Who, lookups: { statuses?: Named[]; types?: Named[]; priorities?: Named[] }) {
  const status = byName(lookups.statuses, who.isWorkshop ? 'Open' : 'Pending');
  const type = byName(lookups.types, 'Repair/General Request');
  const priority = byName(lookups.priorities, NON_URGENT);
  return {
    requestStatusRel: status ? [statusValue(status)] : [],
    requestTypeRel: type ? [lookupValue(type)] : [],
    priorityRel: priority ? [lookupValue(priority)] : [],
    disableBooking: 'Auto Disable',
  };
}

/** The workshop that looks after an asset (its responsible workshop). */
export const workshopOf = (asset: AssetValue | undefined): LookupValue[] => (asset?.responsibleWorkshopRel?.length ? asset.responsibleWorkshopRel.map(lookupValue) : []);

/** Booking choices while a request is open (fleet's "Disable asset booking"). */
export const DISABLE_BOOKING = [
  { value: 'Auto Disable', label: 'Auto', hint: 'Off hire while it’s in the workshop' },
  { value: 'Disable', label: 'Disable now', hint: 'Off hire from now until the request is done' },
  { value: 'Do Not Disable', label: 'Keep bookable', hint: 'The asset stays available for hire' },
];

export interface TimelineEntry {
  at: string;
  kind: 'raised' | 'stage' | 'note';
  title: string;
  detail?: string;
  by?: string;
}

interface Note {
  dataId?: string;
  detail?: string;
  createdBy?: { documentId?: string; name?: string };
  createdDate?: string;
}

export const notesOf = (r: WorkshopRequest): Note[] => (Array.isArray(r.notesCommentsArr) ? (r.notesCommentsArr as Note[]) : []);

/** What happened to a request, oldest first: raised, each stage the server dated, and comments. */
export function requestTimeline(r: WorkshopRequest): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const created = createdAt(r);
  if (created) entries.push({ at: created, kind: 'raised', title: 'Raised', by: first(r.requestedByRel)?.name });
  const stages: [unknown, string][] = [
    [r.dropOffDate, 'Dropped off'],
    [r.startedDate, 'Work started'],
    [r.workCompleteDate, 'Work complete'],
    [r.pickUpDate, 'Ready for pick up'],
    [r.closedDate, first(r.requestStatusRel)?.name === 'Cancelled' ? 'Cancelled' : 'Closed'],
  ];
  for (const [at, title] of stages) {
    const date = toDate(at);
    if (date) entries.push({ at: date.toISOString(), kind: 'stage', title });
  }
  for (const n of notesOf(r)) {
    if (n.createdDate && n.detail) entries.push({ at: n.createdDate, kind: 'note', title: 'Comment', detail: n.detail, by: n.createdBy?.name });
  }
  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
