// A work order's lines (parts, labour, other costs) as the editor changes them. The totals are
// lineTotals (domain/logic/money.ts), which the server's work order rule also runs.

import { parseNumber } from '@react-frontends/shared/components';
import { LABOUR_RATE } from '@/domain/model';
import type { LineItemValue, Material } from '@/domain/types';

export type Line = LineItemValue;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A number typed in a cell (commas, spaces and "$" dropped; not a number → null). */
export const parseAmount = parseNumber;

/** A line's amount (qty × unit cost), to the cent. */
export const lineAmount = (line: Pick<Line, 'qty' | 'unitCost'>) => round2((Number(line.qty) || 0) * (Number(line.unitCost) || 0));

const materialOf = (line: Line) => line.materialRel?.[0]?.documentId;

/**
 * Adds a part from the materials list: a new line of 1 at the material's unit cost, or one more on
 * the line that already has it.
 */
export function addMaterial(lines: Line[], material: Pick<Material, 'documentId' | 'nameId' | 'partNo' | 'unit' | 'unitCost'>, id: string): Line[] {
  const existing = lines.find((l) => l.kind === 'part' && materialOf(l) === material.documentId);
  if (existing) return lines.map((l) => (l === existing ? { ...l, qty: (Number(l.qty) || 0) + 1 } : l));
  return [
    ...lines,
    {
      id,
      kind: 'part',
      description: material.nameId,
      materialRel: [{ documentId: material.documentId, name: material.nameId, ...(material.partNo ? { partNo: material.partNo } : {}) }],
      qty: 1,
      unit: material.unit || 'ea',
      unitCost: Number(material.unitCost) || 0,
    },
  ];
}

/** A labour line: an hour at the workshop rate. */
export const labourLine = (id: string, description = 'Labour', hours = 1, rate = LABOUR_RATE): Line => ({ id, kind: 'labour', description, qty: hours, unit: 'h', unitCost: rate });

/** Another cost (sublet work, freight…): one, to be described and priced. */
export const otherLine = (id: string): Line => ({ id, kind: 'other', description: '', qty: 1, unit: 'ea', unitCost: 0 });

export const updateLine = (lines: Line[], id: string, patch: Partial<Line>): Line[] => lines.map((l) => (l.id === id ? { ...l, ...patch } : l));
export const removeLine = (lines: Line[], id: string): Line[] => lines.filter((l) => l.id !== id);

/** Parts lines that use more than the store holds: line id → message. */
export function stockWarnings(lines: Line[], stock: Record<string, { qty?: number; unit?: string }>): Record<string, string> {
  const used: Record<string, number> = {};
  for (const l of lines) {
    const m = l.kind === 'part' ? materialOf(l) : undefined;
    if (m) used[m] = (used[m] ?? 0) + (Number(l.qty) || 0);
  }
  const warnings: Record<string, string> = {};
  for (const l of lines) {
    const m = l.kind === 'part' ? materialOf(l) : undefined;
    const held = m ? stock[m]?.qty : undefined;
    if (m && typeof held === 'number' && used[m] > held) warnings[l.id] = `Only ${held} ${stock[m]?.unit ?? l.unit ?? ''} in stock`.trim();
  }
  return warnings;
}

/** What is wrong with the lines before they are saved (the server doesn't check them). */
export function lineProblems(lines: Line[]): string[] {
  const problems: string[] = [];
  lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    if (!String(l.description ?? '').trim()) problems.push(`${n} needs a description.`);
    if (!(Number(l.qty) > 0)) problems.push(`${n} needs a quantity above 0.`);
    if (Number(l.unitCost) < 0) problems.push(`${n} can't cost less than nothing.`);
  });
  return problems;
}

/** The lines as stored: numbers as numbers (an empty cell is 0). */
export const cleanLines = (lines: Line[]): Line[] => lines.map((l) => ({ ...l, description: String(l.description ?? '').trim(), qty: Number(l.qty) || 0, unitCost: Number(l.unitCost) || 0 }));
