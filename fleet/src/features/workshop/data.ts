// What the workshop pages read, and moving a request along.

import { useMemo } from 'react';
import { toast } from 'sonner';
import { useLookup } from '@/data/catalog';
import { useSearch, useUpdate } from '@/data/records';
import { useSession } from '@/data/session';
import { first, type Account, type Location, type StatusValue, type WorkOrder, type WorkshopRequest } from '@/domain/types';
import { validateRequest } from '@/domain/validate';
import { fleetQuery } from '@/lib/es';
import { range, term, terms } from '@react-frontends/shared/es';
import { checkMove, DONE, statusOf } from './board';
import { statusValue } from './request';

/** Fields the board and lists show (and the move checks need). */
export const REQUEST_LIST_FIELDS = [
  'documentId', 'systemHeader.summaryName', 'systemHeader.createdDate', 'systemHeader.documentCreatedDate', 'createdDate', 'requestRef', 'requestStatusRel', 'lastStatus', 'priorityRel', 'requestTypeRel', 'requestReasonRel',
  'assetRel', 'workshopRel', 'assignedToRel', 'requestedByRel', 'expectedStartDate', 'expectedCompletionDate', 'deferredBool', 'deferredReason', 'dailyDriverRel',
  'reqDescription', 'downTimeHours', 'closedDate', 'closeReasonRel', 'dropOffDate', 'startedDate', 'workCompleteDate', 'disableBooking',
];

export const WORK_ORDER_LIST_FIELDS = [
  'documentId', 'systemHeader.summaryName', 'systemHeader.createdDate', 'systemHeader.documentCreatedDate', 'createdDate', 'workOrderRef', 'workOrderStatusRel', 'workOrderTypeRel', 'requestRel.documentId', 'requestRel.requestRef',
  'assignedToRel', 'totalCost', 'labourHours', 'estimatedLabourHours', 'onHoldReason', 'completedDate', 'startedDate', 'assetRel',
];

export const WORKSHOP_TYPES = ['Administrator', 'Supervisor', 'Technician'];

/** Requests not closed or cancelled. */
export function useOpenRequests() {
  const request = useMemo(() => fleetQuery('request', { mustNot: [terms('requestStatusRel.name', DONE)], sort: [{ 'systemHeader.documentCreatedDate': 'desc' }] }), []);
  return useSearch<WorkshopRequest>('request', request, { size: 400, include: REQUEST_LIST_FIELDS });
}

/** Requests closed or cancelled in the last `days` days (for the board's done columns and downtime). */
export function useDoneRequests(days = 30, enabled = true) {
  const request = useMemo(
    () => fleetQuery('request', { filter: [terms('requestStatusRel.name', DONE), range('closedDate', { gte: `now-${days}d/d` })], sort: [{ closedDate: 'desc' }] }),
    [days],
  );
  return useSearch<WorkshopRequest>('request', request, { size: 200, include: REQUEST_LIST_FIELDS }, enabled);
}

/** Work orders of some requests. */
export function useWorkOrdersOf(requestIds: string[]) {
  const key = [...requestIds].sort().join(',');
  const request = useMemo(() => (key ? fleetQuery('workOrder', { filter: [terms('requestRel.documentId', key.split(','))], sort: [{ 'systemHeader.documentCreatedDate': 'asc' }] }) : null), [key]);
  return useSearch<WorkOrder>('workOrder', request, { size: 500, include: WORK_ORDER_LIST_FIELDS });
}

/** The workshops (locations of type Workshop). */
export function useWorkshops() {
  const request = useMemo(() => fleetQuery('location', { filter: [term('locationType', 'Workshop')], mustNot: [term('inactiveBool', true)], sort: [{ indexNum: 'asc' }] }), []);
  const result = useSearch<Location>('location', request, { size: 50, include: ['documentId', 'nameId', 'systemHeader.summaryName', 'indexNum'] });
  return { ...result, workshops: (result.data?.documents ?? []).map((l) => ({ documentId: l.documentId, name: l.nameId ?? l.systemHeader?.summaryName ?? '', ...(l.indexNum !== undefined ? { indexNum: l.indexNum as number } : {}) })) };
}

/** Workshop staff (who requests and work orders are assigned to). */
export function useWorkshopStaff() {
  const request = useMemo(
    () => ({ sort: [{ 'systemHeader.summaryName': 'asc' }], query: { bool: { filter: [term('systemHeader.systemType', 'account'), terms('accountType', WORKSHOP_TYPES)], must_not: [term('inactiveBool', true)] } } }),
    [],
  );
  const result = useSearch<Account>('any', request, { size: 100, include: ['documentId', 'systemHeader.summaryName', 'email', 'accountType', 'jobTitle'] });
  return { ...result, staff: result.data?.documents ?? [] };
}

/** A request status value by name, once the statuses are loaded. */
export function useRequestStatuses() {
  const { data } = useLookup('requestStatus');
  return useMemo(() => {
    const byName = new Map((data ?? []).map((s) => [s.name, statusValue(s)]));
    return { list: data ?? [], get: (name: string): StatusValue | undefined => byName.get(name) };
  }, [data]);
}

/**
 * Moves a request to a status, with what the move needs (a close reason, an assignee…): checks it
 * the way the server will, saves the status and the extra fields, and says how it went.
 */
export function useMoveRequest() {
  const { who } = useSession();
  const statuses = useRequestStatuses();
  const update = useUpdate<WorkshopRequest>('request');
  const move = async (r: WorkshopRequest, to: string, extra: Partial<WorkshopRequest> = {}, openWorkOrders: string[] = []): Promise<WorkshopRequest | undefined> => {
    const status = statuses.get(to);
    const check = checkMove({ ...r, ...extra }, to, who, openWorkOrders);
    const message = !status ? 'The request statuses are still loading. Try again in a moment.' : !check.ok ? check.reason : validateRequest({ ...r, ...extra, lastStatus: statusOf(r), requestStatusRel: [status] }, who);
    if (message) {
      toast.error(message);
      return undefined;
    }
    try {
      const saved = await update.mutateAsync({ documentId: r.documentId, fields: { ...extra, requestStatusRel: [status] } });
      const asset = first(r.assetRel)?.assetId;
      toast.success(`${r.requestRef ?? 'Request'} is ${to === 'Closed' || to === 'Cancelled' ? to.toLowerCase() : `now ${to}`}`, { description: asset ? `${asset} · ${first(r.requestTypeRel)?.name ?? ''}` : undefined });
      return saved;
    } catch (error) {
      toast.error((error as Error).message);
      return undefined;
    }
  };
  return { move, pending: update.isPending };
}
