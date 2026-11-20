import { describe, expect, it } from 'vitest';
import { validateAsset, validateBooking, validateDailyDriver, validateRequest, validateWorkOrder } from '../validate';
import { whoFor } from '../workflow';

const status = (name: string) => [{ documentId: name, name }];
const driver = whoFor({ documentId: 'u1', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Driver' });
const manager = whoFor({ documentId: 'u2', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Asset Manager' });
const tech = whoFor({ documentId: 'u3', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Technician' });
const supervisor = whoFor({ documentId: 'u4', systemHeader: { systemType: 'account', templateId: 't' }, accountType: 'Supervisor' });
const asset = [{ documentId: 'a', name: 'V-101', assetId: 'V-101', maxBookingHours: 24, primaryMeterUnit: 'km' as const }];
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

describe('bookings', () => {
  it('start as Asset Reserved, with an asset and valid times', () => {
    expect(validateBooking({ bookingStatusRel: status('Hire Commenced'), assetRel: asset }, driver)).toBe('A new booking starts as Asset Reserved.');
    expect(validateBooking({ bookingStatusRel: status('Asset Reserved') }, driver)).toBe('Choose the asset to book.');
    expect(validateBooking({ bookingStatusRel: status('Asset Reserved'), assetRel: asset, startDate: at(2), endDate: at(4) }, driver)).toBe('');
  });

  it("can't be longer than the asset allows, unless a manager books it", () => {
    const long = { bookingStatusRel: status('Asset Reserved'), assetRel: asset, startDate: at(2), endDate: at(40) };
    expect(validateBooking(long, driver)).toMatch(/at most 24 hours/);
    expect(validateBooking(long, manager)).toBe('');
  });

  it('need meters to start and close, and a reason to cancel', () => {
    const base = { assetRel: asset, startDate: at(-2), endDate: at(2) };
    expect(validateBooking({ ...base, lastStatus: 'Asset Reserved', bookingStatusRel: status('Hire Commenced') }, driver)).toBe('Enter the meter reading at the start of the hire.');
    expect(validateBooking({ ...base, lastStatus: 'Hire Commenced', bookingStatusRel: status('Closed'), startMeterNum: 1000, endMeterNum: 900 }, driver)).toMatch(/lower than/i);
    expect(validateBooking({ ...base, lastStatus: 'Asset Reserved', bookingStatusRel: status('Cancelled') }, driver)).toBe('Choose a Reason For Cancellation.');
    expect(validateBooking({ ...base, lastStatus: 'Asset Reserved', bookingStatusRel: status('Closed') }, driver)).toMatch(/can't go from Asset Reserved to Closed/);
  });
});

describe('workshop requests and work orders', () => {
  it('start as Pending, or Open when the workshop raises them', () => {
    expect(validateRequest({ requestStatusRel: status('Open') }, driver)).toBe('A new request starts as Pending, for a workshop supervisor to triage.');
    expect(validateRequest({ requestStatusRel: status('Open') }, tech)).toBe('');
  });

  it('are triaged and closed by supervisors only', () => {
    expect(validateRequest({ lastStatus: 'Pending', requestStatusRel: status('Open') }, tech)).toBe('Only a workshop supervisor can move a request to Open.');
    expect(validateRequest({ lastStatus: 'Pending', requestStatusRel: status('Open') }, supervisor)).toBe('');
    expect(validateRequest({ lastStatus: 'Open', requestStatusRel: status('In Progress') }, driver)).toBe('Only the workshop can move a request to In Progress.');
  });

  it('complete a PM Service only with its checks and meter', () => {
    const wo = { requestRel: [{ documentId: 'r', name: 'REQ-1' }], lastStatus: 'In Progress', workOrderStatusRel: status('Complete'), workOrderTypeRel: [{ documentId: 'pm', name: 'PM Service' }] };
    expect(validateWorkOrder(wo, tech)).toBe('Describe the Work Completed.');
    expect(validateWorkOrder({ ...wo, workCompleted: 'Done' }, tech)).toBe('A PM Service needs the Date at Service and the Meter at Service.');
    expect(validateWorkOrder({ ...wo, workCompleted: 'Done', dateAtService: at(0), meterAtServiceNum: 100, serviceChecksArr: [{ key: 'a', question: 'Oil', result: '' }] }, tech)).toBe('Answer every service check (1 left).');
    expect(validateWorkOrder({ requestRel: wo.requestRel, workOrderStatusRel: status('New') }, driver)).toBe('Only the workshop raises work orders.');
  });
});

describe('assets and Daily Drivers', () => {
  it('move through the lifecycle with an Asset Manager', () => {
    expect(validateAsset({ lastStatus: 'Active', assetStatusRel: status('Decommission'), allocationStatus: 'Unassigned' }, driver)).toBe('Only an Asset Manager can move an asset from Active to Decommission.');
    expect(validateAsset({ lastStatus: 'Active', assetStatusRel: status('Decommission'), allocationStatus: 'Unassigned' }, manager)).toBe('');
  });

  it('need every mandatory check, and a described defect when one fails', () => {
    const checks = [
      { key: 'a', question: 'Tyres', mandatory: true, result: 'pass' as const },
      { key: 'b', question: 'Lights', mandatory: true, result: '' as const },
    ];
    expect(validateDailyDriver({ checksArr: checks })).toBe('Mandatory Check Not Completed: Lights.');
    const failed = [checks[0], { ...checks[1], result: 'fail' as const, comment: 'Brake light out' }];
    expect(validateDailyDriver({ checksArr: failed })).toBe('Describe the defect.');
    expect(validateDailyDriver({ checksArr: failed, defectDescription: 'Brake light', defectPriorityRel: [{ documentId: 'p', name: 'Urgent' }], inspectionCompleteBool: true })).toBe('');
  });
});
