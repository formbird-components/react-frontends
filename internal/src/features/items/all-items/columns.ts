// All Items' columns: the original list's (ID, Project, Summary, Status, Assignee, Priority,
// Severity, Category, Updated), and the hidden ones a person can add (Created, Tags, Reporter,
// Reproducibility, Progress note; Type and Resolution too). The choice is remembered in this browser.

import type { ColumnKey } from '@/components/items-table';

/** Every column the page offers, in the original list's order. */
export const ALL_COLUMNS: ColumnKey[] = [
  'id',
  'project',
  'type',
  'summary',
  'status',
  'assignee',
  'progressNote',
  'priority',
  'severity',
  'category',
  'resolution',
  'created',
  'updated',
  'tags',
  'reporter',
  'reproducibility',
];

export const DEFAULT_COLUMNS: ColumnKey[] = ['id', 'project', 'summary', 'status', 'assignee', 'priority', 'severity', 'category', 'updated'];

/** Always shown: an item needs its number and summary. */
export const FIXED_COLUMNS: ColumnKey[] = ['id', 'summary'];

export const COLUMNS_KEY = 'sdms-all-items-columns';

/** The columns to show from what was stored: known ones, in the page's order, with the fixed ones. */
export function columnsFrom(stored: unknown): ColumnKey[] {
  if (!Array.isArray(stored)) return DEFAULT_COLUMNS;
  const chosen = new Set(stored.filter((c): c is ColumnKey => ALL_COLUMNS.includes(c as ColumnKey)));
  if (!chosen.size) return DEFAULT_COLUMNS;
  for (const c of FIXED_COLUMNS) chosen.add(c);
  return ALL_COLUMNS.filter((c) => chosen.has(c));
}

/** The columns with one shown or hidden (fixed ones stay). */
export function toggleColumn(columns: ColumnKey[], key: ColumnKey): ColumnKey[] {
  if (FIXED_COLUMNS.includes(key)) return columns;
  return columnsFrom(columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key]);
}

/**
 * On narrower screens some of the usual columns give way, as the original list's responsive
 * columns did: ID, summary and status always show, and so do columns a person added. A picked
 * project's column goes early (it says the same on every row); without one it stays longer.
 */
export function narrowScreenClasses(projectPicked: boolean): Partial<Record<ColumnKey, string>> {
  return projectPicked
    ? {
        assignee: 'hidden md:table-cell',
        updated: 'hidden xl:table-cell',
        priority: 'hidden xl:table-cell',
        severity: 'hidden min-[1400px]:table-cell',
        category: 'hidden 2xl:table-cell',
        project: 'hidden 2xl:table-cell',
      }
    : {
        assignee: 'hidden md:table-cell',
        updated: 'hidden xl:table-cell',
        project: 'hidden min-[1400px]:table-cell',
        priority: 'hidden 2xl:table-cell',
        severity: 'hidden min-[1700px]:table-cell',
        category: 'hidden min-[1700px]:table-cell',
      };
}
