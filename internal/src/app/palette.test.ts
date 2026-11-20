import { describe, expect, it } from 'vitest';
import type { Item } from '@/domain/types';
import { exactNumberQuery, mergeResults, paletteTextQuery, typedNumber } from './palette';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = { query: any; sort?: unknown };

describe('typedNumber', () => {
  it('reads numbers, with or without # and zeros', () => {
    expect(typedNumber('31492')).toBe('31492');
    expect(typedNumber(' #0031492 ')).toBe('0031492');
    expect(typedNumber('login 31492')).toBeNull();
    expect(typedNumber('')).toBeNull();
  });
});

describe('exactNumberQuery', () => {
  it('matches the itemRef without zeros, or the padded itemId', () => {
    const q: Q = exactNumberQuery('0031492');
    expect(q.query.bool.should).toEqual([{ term: { itemRef: '31492' } }, { term: { itemId: '0031492' } }, { term: { itemId: '0031492' } }]);
    expect(q.query.bool.filter).toContainEqual({ term: { appTags: 'item' } });
    const short: Q = exactNumberQuery('42');
    expect(short.query.bool.should).toContainEqual({ term: { itemId: '0000042' } });
  });
});

describe('paletteTextQuery', () => {
  it('looks in the summary and number, any case, latest change first', () => {
    const q: Q = paletteTextQuery('#Login');
    const should = q.query.bool.must[0].bool.should;
    expect(should).toEqual([
      { wildcard: { 'systemHeader.summaryName.lcase': { value: '*Login*', case_insensitive: true, boost: 1 } } },
      { wildcard: { itemId: { value: '*Login*', case_insensitive: true, boost: 1 } } },
    ]);
    expect(q.sort).toEqual([{ updatedDate: 'desc' }]);
  });
});

describe('mergeResults', () => {
  const doc = (id: string): Item => ({ documentId: id });
  it('puts the exact match first, without repeats, up to the size', () => {
    expect(mergeResults([doc('b')], [doc('a'), doc('b'), doc('c')], 2).map((i) => i.documentId)).toEqual(['b', 'a']);
  });
});
