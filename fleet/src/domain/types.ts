// The fleet demo's records, as fieldtec-web stores them (solidjs-components-fleet's data model).
// Related values ("…Rel" fields) are arrays of { documentId, name, …picked fields }.

import type { BaseAccount, Doc } from '@react-frontends/shared/api';

// Documents as fieldtec-web stores them: shared by the apps.
export type { Doc, SystemHeader } from '@react-frontends/shared/api';

export interface Ref {
  documentId: string;
  name: string;
}
export interface StatusValue extends Ref {
  color?: string;
  statusCategory?: 'todo' | 'inprogress' | 'done';
  indexNum?: number;
}
export interface LookupValue extends Ref {
  indexNum?: number;
}
export interface PersonValue extends Ref {
  email?: string | null;
  accountType?: string | null;
}

/** What records store about their asset (fleet's ASSET_VALUE_FIELDS). */
export interface AssetValue extends Ref {
  assetId: string;
  registration?: string | null;
  iconKind?: string | null;
  primaryMeterUnit?: 'km' | 'hours' | null;
  maxBookingHours?: number | null;
  hireRateHourly?: number | null;
  hireRateDaily?: number | null;
  requiredLicence?: string | null;
  responsibleWorkshopRel?: LookupValue[];
  checkSheetRel?: LookupValue[];
  servicePlanRel?: (LookupValue & { weeks?: number; meter?: number; leadWeeks?: number; leadMeter?: number })[];
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: { type: 'Feature'; geometry: { type: string; coordinates: unknown } | null; properties?: Record<string, unknown> }[];
}

export interface Account extends BaseAccount {
  poolsRel?: LookupValue[];
  licencesRel?: LookupValue[];
  licenceExpiryDate?: string;
  departmentRel?: LookupValue[];
  homeLocationRel?: LookupValue[];
  phone?: string;
}

export interface Asset extends Doc {
  assetId: string;
  assetName?: string;
  make?: string;
  model?: string;
  makeModel?: string;
  yearNum?: number;
  registration?: string;
  vin?: string;
  colour?: string;
  iconKind?: string;
  assetClass?: string;
  requiredLicence?: string;
  assetTypeRel?: (LookupValue & { iconKind?: string; assetClass?: string; maxBookingHours?: number; hireRateHourly?: number; hireRateDaily?: number; checkSheetRel?: LookupValue[] })[];
  assetStatusRel?: StatusValue[];
  hireStatusRel?: StatusValue[];
  allocationStatus?: string;
  responsiblePersonRel?: PersonValue[];
  responsibleWorkshopRel?: LookupValue[];
  locationRel?: LookupValue[];
  departmentRel?: LookupValue[];
  poolsRel?: LookupValue[];
  fuelTypeRel?: LookupValue[];
  tankCapacityL?: number;
  rangeKm?: number;
  primaryMeterUnit?: 'km' | 'hours';
  meterReadingNum?: number;
  meterReadingDate?: string;
  servicePlanRel?: AssetValue['servicePlanRel'];
  lastServiceDate?: string;
  lastServiceMeterNum?: number;
  serviceDueDate?: string;
  serviceDueMeterNum?: number;
  serviceWarning?: string;
  regDueDate?: string;
  insuranceDueDate?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  financialClass?: string;
  replacementCycleMonths?: number;
  replacementDueDate?: string;
  bookableBool?: boolean;
  maxBookingHours?: number;
  hireRateHourly?: number;
  hireRateDaily?: number;
  locationGeo?: GeoCollection;
  lastPositionDate?: string;
  includeInMapBool?: boolean;
  trackerSerial?: string;
}

export interface Booking extends Doc {
  bookingRef?: string;
  bookingStatusRel?: StatusValue[];
  lastStatus?: string;
  assetRel?: AssetValue[];
  requestedByRel?: PersonValue[];
  startDate?: string;
  endDate?: string;
  bookingReasonRel?: LookupValue[];
  jobCode?: string;
  destination?: string;
  destinationGeo?: GeoCollection;
  bookingNotes?: string;
  startMeterNum?: number;
  endMeterNum?: number;
  commencedDate?: string;
  closedDate?: string;
  distanceNum?: number;
  hireDurationHours?: number;
  hireCost?: number;
  hireOverdueBool?: boolean;
  cancelReasonRel?: LookupValue[];
}

