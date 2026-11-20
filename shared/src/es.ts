// Elasticsearch requests as fieldtec-web's search (POST /api/documentSearch) takes them: clauses,
// and a bool query with its sort (the sort goes inside the request, beside the query).

export type Clause = Record<string, unknown>;

export const term = (field: string, value: unknown): Clause => ({ term: { [field]: value } });
export const terms = (field: string, values: unknown[]): Clause => ({ terms: { [field]: values } });
export const range = (field: string, bounds: Record<string, unknown>): Clause => ({ range: { [field]: bounds } });
export const exists = (field: string): Clause => ({ exists: { field } });

/** Text typed in a search box, anywhere in the fields (their case-insensitive `.lcase`). */
export const contains = (fields: string[], text: string): Clause | undefined => {
  const value = text.trim().toLowerCase().replace(/[*?\\]/g, '');
  if (!value) return undefined;
  return { bool: { should: fields.map((f) => ({ wildcard: { [`${f}.lcase`]: { value: `*${value}*`, case_insensitive: true } } })), minimum_should_match: 1 } };
};

export interface BoolQueryOptions {
  /** Clauses every hit matches (undefined ones are left out, so optional filters can be inline). */
  filter?: (Clause | undefined)[];
  /** Clauses no hit matches. */
  mustNot?: (Clause | undefined)[];
  /** Clauses of which a hit matches at least one. */
  should?: Clause[];
  sort?: Record<string, unknown>[];
}

/** A search request: a bool query (filter, must_not, should) and its sort. */
export function boolQuery(o: BoolQueryOptions = {}): Record<string, unknown> {
  const filter = (o.filter ?? []).filter(Boolean);
  const mustNot = (o.mustNot ?? []).filter(Boolean);
  return {
    ...(o.sort ? { sort: o.sort } : {}),
    query: { bool: { filter, ...(mustNot.length ? { must_not: mustNot } : {}), ...(o.should ? { should: o.should, minimum_should_match: 1 } : {}) } },
  };
}

/** Documents (not templates, accounts…) matching the options. */
export const documentQuery = (o: BoolQueryOptions = {}) => boolQuery({ ...o, filter: [term('systemHeader.systemType', 'document'), ...(o.filter ?? [])] });
