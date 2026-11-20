// Changing selected items in bulk (the SDMS Bulk Item Updater page All Items opened): update some
// fields, move to a project, or copy to a project. One item at a time, reading each item first
// (its notes and tags are added to), and reporting each item's result (ruleUpdateItemsFinal,
// ruleCopyAction). The API is passed in, so the run can be tested without a server.

import { ITEM_TEMPLATE_ID } from '@/domain/model';
import { bulkChange, copyOf, moveChange, type BulkUpdate } from '@/domain/rules';
import type { Account, Item, Ref } from '@/domain/types';

/** At most this many items in one run. */
export const MAX_BULK = 100;

export type BulkPlan = { action: 'Update'; update: BulkUpdate } | { action: 'Move'; project: Ref } | { action: 'Copy'; project: Ref };

export interface BulkResult {
  documentId: string;
  /** The item's number ("0031492"). */
  label: string;
  ok: boolean;
  /** What happened ("Updated", "Already in Fleet", the server's message). */
  message: string;
  /** The saved item (the change), or the copy made. */
  saved?: Item;
}

export interface BulkApi {
  get: (documentId: string) => Promise<Item>;
  update: (documentId: string, fields: Record<string, unknown>) => Promise<Item>;
  create: (templateId: string, fields: Record<string, unknown>) => Promise<Item>;
}

export const labelOf = (item: Pick<Item, 'itemId' | 'itemRef' | 'documentId'>) => item.itemId || item.itemRef || item.documentId.slice(0, 8);

/** The message for a run that's too big, or null. */
export const tooMany = (count: number) => (count > MAX_BULK ? `You can change up to ${MAX_BULK} items at a time, and ${count} are selected. Clear some first.` : null);

/** What the run's button says: "Update 3 items". */
export function actionText(action: BulkPlan['action'], count: number) {
  const verb = action === 'Update' ? 'Update' : action === 'Move' ? 'Move' : 'Copy';
  return `${verb} ${count} ${count === 1 ? 'item' : 'items'}`;
}

/** One item's change. */
async function runOne(item: Pick<Item, 'documentId' | 'itemId' | 'itemRef'>, plan: BulkPlan, account: Account, api: BulkApi, now: Date): Promise<BulkResult> {
  const base = { documentId: item.documentId, label: labelOf(item) };
  try {
    const full = await api.get(item.documentId);
    if (!full) return { ...base, ok: false, message: 'The item wasn’t found.' };
    if (plan.action === 'Update') {
      const saved = await api.update(item.documentId, bulkChange(full, plan.update, account, now));
      return { ...base, ok: true, message: 'Updated', saved };
    }
    if (plan.action === 'Move') {
      if (full.projectRel?.[0]?.documentId === plan.project.documentId) return { ...base, ok: true, message: `Already in ${plan.project.name}` };
      const saved = await api.update(item.documentId, moveChange(plan.project, account, now));
      return { ...base, ok: true, message: `Moved to ${plan.project.name}`, saved };
    }
    const copy = await api.create(ITEM_TEMPLATE_ID, copyOf(full, plan.project, account, now));
    return { ...base, ok: true, message: copy?.itemId ? `Copied as ${copy.itemId}` : 'Copied', saved: copy };
  } catch (error) {
    return { ...base, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Runs a plan over items, one at a time. `onResult` hears each result as it comes; `stopped`
 * is asked before each item (a stop lets the current item finish).
 */
export async function runBulk(
  items: Pick<Item, 'documentId' | 'itemId' | 'itemRef'>[],
  plan: BulkPlan,
  account: Account,
  api: BulkApi,
  o: { onResult?: (result: BulkResult, done: number) => void; stopped?: () => boolean; now?: () => Date } = {},
): Promise<BulkResult[]> {
  const problem = tooMany(items.length);
  if (problem) throw new Error(problem);
  const results: BulkResult[] = [];
  for (const item of items) {
    if (o.stopped?.()) break;
    const result = await runOne(item, plan, account, api, o.now?.() ?? new Date());
    results.push(result);
    o.onResult?.(result, results.length);
  }
  return results;
}

/** A run's outcome in a sentence. */
export function summary(action: BulkPlan['action'], results: BulkResult[], total: number): string {
  const done = results.filter((r) => r.ok).length;
  const failed = results.length - done;
  const past = action === 'Update' ? 'updated' : action === 'Move' ? 'moved' : 'copied';
  const stopped = results.length < total ? ` Stopped before the last ${total - results.length}.` : '';
  if (!failed) return `${done} of ${total} ${total === 1 ? 'item' : 'items'} ${past}.${stopped}`;
  return `${done} of ${total} ${past}. ${failed} failed and ${failed === 1 ? 'stays' : 'stay'} selected.${stopped}`;
}
