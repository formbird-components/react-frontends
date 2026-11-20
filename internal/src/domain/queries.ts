// The Elasticsearch requests the SDMS pages run, ported from the templates' filters and the
// client rules that rewrite them (My View, All Items, New Item - onFieldState).
// Pure functions: the pages pass the results to api.search.

import { exists, range, term, terms, type Clause } from '@react-frontends/shared/es';
import {
  BOARD_STATUS_RANGE,
  DONE_STATUSES,
  EMAIL_MESSAGE_VTN,
  SDMS_ADMIN_ACCOUNT_TYPE_ID,
  SDMS_APP_ID,
  USER_CONFIGURATION_VTN,
} from './model';
import type { Account, LookupDoc, LookupKind, Project, ProjectConfig, Ref } from './types';

export type EsRequest = {
  query: Clause;
  sort?: Record<string, unknown>[];
};

interface BoolParts {
  filter?: (Clause | undefined | false)[];
  mustNot?: (Clause | undefined | false)[];
  should?: Clause[];
  must?: Clause[];
}

/** A bool query; empty parts are left out. */
export function bool({ filter = [], mustNot = [], should = [], must = [] }: BoolParts): Clause {
  const f = filter.filter(Boolean) as Clause[];
  const n = mustNot.filter(Boolean) as Clause[];
  return {
    bool: {
      ...(f.length ? { filter: f } : {}),
      ...(must.length ? { must } : {}),
      ...(n.length ? { must_not: n } : {}),
      ...(should.length ? { should, minimum_should_match: 1 } : {}),
    },
  };
}

const byOrder = [{ indexNum: 'asc' }, { 'systemHeader.summaryName': 'asc' }];
const byName = [{ 'systemHeader.summaryName': 'asc' }];
const latestFirst = [{ updatedDate: 'desc' }];
const notInactive = term('inactiveBool', true);

/** The filters every SDMS document of a kind matches (appTags sdms + the kind). */
export const sdms = (tag: string): Clause[] => [term('systemHeader.systemType', 'document'), term('appTags', 'sdms'), term('appTags', tag)];

// ---------------------------------------------------------------------------------------------
// Projects and the values a project uses
// ---------------------------------------------------------------------------------------------

/** The project's setting for a lookup (configType, configStatus, …). */
export function projectConfig(project: Project | null | undefined, kind: LookupKind): ProjectConfig | '' | undefined {
  if (!project) return undefined;
  const key = `config${kind === 'tag' ? 'Tag' : kind[0].toUpperCase() + kind.slice(1)}` as keyof Project;
  return project[key] as ProjectConfig | '' | undefined;
}

export class ProjectConfigError extends Error {
  constructor(project: Project, kind: LookupKind) {
    super(`Unknown project configuration setting for ${kind} on ${project.systemHeader?.summaryName ?? 'this project'}. Please contact an administrator.`);
    this.name = 'ProjectConfigError';
  }
}

/**
 * The active values of a lookup a project uses, in order (ruleApplyProjectfilters):
 * - "Global Default": the values marked global;
 * - "Project Specific": the values linked to the project;
 * - "Combined": either.
 * A project without a setting uses every active value. Without a project, `noProject` decides:
 * every active value (the Item form, My View's board) or only global ones (All Items' filters).
 * Tags differ: without a setting (or without a project) only global tags are offered.
 */
export function lookupQuery(kind: LookupKind, project?: Project | null, { noProject = 'all' }: { noProject?: 'all' | 'global' } = {}): EsRequest {
  const filter: Clause[] = sdms(kind);
  const should: Clause[] = [];
  const config = projectConfig(project, kind);
  const global = term('isGlobalDefaultBool', true);
  const ofProject = project ? term('projectRel.documentId', project.documentId) : undefined;

  if (!project) {
    if (noProject === 'global' || kind === 'tag') filter.push(global);
  } else if (config === 'Global Default') {
    filter.push(global);
  } else if (config === 'Project Specific') {
    filter.push(ofProject!);
  } else if (config === 'Combined') {
    should.push(global, ofProject!);
  } else if (config) {
    throw new ProjectConfigError(project, kind);
  } else if (kind === 'tag') {
    filter.push(global);
  }
  return { query: bool({ filter, mustNot: [notInactive], should }), sort: byOrder };
}

/** Projects to choose from: the person's own (sdmsProjectRel) unless an admin shows them all. */
export function projectOptionsQuery(account: Account | null | undefined, showAll = false): EsRequest {
  const own = (account?.sdmsProjectRel ?? []).map((p) => p.documentId);
  return {
    query: bool({ filter: [...sdms('project'), own.length && !showAll ? terms('documentId', own) : undefined], mustNot: [notInactive] }),
    sort: byOrder,
  };
}

