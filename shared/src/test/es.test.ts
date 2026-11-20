import { describe, expect, it } from 'vitest';
import { boolQuery, contains, documentQuery, term } from '../es';

describe('es', () => {
  it('builds a bool query with its sort, leaving out undefined clauses', () => {
    expect(boolQuery({ filter: [term('a', 1), contains(['name'], '  ')], mustNot: [undefined], sort: [{ a: 'asc' }] })).toEqual({
      sort: [{ a: 'asc' }],
      query: { bool: { filter: [{ term: { a: 1 } }] } },
    });
  });

  it('adds should with minimum_should_match', () => {
    expect(boolQuery({ should: [term('b', 2)] })).toEqual({ query: { bool: { filter: [], should: [{ term: { b: 2 } }], minimum_should_match: 1 } } });
  });

  it('searches text case-insensitively on .lcase, without wildcards typed', () => {
    expect(contains(['ref', 'title'], ' TRK-12* ')).toEqual({
      bool: {
        should: [{ wildcard: { 'ref.lcase': { value: '*trk-12*', case_insensitive: true } } }, { wildcard: { 'title.lcase': { value: '*trk-12*', case_insensitive: true } } }],
        minimum_should_match: 1,
      },
    });
  });

  it('documentQuery keeps to documents', () => {
    expect(documentQuery({ filter: [term('x', 1)] })).toEqual({ query: { bool: { filter: [{ term: { 'systemHeader.systemType': 'document' } }, { term: { x: 1 } }] } } });
  });
});
