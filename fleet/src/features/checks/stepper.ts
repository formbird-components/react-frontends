// The Daily Driver as a series of steps: the asset, its meter, the checks, the defect (when a check
// failed) and a last look before submitting. Each step says what stops the person moving on, in the
// server's words where it has them (validateDailyDriver).

import { checklistOutcome } from '@/domain/logic/checklist';
import { meterProblems } from '@/domain/logic/meter';
import type { AssetValue, CheckItem, DailyDriver, LookupValue, PersonValue } from '@/domain/types';
import { validateDailyDriver } from '@/domain/validate';
import { failures } from './checklist';

export type StepId = 'asset' | 'meter' | 'checks' | 'defects' | 'review';

export const STEP_TITLES: Record<StepId, string> = {
  asset: 'Asset',
  meter: 'Meter',
  checks: 'Checks',
  defects: 'Defects',
  review: 'Review',
};

export interface DailyDriverDraft {
  asset?: AssetValue;
  /** The asset's current meter (for the reading's checks). */
  assetMeter?: number | null;
  meter: number | null;
  checks: CheckItem[];
  defectDescription: string;
  defectPriority?: LookupValue;
  serviceRequested: 'In Workshop' | 'In Field' | '';
  inspectionComplete: boolean;
  checkDate: string;
}

export const emptyDraft = (now = new Date()): DailyDriverDraft => ({
  meter: null,
  checks: [],
  defectDescription: '',
  serviceRequested: 'In Workshop',
  inspectionComplete: false,
  checkDate: now.toISOString(),
});

/** The steps for a draft: the defect step only when a check failed. */
export const stepsFor = (draft: Pick<DailyDriverDraft, 'checks'>): StepId[] =>
  failures(draft.checks).length ? ['asset', 'meter', 'checks', 'defects', 'review'] : ['asset', 'meter', 'checks', 'review'];

/** The largest believable increase on a Daily Driver (the server's rule uses the same). */
export const MAX_INCREASE = 2000;

/** Warnings about the reading (kept, but not copied to the asset). */
export const meterWarnings = (draft: Pick<DailyDriverDraft, 'meter' | 'assetMeter' | 'asset'>) =>
  meterProblems({ reading: draft.meter, assetMeter: draft.assetMeter, maxIncrease: MAX_INCREASE, unit: draft.asset?.primaryMeterUnit ?? undefined });

/** The record to create. */
export function toRecord(draft: DailyDriverDraft, driver: PersonValue | null): Partial<DailyDriver> {
  const failed = failures(draft.checks).length > 0;
  return {
    assetRel: draft.asset ? [draft.asset] : [],
    driverRel: driver ? [driver] : [],
    checkDate: draft.checkDate,
    meterReadingNum: draft.meter ?? undefined,
    checksArr: draft.checks,
    defectDescription: failed ? draft.defectDescription.trim() : '',
    defectPriorityRel: failed && draft.defectPriority ? [draft.defectPriority] : [],
    serviceRequested: failed ? draft.serviceRequested || 'In Workshop' : '',
    inspectionCompleteBool: failed ? draft.inspectionComplete : false,
  };
}

/** What stops the person leaving a step ('' when they may go on). */
export function stepProblem(step: StepId, draft: DailyDriverDraft): string {
  switch (step) {
    case 'asset':
      return draft.asset ? '' : 'Choose the asset you’re checking.';
    case 'meter':
      if (draft.meter === null || draft.meter === undefined) return `Enter the ${draft.asset?.primaryMeterUnit === 'hours' ? 'hour meter' : 'odometer'} reading.`;
      if (draft.meter < 0) return 'A meter reading cannot be negative.';
      return '';
    case 'checks': {
      const outcome = checklistOutcome(draft.checks, { commentOnFail: true });
      if (!outcome.total) return 'There are no checks to answer: choose the asset first.';
      if (outcome.missingMandatory.length) return `Answer the mandatory checks: ${outcome.missingMandatory.join(', ')}.`;
      if (outcome.failsWithoutComment.length) return `Say what is wrong with: ${outcome.failsWithoutComment.join(', ')}.`;
      return '';
    }
    case 'defects':
      if (!draft.defectDescription.trim()) return 'Describe the defect.';
      if (!draft.defectPriority) return 'Choose the defect priority.';
      if (!draft.inspectionComplete) return 'Tick Defect Inspection Complete to submit.';
      return '';
    case 'review':
      return validateDailyDriver(toRecord(draft, null));
  }
}

/** The first step that isn't done (where "Next" would stop), or undefined. */
export const firstBlocked = (draft: DailyDriverDraft) => stepsFor(draft).find((s) => s !== 'review' && stepProblem(s, draft));