/** One project, active or not (to know its settings and whether it's inactive). */
export const projectQuery = (projectId: string): EsRequest => ({ query: bool({ filter: [term('systemHeader.systemType', 'document'), term('documentId', projectId)] }) });

/**
 * People who can be reporters, assignees, monitors and feedback requestees: active accounts with
 * the SDMS application, on the item's project when it has one (ruleFilterAccounts).
 */
export function peopleQuery(projectIds: string[] = []): EsRequest {
  return {
    query: bool({
      filter: [term('systemHeader.systemType', 'account'), term('appRel.documentId', SDMS_APP_ID), projectIds.length ? terms('sdmsProjectRel.documentId', projectIds) : undefined],
      mustNot: [notInactive],
    }),
    sort: byName,
  };
}

/** Every account's email, to turn @mentions into links (ruleGetAtNamesInNotes). */
export const mentionAccountsQuery = (): EsRequest => ({ query: bool({ filter: [term('systemHeader.systemType', 'account')] }) });

/** Whether the person is an SDMS administrator: an active SDMS Admin account access (ruleShowAdminProjectAll). */
export const adminAccessQuery = (accountId: string): EsRequest => ({
  query: bool({
    filter: [
      term('systemHeader.systemType', 'document'),
      term('appTags', 'accountAccess'),
      term('accountRel.documentId', accountId),
      term('accountTypeRel.documentId', SDMS_ADMIN_ACCOUNT_TYPE_ID),
      term('status', 'Active'),
    ],
  }),
});

/** The person's SDMS settings (email preferences, saved filters). */
export const userConfigurationQuery = (accountId: string): EsRequest => ({
  query: bool({ filter: [term('vtn', USER_CONFIGURATION_VTN), term('accountRel.documentId', accountId)] }),
});

// ---------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------

/**
 * Which projects' items a list shows: the projects picked, else the person's own projects (unless
 * an admin chose to see all), else every project.
 */
export function projectScope(picked: Ref[] | undefined, account: Account | null | undefined, showAll = false): Clause | undefined {
  if (picked?.length) return terms('projectRel.documentId', picked.map((p) => p.documentId));
  const own = (account?.sdmsProjectRel ?? []).map((p) => p.documentId);
  if (own.length && !showAll) return terms('projectRel.documentId', own);
  return undefined;
}

/** Items matching some filters, newest change first. */
export function itemsQuery(o: BoolParts & { sort?: Record<string, unknown>[] } = {}): EsRequest {
  return { query: bool({ ...o, filter: [...sdms('item'), ...(o.filter ?? [])] }), sort: o.sort ?? latestFirst };
}

/** An item by its number (31492 or 0031492), its id, or its alias. */
export function itemByRefQuery(ref: string): EsRequest {
  const value = ref.trim();
  return {
    query: bool({
      filter: [term('systemHeader.systemType', 'document'), term('appTags', 'item')],
      should: [term('itemRef', value.replace(/^0+(?=\d)/, '')), term('itemId', value), term('documentId', value), term('documentIdAlias', value)],
    }),
  };
}

/** Items by id (relationships). */
export const itemsByIdQuery = (ids: string[]): EsRequest => ({ query: bool({ filter: [terms('documentId', ids)] }) });

/** Items to link to: SDMS items other than this one, on the person's projects (ruleFilterAddItemsRel). */
export function linkableItemsQuery(thisId: string | undefined, account: Account | null | undefined, text: string): EsRequest {
  const own = (account?.sdmsProjectRel ?? []).map((p) => p.documentId);
  return itemsQuery({
    filter: [own.length ? terms('projectRel.documentId', own) : undefined],
    mustNot: [thisId ? term('documentId', thisId) : undefined],
    must: text.trim() ? [textSearch(text, [['systemHeader.summaryName.lcase', 1], ['itemId', 1]])] : [],
    sort: byName,
  });
}

/** Every version of a document, oldest first (pass includeAllVersions to the search). */
export const versionsQuery = (documentId: string): EsRequest => ({
  query: bool({ filter: [term('documentId', documentId), term('systemHeader.systemType', 'document')] }),
  sort: [{ 'systemHeader.createdDate': 'asc' }],
});

/** Documents whose latest version the person saved, latest first (My Recent Documents). */
export const recentDocumentsQuery = (accountId: string): EsRequest => ({
  query: bool({ filter: [term('systemHeader.createdBy', accountId)] }),
  sort: [{ 'systemHeader.serverUpdatedDate': 'desc' }],
});

// ---------------------------------------------------------------------------------------------
// My View
// ---------------------------------------------------------------------------------------------

