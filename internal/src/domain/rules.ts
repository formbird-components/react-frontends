// The Item's client rules (New Item - onFieldState, New Item - PreSaveClient) and the list pages'
// rules (My View, All Items, the bulk updater), as plain functions the React pages call.
// The server's rule (SDMS Item - PreSaveServer) still runs on every save: it numbers new items,
// sets their keys, and emails the people on the item. See README "How the rules map".

import { FIELD_LABELS, MAX_RELATIONSHIP_BATCH, REF_FIELDS, SYSTEM_ADMIN_ID } from './model';
import type { Account, Doc, Item, LookupDoc, Note, Project, Ref, Relationship, RelationshipType, SavedFilter } from './types';

/** A person as items store them ({ documentId, name }). */
export function personRef(account: Pick<Account, 'documentId' | 'systemHeader' | 'email'>, extra: Partial<Ref> = {}): Ref {
  return { name: account.systemHeader?.summaryName ?? account.email ?? '', documentId: account.documentId, ...extra };
}

/**
 * A link to a document as the field stores it: id, name, and the related fields the template
 * copies for that field (only those the document has).
 */
export function toRef(field: string, doc: Doc): Ref {
  const ref: Ref = { documentId: doc.documentId, name: doc.systemHeader?.summaryName ?? String(doc.name ?? '') };
  for (const key of REF_FIELDS[field] ?? []) {
    if (doc[key] !== undefined && doc[key] !== null) ref[key] = doc[key];
  }
  return ref;
}

// ---------------------------------------------------------------------------------------------
// Which fields can be changed
// ---------------------------------------------------------------------------------------------

/** Fields locked when the item's project is inactive (ruleProjectDisabled): everything. */
const ALL_EDITABLE = [
  'projectRel', 'typeRel', 'severityRel', 'priorityRel', 'reproducibilityRel', 'categoryRel', 'tagsRel', 'summary',
  'assigneeRel', 'resolutionRel', 'monitoringRel', 'feedbackRel', 'exampleLink', 'environmentText', 'browserVersion',
  'coreVersion', 'componentVersion', 'description', 'reproduction', 'additionalInformation', 'fileAttachArr',
  'relationships', 'notesCommentsArr', 'statusRel', 'progressNote', 'documentationMD',
] as const;
export type EditableField = (typeof ALL_EDITABLE)[number] | 'reporterRel';

/** Fields that need a project first (ruleDisableConfig): the lookups and the people. */
const NEED_PROJECT = new Set<string>(['typeRel', 'severityRel', 'priorityRel', 'reproducibilityRel', 'categoryRel', 'tagsRel', 'assigneeRel', 'statusRel', 'resolutionRel', 'monitoringRel', 'feedbackRel']);

/**
 * Fields a closed item locks (ruleDisableItemOnClose). Status and the progress note stay open,
 * so a closed item can be reopened and its progress noted.
 */
const LOCKED_WHEN_CLOSED = new Set<string>(ALL_EDITABLE.filter((f) => f !== 'statusRel' && f !== 'progressNote' && f !== 'documentationMD'));

export type Lock = 'inactive-project' | 'closed' | 'no-project' | 'old-version' | 'single-project' | 'read-only' | null;

export interface FormState {
  isNew: boolean;
  /** The saved status locks the item (a status with disableItemBool, i.e. Closed). */
  closed: boolean;
  projectInactive: boolean;
  /** An old version opened from the history: look, don't change (rulePreventSaveNonCurrent). */
  oldVersion: boolean;
  /** Why a field can't be changed, or null when it can. */
  lockOf: (field: EditableField) => Lock;
  /** Panels new items don't have yet (ruleSetStateOnLoad). */
  showsRelationships: boolean;
  showsSnapshot: boolean;
  showsDocumentation: boolean;
}

/**
 * The form's field states for an item: `saved` is the item as stored (or null when new), `draft`
 * the item being edited, `project` the draft's project document.
 * The lock from a closed status follows the SAVED status (#31244): picking Closed doesn't lock
 * the form until the save lands, so the quick status note stays writable.
 */
