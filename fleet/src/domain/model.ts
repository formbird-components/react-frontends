// Constants of the fleet demo (solidjs-components-fleet demo/lib/model.mjs), which its server rules
// also use.

/** System-wide maximum booking length, hours (an asset's own maximum wins). */
export const MAX_BOOKING_HOURS = 72;

/** Workshop rate for labour lines, per hour. */
export const LABOUR_RATE = 120;

/** GST on work orders. */
export const GST = 0.1;

/** The company's time zone (hire days, business hours). */
export const TIME_ZONE = 'Australia/Sydney';

/** Request statuses during which the asset is in the workshop (Unavailable For Hire). */
export const IN_WORKSHOP = ['Drop Off', 'In Progress', 'Work Complete'];

/** Kinds of record (appTags[1]) and lookup kinds this app reads. */
export type RecordKind = 'asset' | 'booking' | 'dailyDriver' | 'request' | 'workOrder' | 'fuelReceipt' | 'location' | 'checkSheet' | 'servicePlan' | 'material';
export type LookupKind =
  | 'assetType' | 'assetStatus' | 'hireStatus' | 'bookingStatus' | 'bookingReason' | 'cancelReason' | 'requestStatus' | 'requestType'
  | 'requestPriority' | 'requestReason' | 'closeReason' | 'workOrderStatus' | 'workOrderType' | 'disposedBy' | 'fuelType' | 'department' | 'pool' | 'licence';
