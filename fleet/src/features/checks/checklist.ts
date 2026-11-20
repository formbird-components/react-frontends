// Answering a check sheet (a Daily Driver's checks, a PM service's tasks): the checks by category,
// answers, and what the sheet comes to (checklistOutcome, which the server also runs).

import type { CheckItem } from '@/domain/types';

export type Result = NonNullable<CheckItem['result']>;

/** A key from a question ("Tyres: tread" → "tyres-tread"), as fleet's sheets make them. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** A sheet's checks (check sheet `checkItems`, service plan `tasks`), unanswered, ready to answer. */
export function itemsFromSheet(items: Partial<CheckItem>[] | null | undefined): CheckItem[] {
  const seen = new Set<string>();
  const out: CheckItem[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const question = String(item.question ?? '').trim();
    if (!question) continue;
    let key = item.key || slug(question) || `check-${out.length + 1}`;
    while (seen.has(key)) key = `${key}-${out.length + 1}`;
    seen.add(key);
    out.push({
      key,
      question,
      ...(item.category ? { category: item.category } : {}),
      ...(item.mandatory ? { mandatory: true } : {}),
      ...(item.instruction ? { instruction: item.instruction } : {}),
      result: '',
      comment: '',
    });
  }
  return out;
}

export const ADDED = 'Added checks';

/** Checks by category, in the order categories first appear (added checks last). */
export function groupByCategory(items: CheckItem[]): { category: string; items: CheckItem[] }[] {
  const groups = new Map<string, CheckItem[]>();
  for (const item of items) {
    const category = item.adhoc ? ADDED : item.category?.trim() || 'General';
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  const list = [...groups.entries()].map(([category, list]) => ({ category, items: list }));
  return [...list.filter((g) => g.category !== ADDED), ...list.filter((g) => g.category === ADDED)];
}

/** Answers a check; answering it the same again clears the answer. */
export function answer(items: CheckItem[], key: string, result: Result): CheckItem[] {
  return items.map((item) => (item.key === key ? { ...item, result: item.result === result ? '' : result } : item));
}

export const comment = (items: CheckItem[], key: string, text: string): CheckItem[] => items.map((item) => (item.key === key ? { ...item, comment: text } : item));

/** Passes every check not answered yet. */
export const passRemaining = (items: CheckItem[]): CheckItem[] => items.map((item) => (item.result ? item : { ...item, result: 'pass' }));

export const unanswered = (items: CheckItem[]) => items.filter((item) => !item.result).length;
export const failures = (items: CheckItem[] | null | undefined) => (items ?? []).filter((item) => item.result === 'fail');

/** A first line for the defect description, from what failed. */
export function defectSummary(items: CheckItem[]): string {
  return failures(items)
    .map((item) => (item.comment?.trim() ? `${item.question}: ${item.comment.trim()}` : item.question))
    .join('. ');
}

/** The check sheet an asset uses: its own, or its type's. */
type Ref = { documentId: string; name?: string };
export function checkSheetIdOf(asset: { checkSheetRel?: Ref[]; assetTypeRel?: (Ref & { checkSheetRel?: Ref[] })[] } | null | undefined): string | undefined {
  return asset?.checkSheetRel?.[0]?.documentId ?? asset?.assetTypeRel?.[0]?.checkSheetRel?.[0]?.documentId;
}

/** Answer counts for a category (for its heading). */
export function categoryProgress(items: CheckItem[]) {
  return { answered: items.filter((i) => i.result).length, total: items.length, failed: failures(items).length };
}
