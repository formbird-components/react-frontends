// The fleet's searches: documents tagged "fleet" and their kind (appTags). The clause helpers
// (term, range, contains…) are @react-frontends/shared/es.

import { boolQuery, term, type BoolQueryOptions } from '@react-frontends/shared/es';

/** A bool query over the fleet's documents of a kind. */
export function fleetQuery(kind: string, o: BoolQueryOptions = {}): Record<string, unknown> {
  return boolQuery({ ...o, filter: [term('systemHeader.systemType', 'document'), term('appTags', 'fleet'), term('appTags', kind), ...(o.filter ?? [])] });
}
