// Numbers people type: "1,234.5", "$ 18.50", "38 420".

/**
 * A typed number: commas, spaces and "$" are dropped; text that isn't a number gives null.
 * @param text - What was typed (or a number)
 * @returns The number, or null when empty or not a number
 */
export function parseNumber(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const cleaned = String(text ?? '').replace(/[\s,$]/g, '');
  if (!cleaned || !/^-?\d*\.?\d*$/.test(cleaned) || cleaned === '.' || cleaned === '-' || cleaned === '-.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
