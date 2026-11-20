import { describe, expect, it } from 'vitest';
import type { CheckItem } from '@/domain/types';
import { ADDED, answer, categoryProgress, checkSheetIdOf, comment, defectSummary, groupByCategory, itemsFromSheet, passRemaining, slug, unanswered } from './checklist';
import { emptyDraft, firstBlocked, meterWarnings, stepProblem, stepsFor, toRecord, type DailyDriverDraft } from './stepper';

const sheet = [
  { key: 'tyres', question: 'Tyres', category: 'Exterior', mandatory: true, instruction: 'At least 1.5 mm' },
  { question: 'Lights, indicators & hazards', category: 'Exterior', mandatory: true },
  { key: 'oil', question: 'Engine oil level', category: 'Under the bonnet' },
  { question: '  ' },
  { key: 'belts', question: 'Seatbelts' },
];

describe('check sheets', () => {
  it('become unanswered checks with keys', () => {
    const items = itemsFromSheet(sheet);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ key: 'tyres', question: 'Tyres', category: 'Exterior', mandatory: true, instruction: 'At least 1.5 mm', result: '', comment: '' });
    expect(items[1].key).toBe('lights-indicators-hazards');
    expect(items[3]).toEqual({ key: 'belts', question: 'Seatbelts', result: '', comment: '' });
    expect(itemsFromSheet(null)).toEqual([]);
    expect(itemsFromSheet([{ key: 'a', question: 'A' }, { key: 'a', question: 'B' }]).map((i) => i.key)).toEqual(['a', 'a-2']);
    expect(slug('Tyres: tread, pressure and damage')).toBe('tyres-tread-pressure-and-damage');
  });

  it('group by category in sheet order, added checks last', () => {
    const items: CheckItem[] = [...itemsFromSheet(sheet), { key: 'x', question: 'Ladder rack', adhoc: true, result: '' }];
    expect(groupByCategory(items).map((g) => [g.category, g.items.length])).toEqual([
      ['Exterior', 2],
      ['Under the bonnet', 1],
      ['General', 1],
      [ADDED, 1],
    ]);
  });

  it('are answered, toggled off, commented and passed in bulk', () => {
    let items = itemsFromSheet(sheet);
    items = answer(items, 'tyres', 'fail');
    items = comment(items, 'tyres', 'Bald front left');
    expect(items[0]).toMatchObject({ result: 'fail', comment: 'Bald front left' });
    expect(answer(items, 'tyres', 'fail')[0].result).toBe('');
    expect(unanswered(items)).toBe(3);
    items = passRemaining(items);
    expect(items.map((i) => i.result)).toEqual(['fail', 'pass', 'pass', 'pass']);
    expect(defectSummary(items)).toBe('Tyres: Bald front left');
    expect(categoryProgress(items.slice(0, 2))).toEqual({ answered: 2, total: 2, failed: 1 });
  });

  it("come from the asset's own sheet, else its type's", () => {
    expect(checkSheetIdOf({ checkSheetRel: [{ documentId: 's1', name: 'Light' }] })).toBe('s1');
    expect(checkSheetIdOf({ assetTypeRel: [{ documentId: 't', name: 'Van', checkSheetRel: [{ documentId: 's2', name: 'Light' }] }] })).toBe('s2');
    expect(checkSheetIdOf(undefined)).toBeUndefined();
  });
});

describe('the Daily Driver steps', () => {
  const asset = { documentId: 'a', name: 'V-201', assetId: 'V-201', primaryMeterUnit: 'km' as const };
  const ready = (): DailyDriverDraft => ({ ...emptyDraft(new Date('2026-11-10T00:00:00Z')), asset, meter: 38500, assetMeter: 38420, checks: passRemaining(itemsFromSheet(sheet)) });

  it('add a defect step only when a check failed', () => {
    expect(stepsFor(ready())).toEqual(['asset', 'meter', 'checks', 'review']);
    expect(stepsFor({ checks: answer(ready().checks, 'oil', 'fail') })).toEqual(['asset', 'meter', 'checks', 'defects', 'review']);
  });

  it('stop at what is missing, in the server’s words', () => {
    const draft = emptyDraft();
    expect(stepProblem('asset', draft)).toBe('Choose the asset you’re checking.');
    expect(stepProblem('meter', { ...draft, asset: { ...asset, primaryMeterUnit: 'hours' } })).toBe('Enter the hour meter reading.');
    expect(stepProblem('meter', { ...draft, meter: -1 })).toBe('A meter reading cannot be negative.');
    expect(stepProblem('checks', draft)).toBe('There are no checks to answer: choose the asset first.');
    expect(stepProblem('checks', { ...draft, checks: itemsFromSheet(sheet) })).toBe('Answer the mandatory checks: Tyres, Lights, indicators & hazards.');
    const failed = { ...ready(), checks: answer(ready().checks, 'oil', 'fail') };
    expect(stepProblem('checks', failed)).toBe('Say what is wrong with: Engine oil level.');
    const commented = { ...failed, checks: comment(failed.checks, 'oil', 'Below the minimum') };
    expect(stepProblem('checks', commented)).toBe('');
    expect(stepProblem('defects', commented)).toBe('Describe the defect.');
    expect(stepProblem('defects', { ...commented, defectDescription: 'Low oil' })).toBe('Choose the defect priority.');
    const almost = { ...commented, defectDescription: 'Low oil', defectPriority: { documentId: 'p', name: 'Non-Urgent – Asset Operational' } };
    expect(stepProblem('defects', almost)).toBe('Tick Defect Inspection Complete to submit.');
    expect(stepProblem('review', almost)).toBe('Tick Defect Inspection Complete to submit.');
    expect(stepProblem('review', { ...almost, inspectionComplete: true })).toBe('');
    expect(firstBlocked(draft)).toBe('asset');
    expect(firstBlocked(ready())).toBeUndefined();
  });

  it('flag a meter below the asset’s or far above it', () => {
    expect(meterWarnings({ ...ready(), meter: 38000 })).toEqual(['Primary Meter < Asset Meter (38,420 km).']);
    expect(meterWarnings({ ...ready(), meter: 41000 })[0]).toMatch(/Range Error/);
    expect(meterWarnings(ready())).toEqual([]);
  });

  it('make the record, without defect fields when nothing failed', () => {
    const me = { documentId: 'u', name: 'Grace Kim' };
    expect(toRecord({ ...ready(), defectDescription: 'stale' }, me)).toMatchObject({ assetRel: [asset], driverRel: [me], meterReadingNum: 38500, defectDescription: '', defectPriorityRel: [], serviceRequested: '', inspectionCompleteBool: false });
    const failed = { ...ready(), checks: comment(answer(ready().checks, 'oil', 'fail'), 'oil', 'Low'), defectDescription: ' Low oil ', inspectionComplete: true };
    expect(toRecord(failed, me)).toMatchObject({ defectDescription: 'Low oil', serviceRequested: 'In Workshop', inspectionCompleteBool: true });
  });
});