export function formState(saved: Item | null, draft: Item, o: { project?: Project | null; account?: Account | null } = {}): FormState {
  const isNew = !saved;
  const closed = !!saved?.statusRel?.[0]?.disableItemBool;
  const projectInactive = !!o.project?.inactiveBool;
  const oldVersion = saved?.systemHeader?.currentVersion === false;
  const hasProject = !!draft.projectRel?.length;
  const singleProject = (o.account?.sdmsProjectRel?.length ?? 0) === 1;
  return {
    isNew,
    closed,
    projectInactive,
    oldVersion,
    lockOf(field) {
      if (oldVersion) return 'old-version';
      if (field === 'reporterRel') return 'read-only'; // the template shows the reporter, not a picker
      if (projectInactive) return 'inactive-project';
      if (closed && LOCKED_WHEN_CLOSED.has(field)) return 'closed';
      if (!hasProject && NEED_PROJECT.has(field)) return 'no-project';
      if (field === 'projectRel' && singleProject && isNew && hasProject) return 'single-project';
      return null;
    },
    showsRelationships: !isNew,
    showsSnapshot: !isNew,
    showsDocumentation: !isNew,
  };
}

export const LOCK_REASONS: Record<Exclude<Lock, null>, string> = {
  'inactive-project': 'This item’s project is inactive, so the item can’t be changed.',
  closed: 'This item is closed. Change its status to reopen it.',
  'no-project': 'Choose a project first.',
  'old-version': 'This is an old version. Open the current version to make changes.',
  'single-project': 'You work on one project, so your items are in it.',
  'read-only': '',
};

// ---------------------------------------------------------------------------------------------
// New items, authorship
// ---------------------------------------------------------------------------------------------

/**
 * A new item's starting values: the reporter and creator are you (ruleSetReporterRel,
 * ruleSetCreatedByRel); the project is your only project, or the one you last picked
 * (Project Access include).
 */
export function newItemDefaults(account: Account, rememberedProject: Ref[] | null, now = new Date()): Item {
  const own = account.sdmsProjectRel ?? [];
  const projectRel = own.length === 1 ? [{ documentId: own[0].documentId, name: own[0].name }] : rememberedProject?.length ? rememberedProject.slice(0, 1) : undefined;
  return {
    documentId: '',
    appTags: ['sdms', 'item'],
    reporterRel: [personRef(account, account.email ? { email: account.email } : {})],
    createdByRel: [personRef(account, { date: now.toISOString() })],
    createdDate: now.toISOString(),
    ...(projectRel ? { projectRel } : {}),
  };
}

/** Whether to remember the project picked (people with one project always get theirs). */
export const remembersProject = (account: Account | null | undefined) => (account?.sdmsProjectRel?.length ?? 0) !== 1;

/** Who changed the item and when, set on every save (Authorship Functions). */
export function authorship(account: Account, now = new Date()): Pick<Item, 'updatedByRel' | 'updatedDate'> {
  return { updatedByRel: [personRef(account, { date: now.toISOString() })], updatedDate: now.toISOString() };
}

// ---------------------------------------------------------------------------------------------
// Status, snapshot, notes
// ---------------------------------------------------------------------------------------------

/** Whether a status closes (locks) the item. */
export const isClosing = (status: Ref | LookupDoc | undefined | null) => !!status?.disableItemBool;

/**
 * Offer the quick status note while the status is being changed to a closing one in this edit
 * (ruleQuickStatusNoteBtnVisibility): not on load, not after the save.
 */
export const offersQuickNote = (saved: Item | null, draft: Item) =>
  isClosing(draft.statusRel?.[0]) && draft.statusRel?.[0]?.documentId !== saved?.statusRel?.[0]?.documentId;

/** Fields whose change makes the AI snapshot out of date (ruleTriggerPendingSummaryDescription). */
export const SNAPSHOT_FIELDS = ['statusRel', 'reproduction', 'additionalInformation', 'environmentText', 'browserVersion', 'coreVersion', 'componentVersion', 'description', 'notesCommentsArr'];

/**
 * The flags a change sets: content changes mark the snapshot pending; writing the progress note
 * yourself switches off the AI override (ruleOnProgressNoteChange).
 */
