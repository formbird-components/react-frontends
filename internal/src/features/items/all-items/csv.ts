// Exporting All Items' results as CSV (the original list's CSV export): the columns shown, plain
// text values, read by spreadsheets (UTF-8 with a byte order mark, CRLF lines).

import type { ColumnKey } from '@/components/items-table';
import type { Item, Ref } from '@/domain/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** A stored date as a spreadsheet reads it, in local time: "2026-11-05 14:30". */
export function csvDate(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const names = (refs: Ref[] | undefined | null) => (refs ?? []).map((r) => r.name).filter(Boolean).join('; ');

/** Each column's value as text. */
export const CSV_VALUES: Record<ColumnKey, (item: Item) => string> = {
  id: (i) => i.itemId || i.itemRef || '',
  project: (i) => names(i.projectRel),
  summary: (i) => i.summary ?? '',
  type: (i) => names(i.typeRel),
  status: (i) => names(i.statusRel),
  assignee: (i) => names(i.assigneeRel),
  priority: (i) => names(i.priorityRel),
  severity: (i) => names(i.severityRel),
  category: (i) => names(i.categoryRel),
  createdBy: (i) => names(i.createdByRel),
  reporter: (i) => names(i.reporterRel),
  created: (i) => csvDate(i.createdDate ?? i.systemHeader?.documentCreatedDate),
  updated: (i) => csvDate(i.updatedDate),
  tags: (i) => names(i.tagsRel),
  reproducibility: (i) => names(i.reproducibilityRel),
  resolution: (i) => names(i.resolutionRel),
  progressNote: (i) => i.progressNote ?? '',
};

/**
 * One value as a CSV field: quoted when it has a comma, quote or line break. Text a spreadsheet
 * would run as a formula (=, +, -, @ at the start, but not a number) gets a leading apostrophe.
 */
export function csvCell(value: string): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d+(\.\d+)?$/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Rows as CSV text (with a byte order mark, so spreadsheets read UTF-8). */
export const toCsv = (rows: string[][]) => `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

/** Items as CSV: a header row of the columns' labels, then a row per item. */
export function itemsCsv(items: Item[], columns: { key: ColumnKey; label: string }[]): string {
  return toCsv([columns.map((c) => c.label), ...items.map((item) => columns.map((c) => CSV_VALUES[c.key](item)))]);
}

/** "sdms-items-2026-11-11.csv". */
export const csvFileName = (now = new Date()) => `sdms-items-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
