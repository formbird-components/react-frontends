// Whether an asset can be booked for a period, and by whom: the checks fleet's PreSaveServer rules
// make (ruleAssetAvailable, rulePoolsAndLicence, ruleConflicts), run in the app first so the person
// sees the reason before saving, in the server's words. Pure: no React.

import { clashes } from '@/domain/logic/calendar';
import { first, nameOf, type Asset, type LookupValue } from '@/domain/types';
import { formatDateTime } from '@react-frontends/shared/format';
import type { Item } from './model';

/** The booking reason that may use an asset in the workshop (ruleAssetAvailable, ruleConflicts). */
export const MAINTENANCE = 'Maintenance';

/** Road licences from lowest to highest: a higher class covers the lower ones. */
export const ROAD_LICENCES = ['C', 'LR', 'MR', 'HR', 'HC', 'MC'];

export interface PeriodCheck {
  /** Items that clash (the first is the one the server names). */
  clashes: Item[];
  /** The server's message for the first clash, or ''. */
  message: string;
}

/**
 * What a booking of an asset for a period clashes with: reserved and commenced bookings, a hire not
 * returned yet (it blocks the next 24 hours), and workshop block-outs (not for Maintenance).
 * @param items - The asset's items
 * @param start - Period start (ms)
 * @param end - Period end (ms)
 * @param o - The asset's fleet ID (for the message), a booking to leave out, the booking's reason
 */
export function checkPeriod(items: Item[] | undefined, start: number, end: number, o: { assetId: string; ignoreId?: string; reason?: string }): PeriodCheck {
  if (!(end > start)) return { clashes: [], message: '' };
  const maintenance = o.reason === MAINTENANCE;
  const candidates = (items ?? []).filter((item) => item.active && (item.kind === 'booking' || !maintenance));
  // The server looks at bookings first, then the workshop.
  const found = clashes(candidates, start, end, o.ignoreId).sort((a, b) => (a.kind === b.kind ? a.start - b.start : a.kind === 'booking' ? -1 : 1));
  return { clashes: found, message: found.length ? clashMessage(found[0], o.assetId) : '' };
}

/** The server's words for a clash. */
export function clashMessage(item: Item, assetId: string): string {
  const who = item.person || 'someone';
  if (item.kind === 'block') return `${assetId} is booked into the workshop then (${item.ref}, ${item.status}).`;
  if (item.overdue) return `${assetId} hasn't been returned from ${item.ref} (${who}, due back ${formatDateTime(item.end)}).`;
  return `${assetId} is already booked then: ${item.ref} (${who}, ${formatDateTime(item.start)} – ${formatDateTime(item.end)}).`;
}

/** A short note for a clash, for lists and pickers ("Booked: BK-12, Tom Nguyen"). */
export function clashNote(item: Item): string {
  if (item.kind === 'block') return `In the workshop (${item.ref}, ${item.status})`;
  if (item.overdue) return `Not back from ${item.ref}${item.person ? ` (${item.person})` : ''}`;
  return `Booked: ${item.ref}${item.person ? `, ${item.person}` : ''}`;
}

/**
 * Why an asset can't be booked at all, in the server's words (ruleAssetAvailable), or ''.
 * @param asset - The asset (status, bookable, hire status)
 * @param reason - The booking's reason: Maintenance may use an asset in the workshop
 */
export function assetProblem(asset: Pick<Asset, 'assetId' | 'assetStatusRel' | 'bookableBool' | 'hireStatusRel'>, reason?: string): string {
  const status = nameOf(asset.assetStatusRel);
  if (status !== 'Active' || asset.bookableBool === false) return `${asset.assetId} can't be booked: it is ${status || 'not bookable'}.`;
  if (nameOf(asset.hireStatusRel) === 'Unavailable For Hire' && reason !== MAINTENANCE) return `${asset.assetId} is Unavailable For Hire (in the workshop or tagged out).`;
  return '';
}

/** Whether held licences cover the one an asset needs (a higher road licence covers a lower one). */
export function licenceCovers(held: string[], needed: string | null | undefined): boolean {
  if (!needed) return true;
  return held.some((h) => h === needed || (ROAD_LICENCES.includes(h) && ROAD_LICENCES.includes(needed) && ROAD_LICENCES.indexOf(h) >= ROAD_LICENCES.indexOf(needed)));
}

/** The person booking, as far as the pool and licence checks need. */
export interface Booker {
  name: string;
  poolsRel?: LookupValue[];
  licencesRel?: LookupValue[];
  licenceExpiryDate?: string;
}

/**
 * Why a person may not book an asset, in the server's words (rulePoolsAndLicence), or ''. Asset
 * managers are exempt (the server skips this check for them).
 * @param person - Their pools, licences and licence expiry
 * @param asset - The asset's pools and required licence
 * @param end - When the booking ends (the licence must last until then)
 */
export function bookerProblem(person: Booker, asset: Pick<Asset, 'assetId' | 'poolsRel' | 'requiredLicence'>, end?: string | number): string {
  const name = person.name || 'This person';
  const personPools = (person.poolsRel ?? []).map((p) => p.documentId);
  if (!(asset.poolsRel ?? []).some((p) => personPools.includes(p.documentId))) return `${name} isn't in a vehicle hire pool that has ${asset.assetId}.`;
  const needed = asset.requiredLicence;
  if (!needed) return '';
  if (!licenceCovers((person.licencesRel ?? []).map((l) => l.name), needed)) return `${name} needs a ${needed} licence or ticket to book ${asset.assetId}.`;
  const expiry = person.licenceExpiryDate ? new Date(person.licenceExpiryDate).getTime() : NaN;
  if (end !== undefined && Number.isFinite(expiry) && expiry < new Date(end).getTime()) return `${name}'s licence expires before the booking ends.`;
  return '';
}

/** A short reason an asset is greyed out for a person in a picker (pool or licence), or undefined. */
export function pickerBlock(person: Booker, asset: Pick<Asset, 'assetId' | 'poolsRel' | 'requiredLicence'>): string | undefined {
  const personPools = (person.poolsRel ?? []).map((p) => p.documentId);
  if (!(asset.poolsRel ?? []).some((p) => personPools.includes(p.documentId))) return `Not in your vehicle hire pools (${nameOf(asset.poolsRel) || 'no pool'})`;
  if (!licenceCovers((person.licencesRel ?? []).map((l) => l.name), asset.requiredLicence)) return `Needs a ${asset.requiredLicence} licence or ticket`;
  return undefined;
}

/** First pool name of an asset, for notes. */
export const poolName = (asset: Pick<Asset, 'poolsRel'>) => first(asset.poolsRel)?.name ?? '';