export const MY_VIEW_PANELS = ['assigned', 'feedback', 'unassigned', 'reported', 'resolved', 'recent', 'monitored', 'deferred'] as const;
export type MyViewPanel = (typeof MY_VIEW_PANELS)[number];

export const MY_VIEW_TITLES: Record<MyViewPanel, string> = {
  assigned: 'Assigned to me',
  feedback: 'Feedback requested of me',
  unassigned: 'Unassigned',
  reported: 'Reported by me',
  resolved: 'Resolved',
  recent: 'Recently updated',
  monitored: 'Monitored by me',
  deferred: 'Deferred',
};

/** One of My View's lists, in the projects in scope. "Open" lists leave out Closed and Resolved. */
export function myViewQuery(panel: MyViewPanel, accountId: string, scope: Clause | undefined): EsRequest {
  const me = accountId;
  const notDone = terms('statusRel.name', DONE_STATUSES);
  const parts: Record<MyViewPanel, BoolParts> = {
    assigned: { filter: [term('assigneeRel.documentId', me)], mustNot: [notDone] },
    feedback: { filter: [term('feedbackRel.documentId', me)] },
    unassigned: { mustNot: [exists('assigneeRel'), notDone] },
    reported: { filter: [term('reporterRel.documentId', me)], mustNot: [notDone] },
    resolved: { filter: [term('statusRel.name', 'Resolved')] },
    recent: { filter: [range('updatedDate', { gte: 'now-30d' })] },
    monitored: { filter: [term('monitoringRel.documentId', me)] },
    deferred: { filter: [term('statusRel.name', 'Deferred')] },
  };
  const p = parts[panel];
  return itemsQuery({ ...p, filter: [...(p.filter ?? []), scope] });
}

/** SDMS emails sent to the person (My View's Notifications), latest first. */
export const notificationsQuery = (email: string): EsRequest => ({
  query: bool({ filter: [term('vtn', EMAIL_MESSAGE_VTN), term('to', email), { wildcard: { subject: { value: 'SDMS*' } } }] }),
  sort: [{ firstCreatedDate: 'desc' }],
});

/** The board's statuses for the project picked (its status setting), in order. */
export const boardStatusQuery = (project: Project | null | undefined): EsRequest => lookupQuery('status', project, { noProject: 'all' });

export interface BoardColumn {
  name: string;
  color: string;
  status: LookupDoc;
}

/** The board's columns: statuses with an indexNum from 10 to 59 (Open … Released awaiting test). */
export function boardColumns(statuses: LookupDoc[]): BoardColumn[] {
  return statuses
    .filter((s) => {
      const i = s.indexNum ?? 0;
      return i >= BOARD_STATUS_RANGE.from && i <= BOARD_STATUS_RANGE.to;
    })
    .map((s) => ({ name: s.systemHeader?.summaryName ?? String(s.name ?? ''), color: s.color || '#e0e0e0', status: s }));
}

/** The items on the board: the person's open items in the board's statuses. */
export function boardItemsQuery(accountId: string, columns: BoardColumn[], scope: Clause | undefined): EsRequest {
  return itemsQuery({
    filter: [term('assigneeRel.documentId', accountId), columns.length ? terms('statusRel.name', columns.map((c) => c.name)) : undefined, scope],
    mustNot: [terms('statusRel.name', DONE_STATUSES)],
  });
}

// ---------------------------------------------------------------------------------------------
// All Items
// ---------------------------------------------------------------------------------------------

/**
 * The All Items filters, under the field names Formbird's form uses: saved filters store them
 * by these names, and are shared between that form and this app.
 */
export interface ItemFilters {
  presetPeriodCreated?: DatePreset;
  filterFromCreatedDate?: string;
  filterToCreatedDate?: string;
  presetPeriodUpdated?: DatePreset;
  filterFromUpdatedDate?: string;
  filterToUpdatedDate?: string;
  filterReporterRel?: Ref[];
  filterTypeRel?: Ref[];
  filterSeverityRel?: Ref[];
  filterPriorityRel?: Ref[];
  filterReproducibilityRel?: Ref[];
  filterCategoryRel?: Ref[];
  filterAssigneeRel?: Ref[];
  filterStatusRel?: Ref[];
  filterResolutionRel?: Ref[];
  filterTagsRel?: Ref[];
  /** Hide this status and every status after it (by indexNum). */
  filterHiddenStatusRel?: Ref[];
}

/** The filter fields a saved filter keeps (the rule's filterComponentNames). */
export const FILTER_FIELDS = [
  'presetPeriodCreated',
  'filterFromCreatedDate',
  'filterToCreatedDate',
  'presetPeriodUpdated',
  'filterFromUpdatedDate',
  'filterToUpdatedDate',
  'filterReporterRel',
  'filterTypeRel',
  'filterSeverityRel',
  'filterPriorityRel',
  'filterReproducibilityRel',
  'filterCategoryRel',
  'filterAssigneeRel',
  'filterStatusRel',
  'filterResolutionRel',
  'filterTagsRel',
  'filterHiddenStatusRel',
] as const satisfies readonly (keyof ItemFilters)[];

