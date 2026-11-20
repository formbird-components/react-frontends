// Related values: what a record stores about another one (fleet's relatedFields).

import type { Account, Asset, AssetValue, LookupValue, PersonValue } from '@/domain/types';

/** An asset as bookings, checks, requests and receipts store it (fleet's ASSET_VALUE_FIELDS). */
export function assetValue(asset: Asset, extra: (keyof Asset)[] = []): AssetValue {
  const value: Record<string, unknown> = {
    documentId: asset.documentId,
    name: asset.systemHeader?.summaryName ?? asset.assetId,
    assetId: asset.assetId,
    registration: asset.registration ?? null,
    iconKind: asset.iconKind ?? null,
    primaryMeterUnit: asset.primaryMeterUnit ?? null,
    maxBookingHours: asset.maxBookingHours ?? null,
    hireRateHourly: asset.hireRateHourly ?? null,
    hireRateDaily: asset.hireRateDaily ?? null,
    requiredLicence: asset.requiredLicence ?? null,
  };
  for (const field of extra) value[field] = asset[field] ?? null;
  return value as unknown as AssetValue;
}

/** Fields to fetch for an asset picker (enough to build its related value and show it). */
export const ASSET_PICK_FIELDS = [
  'documentId', 'systemHeader.summaryName', 'assetId', 'registration', 'iconKind', 'primaryMeterUnit', 'maxBookingHours', 'hireRateHourly', 'hireRateDaily',
  'requiredLicence', 'makeModel', 'make', 'model', 'hireStatusRel', 'assetStatusRel', 'locationRel', 'poolsRel', 'meterReadingNum', 'responsibleWorkshopRel',
  'assetTypeRel', 'servicePlanRel',
];

export const personValue = (account: Account): PersonValue => ({
  documentId: account.documentId,
  name: account.systemHeader?.summaryName ?? account.email ?? '',
  email: account.email ?? null,
  accountType: account.accountType ?? null,
});

export const lookupValue = (value: { documentId: string; name: string; indexNum?: number }): LookupValue => ({
  documentId: value.documentId,
  name: value.name,
  ...(value.indexNum !== undefined ? { indexNum: value.indexNum } : {}),
});