export interface CheckItem {
  key: string;
  question: string;
  category?: string;
  mandatory?: boolean;
  instruction?: string;
  result?: 'pass' | 'fail' | 'na' | '' | null;
  comment?: string;
  adhoc?: boolean;
}

export interface DailyDriver extends Doc {
  ddRef?: string;
  assetRel?: AssetValue[];
  driverRel?: PersonValue[];
  checkDate?: string;
  meterReadingNum?: number;
  checksArr?: CheckItem[];
  ddResult?: string;
  defectCount?: number;
  defectDescription?: string;
  defectPriorityRel?: LookupValue[];
  serviceRequested?: string;
  inspectionCompleteBool?: boolean;
  meterExcludedBool?: boolean;
  meterExcludedReason?: string;
}

export interface WorkshopRequest extends Doc {
  requestRef?: string;
  requestStatusRel?: StatusValue[];
  lastStatus?: string;
  assetRel?: AssetValue[];
  requestTypeRel?: LookupValue[];
  priorityRel?: LookupValue[];
  requestReasonRel?: LookupValue[];
  reqDescription?: string;
  requestedByRel?: PersonValue[];
  workshopRel?: LookupValue[];
  assignedToRel?: PersonValue[];
  expectedStartDate?: string;
  expectedCompletionDate?: string;
  disableBooking?: string;
  bookingConflicts?: string;
  deferredBool?: boolean;
  deferredReason?: string;
  dropOffDate?: string;
  startedDate?: string;
  workCompleteDate?: string;
  closedDate?: string;
  downTimeHours?: number;
  closeReasonRel?: LookupValue[];
  dailyDriverRel?: Ref[];
}

export interface LineItemValue {
  id: string;
  kind: 'part' | 'labour' | 'other';
  description: string;
  materialRel?: (LookupValue & { partNo?: string })[];
  qty: number;
  unit?: string;
  unitCost: number;
}

export interface WorkOrder extends Doc {
  workOrderRef?: string;
  workOrderStatusRel?: StatusValue[];
  lastStatus?: string;
  requestRel?: (Ref & { requestRef?: string; assetRel?: AssetValue[] })[];
  assetRel?: AssetValue[];
  workOrderTypeRel?: LookupValue[];
  assignedToRel?: PersonValue[];
  estimatedLabourHours?: number;
  serviceChecksArr?: CheckItem[];
  lineItemsArr?: LineItemValue[];
  partsTotal?: number;
  labourTotal?: number;
  labourHours?: number;
  taxTotal?: number;
  totalCost?: number;
  meterAtServiceNum?: number;
  dateAtService?: string;
  workCompleted?: string;
  technicianReport?: string;
  onHoldReason?: string;
  startedDate?: string;
  completedDate?: string;
}

export interface FuelReceipt extends Doc {
  fuelRef?: string;
  assetRel?: AssetValue[];
  driverRel?: PersonValue[];
  fuelDate?: string;
  meterReadingNum?: number;
  litresNum?: number;
  costNum?: number;
  fuelTypeRel?: LookupValue[];
  supplier?: string;
  fuelFlags?: string[];
  fuelFlagsText?: string;
  distanceNum?: number | null;
  consumptionNum?: number | null;
}

export interface Location extends Doc {
  nameId: string;
  code?: string;
  locationType?: 'Depot' | 'Workshop' | 'Office';
  addressGeo?: GeoCollection;
  boundaryGeo?: GeoCollection;
  managerRel?: PersonValue[];
}

export interface CheckSheet extends Doc {
  nameId: string;
  checkItems?: CheckItem[];
}

export interface Material extends Doc {
  nameId: string;
  partNo?: string;
  unit?: string;
  unitCost?: number;
  qtyAvailable?: number;
  reorderThreshold?: number;
  reorderBool?: boolean;
}

/** The first value of a related field. */
export const first = <T>(list: T[] | null | undefined): T | undefined => (Array.isArray(list) && list.length ? list[0] : undefined);
/** The name of a related value (status, lookup), or ''. */
export const nameOf = (list: { name?: string }[] | null | undefined) => first(list)?.name ?? '';