/** The link filters and the item field each matches (by name, as the rule does). */
export const LINK_FILTERS = {
  filterReporterRel: 'reporterRel',
  filterTypeRel: 'typeRel',
  filterSeverityRel: 'severityRel',
  filterPriorityRel: 'priorityRel',
  filterReproducibilityRel: 'reproducibilityRel',
  filterCategoryRel: 'categoryRel',
  filterAssigneeRel: 'assigneeRel',
  filterStatusRel: 'statusRel',
  filterResolutionRel: 'resolutionRel',
  filterTagsRel: 'tagsRel',
} as const;

export const DATE_PRESETS = ['Custom', 'Today', 'This Week', 'Last Week', 'Last 30 days'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

/**
 * The dates a preset period stands for (ruleSetCreatedDateFilter); weeks start on Monday.
 * "Custom" keeps whatever dates were typed, so it returns null.
 */
export function presetRange(preset: DatePreset | undefined, now = new Date()): { from: Date; to: Date } | null {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  switch (preset) {
    case 'Today':
      return { from: today, to: addDays(today, 1) };
    case 'This Week':
      return { from: monday, to: addDays(monday, 7) };
    case 'Last Week':
      return { from: addDays(monday, -7), to: monday };
    case 'Last 30 days':
      return { from: addDays(now, -30), to: now };
    default:
      return null;
  }
}

/**
 * Statuses "Hide status (and above)" hides: every status whose indexNum is at least the lowest
 * one picked. Pass all statuses (active or not: old items still carry retired ones).
 */
export function hiddenStatusNames(picked: Ref[] | undefined, statuses: LookupDoc[]): string[] {
  if (!picked?.length) return [];
  const indexOf = (r: Ref) => r.indexNum ?? statuses.find((s) => s.documentId === r.documentId)?.indexNum ?? Number.POSITIVE_INFINITY;
  const lowest = Math.min(...picked.map(indexOf));
  if (!Number.isFinite(lowest)) return picked.map((p) => p.name);
  return statuses.filter((s) => (s.indexNum ?? -1) >= lowest).map((s) => s.systemHeader?.summaryName ?? String(s.name ?? '')).filter(Boolean);
}

/** The fields All Items' search looks in, with the rule's weights. */
export const SEARCH_FIELDS: [string, number][] = [
  ['systemHeader.summaryName.lcase', 20],
  ['description', 2],
  ['reproduction', 1],
  ['additionalInformation', 1],
  ['progressNote', 1],
  ['notesCommentsArr.detail', 1],
  ['environmentText', 1],
  ['browserVersion', 1],
  ['coreVersion', 1],
  ['componentVersion', 1],
];

/** Text anywhere in some fields, any case (the fields are keywords: a wildcard sees the whole value). */
export function textSearch(text: string, fields: [string, number][] = SEARCH_FIELDS): Clause {
  const value = text.trim().replace(/[*?\\]/g, (c) => `\\${c}`);
  return {
    bool: {
      should: fields.map(([field, boost]) => ({ wildcard: { [field]: { value: `*${value}*`, case_insensitive: true, boost } } })),
      minimum_should_match: 1,
    },
  };
}

/** All Items' search: the filters, the search text and the projects in scope. */
export function allItemsQuery(
  filters: ItemFilters,
  o: { search?: string; scope?: Clause; hiddenStatuses?: string[]; sort?: Record<string, unknown>[] } = {},
): EsRequest {
  const filter: (Clause | undefined)[] = [o.scope];
  for (const [kind, field] of [
    ['Created', 'createdDate'],
    ['Updated', 'updatedDate'],
  ] as const) {
    const from = filters[`filterFrom${kind}Date`];
    const to = filters[`filterTo${kind}Date`];
    if (from) filter.push(range(field, { gte: new Date(from).toISOString() }));
    if (to) filter.push(range(field, { lte: new Date(to).toISOString() }));
  }
  for (const [key, field] of Object.entries(LINK_FILTERS) as [keyof typeof LINK_FILTERS, string][]) {
    const picked = filters[key];
    if (picked?.length) filter.push(terms(`${field}.name`, picked.map((p) => p.name)));
  }
  return itemsQuery({
    filter,
    must: o.search?.trim() ? [textSearch(o.search)] : [],
    mustNot: [o.hiddenStatuses?.length ? terms('statusRel.name', o.hiddenStatuses) : undefined],
    sort: o.sort,
  });
}