export function changeFlags(changed: string[], draft: Item): Partial<Item> {
  const flags: Partial<Item> = {};
  if (changed.some((f) => SNAPSHOT_FIELDS.includes(f)) && !draft.pendingNewSummaryDescriptionBool) flags.pendingNewSummaryDescriptionBool = true;
  if (changed.includes('progressNote')) flags.userProgressNoteBool = true;
  return flags;
}

/**
 * Raw HTML in a note shows as text: Formbird's form renders a note's detail as HTML, which is why
 * New Item - PreSaveClient (ruleAppendQuickStatusNote) sanitises the quick status note. Tags outside
 * code spans and fenced blocks get an escaped "<"; Markdown and code are left as written.
 */
export function escapeRawHtml(text: string): string {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/<(?=[a-zA-Z!/?])/g, '&lt;')))
    .join('');
}

/** A new note, as sc-note-comment stores it. */
export function newNote(text: string, account: Account, now = new Date(), id: string = crypto.randomUUID()): Note {
  return {
    dataId: id,
    detail: text,
    createdDate: now.toISOString(),
    createdBy: { documentId: account.documentId, name: account.systemHeader?.summaryName ?? account.email ?? '' },
    thumbsUp: 0,
    thumbsDown: 0,
  };
}

/** The notes with a new one at the end (Add note, the quick status note). */
export const withNote = (notes: Note[] | undefined, note: Note) => [...(notes ?? []), note];

// ---------------------------------------------------------------------------------------------
// @mentions and #item links (applied to description, steps, additional information and notes)
// ---------------------------------------------------------------------------------------------

/** The text fields @mentions and #links are turned into links in. */
export const LINKED_TEXT_FIELDS = ['description', 'reproduction', 'additionalInformation'] as const;

/**
 * Turns "@firstlast" into "[@FirstLast](mailto:first.last@…)" when exactly one account's email
 * (without dots and @) starts with it (ruleGetAtNamesInNotes). Mentions already linked are left.
 * The server emails the people mentioned.
 */
export function linkMentions(text: string, emails: string[]): string {
  if (!text) return text;
  let out = text;
  const free = text.replace(/\[@.*?\]/g, '');
  const tokens = (` ${free}`).match(/[\W]@.+?\b/gm) ?? [];
  for (const raw of tokens) {
    if (raw.length < 4) continue;
    const token = raw.trim();
    const seek = token.replace(/@/g, '').toLowerCase();
    const matches = emails.filter((e) => e.replace(/[.@]/g, '').toLowerCase().startsWith(seek));
    if (matches.length !== 1) continue;
    const email = matches[0];
    const [first, last] = email.split('@')[0].split('.');
    const cap = (s: string | undefined) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
    out = out.replace(token, `[@${cap(first)}${cap(last)}](mailto:${email})`);
  }
  return out;
}

