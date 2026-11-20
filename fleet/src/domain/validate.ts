// What makes a record invalid: fleet's rulesets check exactly this on the server (PreSaveServer), so
// the app checks it first and shows the reason. (fieldtec-web answers a refused update with a
// generic error.) Each returns a message, or '' when the record is fine. Messages match the server's.

import { bookingTimeProblems } from './logic/booking';
import { checklistOutcome } from './logic/checklist';
import { meterProblems } from './logic/meter';
import { MAX_BOOKING_HOURS } from './model';
import { first, nameOf, type Asset, type Booking, type DailyDriver, type WorkOrder, type WorkshopRequest } from './types';
import { allowedMove, type Who } from './workflow';

const empty = (value: unknown) => value === null || value === undefined || value === '';
const has = (list: unknown[] | null | undefined) => Array.isArray(list) && list.length > 0;

export function validateBooking(d: Partial<Booking>, who: Who): string {
  const status = nameOf(d.bookingStatusRel);
  const from = d.lastStatus ?? '';
  if (!from && status !== 'Asset Reserved') return 'A new booking starts as Asset Reserved.';
  if (!allowedMove('bookingStatus', from, status)) return `A booking can't go from ${from} to ${status}.`;
  const asset = first(d.assetRel);
  if (!asset?.documentId) return 'Choose the asset to book.';
  if (status === 'Asset Reserved') {
    let problems = bookingTimeProblems({ start: d.startDate, end: d.endDate, maxHours: asset.maxBookingHours, defaultMaxHours: MAX_BOOKING_HOURS });
    if (who.isManager) problems = problems.filter((p) => !p.includes('at most'));
    if (problems.length) return problems.join(' ');
  }
  if ((status === 'Hire Commenced' || status === 'Closed') && empty(d.startMeterNum)) return 'Enter the meter reading at the start of the hire.';
  if (status === 'Closed') {
    if (empty(d.endMeterNum)) return 'Enter the meter reading at the end of the hire.';
    const meter = meterProblems({ reading: d.endMeterNum, minimum: d.startMeterNum, unit: asset.primaryMeterUnit ?? undefined });
    if (meter.length) return meter.join(' ');
  }
  if (status === 'Cancelled' && !has(d.cancelReasonRel)) return 'Choose a Reason For Cancellation.';
  return '';
}

export function validateRequest(d: Partial<WorkshopRequest>, who: Who): string {
  const status = nameOf(d.requestStatusRel);
  const from = d.lastStatus ?? '';
  if (!from && status !== 'Pending' && !(status === 'Open' && who.isWorkshop)) {
    return who.isWorkshop ? 'A new request starts as Pending or Open.' : 'A new request starts as Pending, for a workshop supervisor to triage.';
  }
  if (!allowedMove('requestStatus', from, status)) return `A request can't go from ${from} to ${status}.`;
  if (from && from !== status) {
    const supervisorOnly = ['Open', 'Closed', 'Cancelled', 'Pending'].includes(status);
    if (supervisorOnly ? !who.isSupervisor : !who.isWorkshop) return `Only ${supervisorOnly ? 'a workshop supervisor' : 'the workshop'} can move a request to ${status}.`;
  }
  if (status === 'Cancelled' && !has(d.closeReasonRel)) return 'Choose a Reason For Closing.';
  if (d.deferredBool && !d.deferredReason) return 'Give the Reason Deferred.';
  return '';
}

export function validateWorkOrder(d: Partial<WorkOrder>, who: Who): string {
  if (!has(d.requestRel)) return 'Choose the request this work order is for.';
  const status = nameOf(d.workOrderStatusRel);
  const from = d.lastStatus ?? '';
  if (!from && !who.isWorkshop) return 'Only the workshop raises work orders.';
  if (!from && status !== 'New' && status !== 'In Progress') return 'A new work order starts as New or In Progress.';
  if (!allowedMove('workOrderStatus', from, status)) return `A work order can't go from ${from} to ${status}.`;
  if (from && from !== status && !who.isWorkshop) return `Only the workshop can move a work order to ${status}.`;
  if (from === 'Complete' && status !== 'Complete' && !who.isSupervisor) return 'Only a workshop supervisor can reopen a completed work order.';
  if (status === 'On Hold' && !d.onHoldReason) return 'Give the Reason On Hold.';
  if (status !== 'Complete') return '';
  if (!d.workCompleted) return 'Describe the Work Completed.';
  if (nameOf(d.workOrderTypeRel) === 'PM Service') {
    if (!d.dateAtService || empty(d.meterAtServiceNum)) return 'A PM Service needs the Date at Service and the Meter at Service.';
    const outcome = checklistOutcome(d.serviceChecksArr, { commentOnFail: true });
    if (outcome.total && outcome.answered < outcome.total) return `Answer every service check (${outcome.total - outcome.answered} left).`;
    if (outcome.failsWithoutComment.length) return `Say what is wrong with: ${outcome.failsWithoutComment.join(', ')}.`;
  }
  return '';
}

export function validateAsset(d: Partial<Asset> & { disposedByRel?: unknown[]; lastStatus?: string }, who: Who): string {
  const from = d.lastStatus ?? '';
  const to = nameOf(d.assetStatusRel);
  if (!from && to !== 'Commission' && !(to === 'Active' && who.isManager)) return 'A new asset starts as Commission.';
  if (from && from !== to && !who.isManager) return `Only an Asset Manager can move an asset from ${from} to ${to}.`;
  if (!allowedMove('assetStatus', from, to)) return `An asset can't go from ${from} to ${to}.`;
  if (to === 'Disposed' && !has(d.disposedByRel)) return 'Choose how the asset was disposed of (Disposed By).';
  if (d.allocationStatus !== 'Unassigned' && !has(d.responsiblePersonRel)) return 'Choose a Responsible Person, or set the allocation to Unassigned.';
  return '';
}

export function validateDailyDriver(d: Partial<DailyDriver>): string {
  const outcome = checklistOutcome(d.checksArr, { commentOnFail: true });
  if (!outcome.total) return 'There are no checks to answer: choose the asset first.';
  if (outcome.missingMandatory.length) return `Mandatory Check Not Completed: ${outcome.missingMandatory.join(', ')}.`;
  if (outcome.failsWithoutComment.length) return `Say what is wrong with: ${outcome.failsWithoutComment.join(', ')}.`;
  if (outcome.failed) {
    if (!d.defectDescription) return 'Describe the defect.';
    if (!has(d.defectPriorityRel)) return 'Choose the defect priority.';
    if (!d.inspectionCompleteBool) return 'Tick Defect Inspection Complete to submit.';
  }
  return '';
}
