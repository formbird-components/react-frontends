// The Item page's own pure logic: the draft (the changes made on the page, over the saved item),
// notes (added, edited, rebased on the latest saved notes), the quick status note, @mention and
// #item suggestions in the Markdown editors, relationships, attachments and the migrated history.
// The Item template's rules themselves are in domain/rules.ts; this file only arranges them for the page.

import { withBase } from '@react-frontends/shared/api';
import { escapeRawHtml, newNote, offersQuickNote, withNote } from '@/domain/rules';
import type { Account, Attachment, Item, Note, OldHistoryEntry, Relationship, RelationshipType } from '@/domain/types';

/** The fields changed on the page, over the saved item (or a new item's defaults). */
export type Patch = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Empty as a form field: nothing, "", or no links. */
export const isBlank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const unchanged = (before: unknown, after: unknown) => same(before, after) || (isBlank(before) && isBlank(after));

/** Sets a field: a value the same as the base's (or empty where the base is empty) leaves the patch. */
export function setField(patch: Patch, base: Item, field: string, value: unknown): Patch {
  const next = { ...patch };
  if (unchanged(base[field], value)) delete next[field];
  else next[field] = value;
  return next;
}

/** The fields the patch really changes (the saved item may have caught up with some). */
export const pendingFields = (base: Item, patch: Patch) => Object.keys(patch).filter((k) => !unchanged(base[k], patch[k]));

// ---------------------------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------------------------

/** HTML escaping lives with the note rules (domain/rules.ts); re-exported for the page. */
export { escapeRawHtml };

/** A note as typed, ready to store. */
export const noteFrom = (text: string, account: Account, now = new Date()) => newNote(escapeRawHtml(text.trim()), account, now);

/** Only the author changes a note (sc-note-comment's rule). */
export const canEditNote = (note: Note, accountId: string) => !!note.createdBy?.documentId && note.createdBy.documentId === accountId;

/** A note with new text: the text it had goes to its history, as sc-note-comment keeps it. */
export function editNote(note: Note, text: string, now = new Date()): Note {
  const previous = { dataId: note.dataId, detail: note.detail, createdBy: note.createdBy, createdDate: note.createdDate };
  const history = Array.isArray(note.notesHistory) ? (note.notesHistory as unknown[]) : [];
  return { ...note, detail: escapeRawHtml(text.trim()), modifiedDate: now.toISOString(), notesHistory: [...history, previous] };
}

/** The notes with one replaced (by dataId). */
export const replaceNote = (notes: Note[] | undefined, note: Note) => (notes ?? []).map((n) => (n.dataId === note.dataId ? note : n));

/**
 * The page's note changes (notes added, notes edited) applied to the latest saved notes, so a save
 * doesn't drop notes others added since the page loaded.
 */
export function rebaseNotes(saved: Note[] = [], draft: Note[] = [], latest: Note[] = []): Note[] {
  const before = new Map(saved.map((n) => [n.dataId, n]));
  const edited = new Map(draft.filter((n) => before.has(n.dataId) && !same(before.get(n.dataId), n)).map((n) => [n.dataId, n]));
  const have = new Set(latest.map((n) => n.dataId));
  const added = draft.filter((n) => !before.has(n.dataId) && !have.has(n.dataId));
  return [...latest.map((n) => edited.get(n.dataId) ?? n), ...added];
}

/** Notes on the page that aren't saved yet (new or changed), by dataId. */
export function unsavedNoteIds(saved: Note[] = [], draft: Note[] = []): Set<string> {
  const before = new Map(saved.map((n) => [n.dataId, n]));
  return new Set(draft.filter((n) => !before.has(n.dataId) || !same(before.get(n.dataId), n)).map((n) => n.dataId));
}

/**
 * The item as it will be saved, with the quick status note as its last note (New Item -
 * PreSaveClient, ruleAppendQuickStatusNote, #31244). The note counts only while the status is being
 * changed to a closing one (ruleQuickStatusNoteBtnVisibility); it is never stored as a field.
 */
export function withQuickNote(saved: Item | null, draft: Item, text: string, account: Account, now = new Date()): Item {
  if (!text.trim() || !offersQuickNote(saved, draft)) return draft;
  return { ...draft, notesCommentsArr: withNote(draft.notesCommentsArr, noteFrom(text, account, now)) };
}

// ---------------------------------------------------------------------------------------------
// @mentions and #items in the Markdown editors
// ---------------------------------------------------------------------------------------------

