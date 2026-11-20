// Saving only what changed: fieldtec-web merges the fields sent into the stored record.

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields of `next` that differ from `base` (only `keys`, when given). Empty values compare as null. */
export function changedFields<T extends Record<string, unknown>>(base: T, next: Partial<T>, keys?: (keyof T)[]): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of keys ?? (Object.keys(next) as (keyof T)[])) {
    if (!same(base[key] === '' ? null : base[key], next[key] === '' ? null : next[key])) changed[key] = next[key];
  }
  return changed;
}

export const hasChanges = (changes: object) => Object.keys(changes).length > 0;
