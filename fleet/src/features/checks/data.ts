// What the Daily Driver pages read.

import { useMemo } from 'react';
import { useRecord, useSearch } from '@/data/records';
import type { CheckSheet, DailyDriver, WorkshopRequest } from '@/domain/types';
import { contains, range, term, type Clause } from '@react-frontends/shared/es';
import { fleetQuery } from '@/lib/es';

export const DD_LIST_FIELDS = [
  'documentId', 'systemHeader.summaryName', 'systemHeader.createdDate', 'ddRef', 'assetRel', 'driverRel', 'checkDate', 'ddResult', 'defectCount', 'meterReadingNum',
  'meterExcludedBool', 'defectPriorityRel', 'defectDescription',
];

export type ChecksTab = 'recent' | 'mine' | 'defects';

/** Daily Drivers, newest first: all, the person's own, or those that found defects. */
export function useChecks(tab: ChecksTab, text: string, meId: string | undefined, size = 50) {
  const request = useMemo(() => {
    const filter: (Clause | undefined)[] = [contains(['ddRef', 'assetRel.name', 'driverRel.name'], text)];
    if (tab === 'mine') filter.push(term('driverRel.documentId', meId ?? '-'));
    if (tab === 'defects') filter.push(range('defectCount', { gt: 0 }));
    return fleetQuery('dailyDriver', { filter, sort: [{ checkDate: 'desc' }] });
  }, [tab, text, meId]);
  return useSearch<DailyDriver>('dailyDriver', request, { size, include: DD_LIST_FIELDS });
}

/** Counts for the figures: checks since a time, and those with defects. */
export function useCheckCounts(since: string) {
  const all = useSearch<DailyDriver>('dailyDriver', useMemo(() => fleetQuery('dailyDriver', { filter: [range('checkDate', { gte: since })] }), [since]), { size: 0 });
  const defects = useSearch<DailyDriver>('dailyDriver', useMemo(() => fleetQuery('dailyDriver', { filter: [range('checkDate', { gte: since }), range('defectCount', { gt: 0 })] }), [since]), { size: 0 });
  const flagged = useSearch<DailyDriver>('dailyDriver', useMemo(() => fleetQuery('dailyDriver', { filter: [range('checkDate', { gte: since }), term('meterExcludedBool', true)] }), [since]), { size: 0 });
  return { all, defects, flagged };
}

/** The last checks on an asset. */
export function useAssetChecks(assetId: string | undefined, size = 1) {
  const request = useMemo(() => (assetId ? fleetQuery('dailyDriver', { filter: [term('assetRel.documentId', assetId)], sort: [{ checkDate: 'desc' }] }) : null), [assetId]);
  return useSearch<DailyDriver>('dailyDriver', request, { size, include: DD_LIST_FIELDS });
}

export const RAISED_FIELDS = ['documentId', 'requestRef', 'requestStatusRel', 'priorityRel', 'requestTypeRel', 'systemHeader.summaryName', 'assignedToRel'];

/** Workshop requests a check raised (the server raises one when a check fails). */
export function useRaisedRequests(ddId: string | undefined) {
  const request = useMemo(() => (ddId ? fleetQuery('request', { filter: [term('dailyDriverRel.documentId', ddId)], sort: [{ 'systemHeader.documentCreatedDate': 'asc' }] }) : null), [ddId]);
  return useSearch<WorkshopRequest>('request', request, { size: 10, include: RAISED_FIELDS });
}

/** A check sheet (its checks). */
export const useCheckSheet = (id: string | undefined) => useRecord<CheckSheet>(id);