export interface Token {
  trigger: '@' | '#';
  /** What's typed after the trigger. */
  query: string;
  /** Where the trigger is, and where the token ends (the caret). */
  start: number;
  end: number;
}

/**
 * The @mention or #item being typed at the caret: the trigger at the start of a word, then word
 * characters. "#" needs at least one (a lone "#" starts a Markdown heading); an email's "@" doesn't count.
 */
export function tokenAt(text: string, caret: number): Token | null {
  const m = /(^|[\s([{>])([@#])([\w.-]{0,40})$/.exec(text.slice(0, caret));
  if (!m) return null;
  const trigger = m[2] as '@' | '#';
  if (trigger === '#' && !m[3]) return null;
  return { trigger, query: m[3], start: caret - m[3].length - 1, end: caret };
}

/** The text with a token replaced (and a space after it), and where the caret goes. */
export function replaceToken(text: string, token: Token, insert: string): { text: string; caret: number } {
  const after = text.slice(token.end);
  const value = /^\s/.test(after) ? insert : `${insert} `;
  return { text: text.slice(0, token.start) + value + after, caret: token.start + value.length };
}

const cap = (s: string | undefined) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');

/** A mention as ruleGetAtNamesInNotes (linkMentions) writes it: "[@JoBloggs](mailto:jo.bloggs@…)". */
export function mentionMarkdown(email: string): string {
  const [first, last] = email.split('@')[0].split('.');
  return `[@${cap(first)}${cap(last)}](mailto:${email})`;
}

/** A link to an item as ruleUrlIdHelper (linkItemRefs) writes it: "[0031492](/form/<id>)". */
export const itemLinkMarkdown = (item: Pick<Item, 'documentId' | 'itemId' | 'itemRef'>) => `[${item.itemId || item.itemRef || item.documentId}](/form/${item.documentId})`;

// ---------------------------------------------------------------------------------------------
// Relationships, attachments, migrated history
// ---------------------------------------------------------------------------------------------

export interface RelationRow {
  /** Unique in the table (unmatched Mantis links share a placeholder documentId). */
  key: string;
  relationship: Relationship;
  type?: RelationshipType;
  /** The related item, when it was found. */
  item?: Item;
  /** Migrated from Mantis and not matched to an item: the Mantis number. */
  unmatched?: string;
  /** Linked, but the item wasn't found (removed, or not yours to see). */
  missing: boolean;
}

/** The relationships table's rows (ruleDisplayRelationships): each link with the item it points to. */
export function relationshipRows(relationships: Relationship[] | undefined, items: Item[]): RelationRow[] {
  const byId = new Map(items.map((i) => [i.documentId, i]));
  return (relationships ?? []).map((r, i) => {
    const item = byId.get(r.documentId);
    return {
      key: `${r.documentId}-${i}`,
      relationship: r,
      type: r.relationshipType,
      item,
      unmatched: !item && r.mantisIssueIdForMatch ? r.mantisIssueIdForMatch : undefined,
      missing: !item && !r.mantisIssueIdForMatch,
    };
  });
}

/** The ids of the items a relationships list links to (unmatched placeholders left out). */
export const relatedIds = (relationships: Relationship[] | undefined) =>
  [...new Set((relationships ?? []).filter((r) => !r.mantisIssueIdForMatch && r.documentId && r.documentId !== 'xx').map((r) => r.documentId))];

const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/** Whether an attachment is an image (by its name, else its type). */
export const isImage = (a: Attachment) => (a.fileName && /\.\w+$/.test(a.fileName) ? IMAGE.test(a.fileName) : /^(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.fileType ?? ''));

/** Where fieldtec-web serves an attachment (with its name, so a download keeps it). */
export const fileUrl = (a: Attachment) => withBase(`/api/getFile/${encodeURIComponent(a.fileNo)}/${encodeURIComponent(a.fileName || a.fileNo)}`);

/** An attachment's extension or type, for its label ("PNG"). */
export const fileKind = (a: Attachment) => (/\.(\w{1,5})$/.exec(a.fileName ?? '')?.[1] ?? a.fileType ?? 'file').toUpperCase();

/** The migrated Mantis history (ruleDisplayHistoryOldData), with its blanks dropped. */
export function oldHistoryRows(entries: OldHistoryEntry[] | undefined) {
  return (entries ?? []).map((e, i) => ({
    key: `${e.createdDate}-${i}`,
    date: e.createdDate,
    user: e.user?.name ?? '',
    message: e.message ?? '',
    change: e.change ?? '',
  }));
}