/** "#12345" references in a text, with where they are. */
export function findItemRefs(text: string): { match: string; ref: string; index: number }[] {
  if (typeof text !== 'string' || !text) return [];
  return Array.from(text.matchAll(/#(\d+)/g), (m) => ({ match: m[0], ref: m[1], index: m.index ?? 0 }));
}

/**
 * Turns "#12345" into "[0012345](/form/<documentId>)" for items that exist (ruleUrlIdHelper).
 * `resolve` finds an item by its number. The link format is Formbird's, so both apps read it.
 * Returns null when nothing changed.
 */
export async function linkItemRefs(text: string, resolve: (ref: string) => Promise<{ itemId?: string; documentId: string } | null | undefined>): Promise<string | null> {
  const found = findItemRefs(text);
  if (!found.length) return null;
  let out = text;
  for (const { match, ref, index } of [...found].reverse()) {
    // A reference already inside a link's text ("[#12345](…)") stays as it is.
    if (out[index - 1] === '[' || out[index - 1] === '/') continue;
    const item = await resolve(ref).catch(() => null);
    if (!item) continue;
    out = `${out.slice(0, index)}[${item.itemId ?? ref}](/form/${item.documentId})${out.slice(index + match.length)}`;
  }
  return out === text ? null : out;
}

/** The app's link for a stored Formbird link ("/form/<id>" → the item page). */
export const appLinkFor = (href: string) => {
  const m = /^(?:https?:\/\/[^/]+)?\/?form\/([\w-]+)/.exec(href);
  return m ? `/items/${m[1]}` : null;
};

// ---------------------------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------------------------

export const RELATIONSHIP_TYPES: RelationshipType[] = ['Related', 'Parent', 'Child'];
const reciprocal: Record<RelationshipType, RelationshipType> = { Related: 'Related', Parent: 'Child', Child: 'Parent' };

export interface PlannedUpdate {
  documentId: string;
  itemId?: string;
  change: Partial<Item>;
}

/**
 * Linking items (ruleAddRelationships): each other item gets this one with the reciprocal type
 * (Parent ↔ Child), and this item gets each of them. Links that already exist get the new type.
 * Returns the saves to make, or an error message.
 */
export function planLink(self: Item, others: Item[], type: RelationshipType, account: Account, now = new Date()): PlannedUpdate[] | string {
  if (!type) return 'Relation Type missing. Please select one.';
  if (!others.length) return 'Item missing. Please select an Item to add.';
  if (others.length > MAX_RELATIONSHIP_BATCH) return `Cannot link more than ${MAX_RELATIONSHIP_BATCH} items at a time`;
  const stamp = authorship(account, now);
  const updates: PlannedUpdate[] = [];
  const mine: Relationship[] = structuredClone(self.relationshipsRel ?? []);
  let changedMine = false;
  const selfName = self.systemHeader?.summaryName ?? `${self.itemRef}: ${self.summary}`;

  for (const other of others) {
    const theirs: Relationship[] = structuredClone(other.relationshipsRel ?? []);
    const back: Relationship = { documentId: self.documentId, name: selfName, relationshipType: reciprocal[type] };
    const i = theirs.findIndex((r) => r.documentId === self.documentId);
    let changed = false;
    if (i < 0) {
      theirs.push(back);
      changed = true;
    } else if (theirs[i].relationshipType !== back.relationshipType || theirs[i].name !== back.name) {
      theirs[i] = { ...theirs[i], relationshipType: back.relationshipType, name: back.name };
      changed = true;
    }
    if (changed) updates.push({ documentId: other.documentId, itemId: other.itemId, change: { ...stamp, relationshipsRel: theirs } });

    const to: Relationship = { name: other.systemHeader?.summaryName ?? '', itemId: other.itemId, relationshipType: type, documentId: other.documentId };
    const j = mine.findIndex((r) => r.documentId === other.documentId);
    if (j < 0) {
      mine.push(to);
      changedMine = true;
    } else if (mine[j].relationshipType !== type || mine[j].name !== to.name) {
      mine[j] = { ...mine[j], relationshipType: type, name: to.name };
      changedMine = true;
    }
  }
  if (changedMine) updates.push({ documentId: self.documentId, itemId: self.itemId, change: { ...stamp, relationshipsRel: mine } });
  return updates;
}

/**
 * Unlinking items (ruleRemoveRelationships): each item loses its link to this one, and this one
 * loses its links to them. Returns the saves to make, or an error message.
 */
export function planUnlink(self: Item, others: Item[], account: Account, now = new Date()): PlannedUpdate[] | string {
  if (!others.length) return 'Items not selected. Please select Item(s) from the table above to remove.';
  if (!self.relationshipsRel?.length) return 'Items selected but none stored. Please contact an administrator.';
  if (others.length > MAX_RELATIONSHIP_BATCH) return `Only ${MAX_RELATIONSHIP_BATCH} items can be unlinked at one time`;
  const stamp = authorship(account, now);
  const updates: PlannedUpdate[] = [];
  const ids = new Set(others.map((o) => o.documentId));
  for (const other of others) {
    const before = other.relationshipsRel ?? [];
    const after = before.filter((r) => r.documentId !== self.documentId);
    if (after.length !== before.length) updates.push({ documentId: other.documentId, itemId: other.itemId, change: { ...stamp, relationshipsRel: after } });
  }
  const mine = self.relationshipsRel.filter((r) => !ids.has(r.documentId));
  if (mine.length !== self.relationshipsRel.length) updates.push({ documentId: self.documentId, itemId: self.itemId, change: { ...stamp, relationshipsRel: mine } });
  return updates;
}

// ---------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------

/** The fields the history compares between versions (ruleLoadVersions). */
export const HISTORY_FIELDS = [
  'projectRel', 'typeRel', 'severityRel', 'priorityRel', 'reproducibilityRel', 'categoryRel', 'tagsRel', 'assigneeRel', 'statusRel',
  'resolutionRel', 'monitoringRel', 'feedbackRel', 'exampleLink', 'environmentText', 'browserVersion', 'coreVersion', 'componentVersion',
  'description', 'reproduction', 'additionalInformation', 'fileAttachArr', 'relationshipsRel', 'notesCommentsArr', 'summary', 'progressNote',
] as const;

export interface HistoryChange {
  field: string;
  label: string;
  kind: 'added' | 'removed' | 'changed' | 'note';
  /** The new value, shortened (names for links). */
  value?: string;
}

export interface VersionEntry {
  versionId?: string;
  date?: string;
  by?: string;
  current: boolean;
  initial: boolean;
  changes: HistoryChange[];
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const shown = (v: unknown): string => {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? String((x as Ref).name ?? (x as { fileName?: string }).fileName ?? '') : String(x))).filter(Boolean).join(', ');
  if (typeof v === 'string') return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  return v === undefined || v === null ? '' : String(v);
};
const sameValue = (a: unknown, b: unknown) => {
  if (Array.isArray(a) && Array.isArray(b) && a.every((x) => x && typeof x === 'object' && 'documentId' in x)) {
    return a.length === b.length && a.every((x, i) => (x as Ref).documentId === (b[i] as Ref)?.documentId && (x as Relationship).relationshipType === (b[i] as Relationship)?.relationshipType);
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * What changed in each version, oldest first. Versions come from a search with all versions,
 * sorted by systemHeader.createdDate. Each version's author is its own updatedByRel.
 */
export function versionHistory(versions: Item[]): VersionEntry[] {
  return versions.map((v, i) => {
    const prior = versions[i - 1];
    const changes: HistoryChange[] = [];
    if (prior) {
      for (const field of HISTORY_FIELDS) {
        const before = prior[field];
        const after = v[field];
        if (isEmpty(before) && isEmpty(after)) continue;
        if (sameValue(before, after)) continue;
        const label = FIELD_LABELS[field] ?? field;
        if (field === 'notesCommentsArr') {
          const added = (after as Note[] | undefined)?.length ?? 0;
          const had = (before as Note[] | undefined)?.length ?? 0;
          changes.push({ field, label, kind: 'note', value: added > had ? `${added - had} note${added - had === 1 ? '' : 's'} added` : 'notes changed' });
        } else if (isEmpty(before)) changes.push({ field, label, kind: 'added', value: shown(after) });
        else if (isEmpty(after)) changes.push({ field, label, kind: 'removed' });
        else changes.push({ field, label, kind: 'changed', value: shown(after) });
      }
    }
    const by = (v.updatedByRel?.[0] ?? (v.updateByRel as Ref[] | undefined)?.[0] ?? (i === 0 ? v.createdByRel?.[0] : undefined))?.name;
    return {
      versionId: v.systemHeader?.versionId,
      date: v.systemHeader?.createdDate,
      by,
      current: v.systemHeader?.currentVersion === true,
      initial: i === 0,
      changes,
    };
  });
}

/** A version's changes as one line, the way the old history table wrote them. */
export const describeChanges = (entry: VersionEntry) =>
  entry.initial ? 'Initial version' : entry.changes.map((c) => (c.kind === 'note' ? c.value : c.kind === 'removed' ? `Removed ${c.label}` : `${c.kind === 'added' ? 'Added' : 'Changed'} ${c.label}${c.value ? ` to ${c.value}` : ''}`)).join(' · ') || 'No tracked changes';

// ---------------------------------------------------------------------------------------------
// Saving an item
// ---------------------------------------------------------------------------------------------

export interface Problem {
  field: string;
  message: string;
}

/** The template's mandatory fields. */
export const REQUIRED: { field: keyof Item & string; label: string }[] = [
  { field: 'projectRel', label: 'Project' },
  { field: 'typeRel', label: 'Type' },
  { field: 'summary', label: 'Summary' },
  { field: 'statusRel', label: 'Status' },
  { field: 'description', label: 'Description' },
  { field: 'reporterRel', label: 'Reporter' },
];

/** What must be fixed before an item can be saved. */
export function validateItem(draft: Item, saved: Item | null): Problem[] {
  const problems: Problem[] = [];
  for (const { field, label } of REQUIRED) {
    const v = draft[field];
    if (isEmpty(typeof v === 'string' ? v.trim() : v)) problems.push({ field, message: `${label} is required.` });
  }
  if (saved?.systemHeader?.currentVersion === false) problems.push({ field: 'systemHeader', message: 'Changes to non-current versions should be avoided unless re-instating. Open the current version instead.' });
  if (draft.exampleLink && !/^https?:\/\/\S+$/i.test(draft.exampleLink.trim())) problems.push({ field: 'exampleLink', message: 'Example Link must be a web address (http:// or https://).' });
  return problems;
}

/** The fields that differ between the saved item and the draft (what a PUT sends). */
export function changedFields(saved: Item | null, draft: Item): string[] {
  const keys = new Set([...Object.keys(saved ?? {}), ...Object.keys(draft)]);
  const skip = new Set(['systemHeader', 'documentId', '_id']);
  return [...keys].filter((k) => !skip.has(k) && JSON.stringify(saved?.[k] ?? null) !== JSON.stringify(draft[k] ?? null));
}

/** Whether the server will email about a save at all (the scheduler's account doesn't). */
export const emailsAbout = (accountId: string) => accountId !== SYSTEM_ADMIN_ID;

// ---------------------------------------------------------------------------------------------
// Saved filters (All Items)
// ---------------------------------------------------------------------------------------------

/** A saved filter from the filter fields that are set; the error when none are. */
export function toSavedFilter(name: string, filters: Record<string, unknown>, fields: readonly string[]): SavedFilter | string {
  const saved: SavedFilter = { name };
  for (const f of fields) {
    const v = filters[f];
    if (v !== undefined && !(Array.isArray(v) && !v.length) && v !== '') saved[f] = v;
  }
  return Object.keys(saved).length < 2 ? 'Please enter one or more filter items to save.' : saved;
}

/** Adds (or, with `replace`, overwrites) a saved filter; the error when the name is taken. */
export function putSavedFilter(list: SavedFilter[], filter: SavedFilter, replace = false): SavedFilter[] | string {
  const name = filter.name.trim();
  if (!name) return 'Please enter a name for the filter.';
  const i = list.findIndex((f) => f.name === name);
  if (i >= 0 && !replace) return 'The filter name already exists.';
  return i >= 0 ? list.map((f, j) => (j === i ? { ...filter, name } : f)) : [...list, { ...filter, name }];
}

export function renameSavedFilter(list: SavedFilter[], from: string, to: string): SavedFilter[] | string {
  const name = to.trim();
  if (!name || name === from) return list;
  if (list.some((f) => f.name === name)) return 'The filter name already exists.';
  return list.map((f) => (f.name === from ? { ...f, name } : f));
}

export const removeSavedFilter = (list: SavedFilter[], name: string) => list.filter((f) => f.name !== name);

/** The filter fields a saved filter sets (others are cleared when it loads). */
export function fromSavedFilter(filter: SavedFilter, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => filter[f] !== undefined).map((f) => [f, filter[f]]));
}

// ---------------------------------------------------------------------------------------------
// My View board
// ---------------------------------------------------------------------------------------------

/** Cards in a cell: highest priority first, then highest severity (by indexNum). */
export function byUrgency(a: Item, b: Item): number {
  const p = (b.priorityRel?.[0]?.indexNum ?? 0) - (a.priorityRel?.[0]?.indexNum ?? 0);
  return p || (b.severityRel?.[0]?.indexNum ?? 0) - (a.severityRel?.[0]?.indexNum ?? 0);
}

/** Items by assignee name (the board's lanes), names in order. */
export function lanesOf(items: Item[]): { name: string; assignee?: Ref; items: Item[] }[] {
  const lanes = new Map<string, { name: string; assignee?: Ref; items: Item[] }>();
  for (const item of items) {
    const assignee = item.assigneeRel?.[0];
    const name = assignee?.name ?? 'Unassigned';
    if (!lanes.has(name)) lanes.set(name, { name, assignee, items: [] });
    lanes.get(name)!.items.push(item);
  }
  return [...lanes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The save a card dropped on another status (or lane) makes. */
export function boardMove(o: { status?: LookupDoc; assignee?: Ref }, account: Account, now = new Date()): Partial<Item> {
  return {
    ...(o.status ? { statusRel: [toRef('statusRel', o.status)] } : {}),
    ...(o.assignee ? { assigneeRel: [o.assignee] } : {}),
    ...(o.status ? { pendingNewSummaryDescriptionBool: true } : {}),
    ...authorship(account, now),
  };
}

// ---------------------------------------------------------------------------------------------
// Bulk changes (All Items → the bulk updater)
// ---------------------------------------------------------------------------------------------

export const BULK_ACTIONS = ['Update', 'Move', 'Copy'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export interface BulkUpdate {
  statusRel?: Ref[];
  typeRel?: Ref[];
  severityRel?: Ref[];
  priorityRel?: Ref[];
  categoryRel?: Ref[];
  assigneeRel?: Ref[];
  progressNote?: string;
  /** A note added to each item. */
  note?: string;
  /** Tags added to each item's tags. */
  tagsRel?: Ref[];
}

/** Whether an update sets anything (the Update button stays off until it does). */
export const bulkUpdateSetsSomething = (u: BulkUpdate) => Object.values(u).some((v) => (Array.isArray(v) ? v.length : typeof v === 'string' ? v.trim() : v));

/** Where an item keeps its notes: release items (appTags releaseItem) in notesArr, others in notesCommentsArr. */
export const notesFieldOf = (item: Pick<Item, 'appTags'>): 'notesArr' | 'notesCommentsArr' => (item.appTags?.includes('releaseItem') ? 'notesArr' : 'notesCommentsArr');

/** The change an Update makes to one item (ruleUpdateItems). */
export function bulkChange(item: Item, u: BulkUpdate, account: Account, now = new Date()): Partial<Item> {
  const change: Partial<Item> = { ...authorship(account, now) };
  for (const f of ['statusRel', 'typeRel', 'severityRel', 'priorityRel', 'categoryRel', 'assigneeRel'] as const) if (u[f]?.length) change[f] = u[f];
  if (u.progressNote?.trim()) {
    change.progressNote = u.progressNote.trim();
    change.userProgressNoteBool = true;
  }
  if (u.note?.trim()) {
    // Release items keep their notes in notesArr (ruleUpdateItems).
    const field = notesFieldOf(item);
    change[field] = withNote(item[field] as Note[] | undefined, newNote(escapeRawHtml(u.note.trim()), account, now));
  }
  if (u.tagsRel?.length) {
    const have = new Set((item.tagsRel ?? []).map((t) => t.documentId));
    change.tagsRel = [...(item.tagsRel ?? []), ...u.tagsRel.filter((t) => !have.has(t.documentId))];
  }
  if (change.statusRel || change.notesCommentsArr || change.notesArr) change.pendingNewSummaryDescriptionBool = true;
  return change;
}

/** Moving items to another project (ruleMoveAction). */
export const moveChange = (project: Ref, account: Account, now = new Date()): Partial<Item> => ({ projectRel: [project], ...authorship(account, now) });

/**
 * A copy of an item in a project (ruleCopyAction): every field but its identity, a new summary
 * "COPY OF #<ref> - …"; the server numbers the copy.
 */
export function copyOf(item: Item, project: Ref, account: Account, now = new Date()): Record<string, unknown> {
  const skip = new Set(['summary', 'systemHeader', 'documentId', 'itemId', 'itemRef', 'documentIdAlias', 'projectRel', '_id', 'relationshipsRel', 'historyOldRel']);
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) if (!skip.has(k)) copy[k] = v;
  return { ...copy, summary: `COPY OF #${item.itemRef} - ${item.summary ?? ''}`, projectRel: [project], ...authorship(account, now) };
}
