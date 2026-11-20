// Saving an item, the way Formbird's form does before it sends it (New Item - PreSaveClient and the
// onFieldState rules that run as fields change): @mentions and "#12345" become links in the text
// that changed, the snapshot flags are set, and who/when is stamped. A new item is created from the
// Item template (the server numbers it); a change sends only the fields that changed.

import { useState } from 'react';
import { useCreateDocument, useUpdateDocument } from '@react-frontends/shared/data';
import { ITEM_TEMPLATE_ID } from '@/domain/model';
import { authorship, changedFields, changeFlags, LINKED_TEXT_FIELDS, linkItemRefs, linkMentions } from '@/domain/rules';
import type { Account, Item, Note } from '@/domain/types';
import { findItemByNumber, ITEMS, useAccount, useMentionEmails } from './sdms';

/** Links @mentions and #item numbers in a text; returns it unchanged when there are none. */
export async function linkText(text: string, emails: string[]): Promise<string> {
  const mentioned = linkMentions(text, emails);
  return (await linkItemRefs(mentioned, findItemByNumber)) ?? mentioned;
}

/** The fields to send: the draft's changes with links, flags and authorship (or the whole item when new). */
export async function prepareSave(saved: Item | null, draft: Item, account: Account, emails: string[], now = new Date()): Promise<Record<string, unknown>> {
  const out: Item = structuredClone(draft);
  const changed = changedFields(saved, draft);

  for (const field of LINKED_TEXT_FIELDS) {
    const text = out[field];
    if (changed.includes(field) && typeof text === 'string' && text) out[field] = await linkText(text, emails);
  }
  if (changed.includes('notesCommentsArr')) {
    const before = new Map((saved?.notesCommentsArr ?? []).map((n) => [n.dataId, n.detail]));
    out.notesCommentsArr = await Promise.all(
      (out.notesCommentsArr ?? []).map(async (n: Note) => (before.get(n.dataId) === n.detail ? n : { ...n, detail: await linkText(n.detail, emails) })),
    );
  }
  // The form ticks "Disable AI override" as the progress note is typed (ruleOnProgressNoteChange) and
  // people may untick it again, so only the snapshot flag is set here.
  const { userProgressNoteBool: _typed, ...flags } = changeFlags(changed, out);
  Object.assign(out, flags, authorship(account, now));

  if (!saved) {
    const { documentId: _id, systemHeader: _sh, ...fields } = out;
    return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  }
  const send = new Set([...changedFields(saved, out)]);
  return Object.fromEntries(
    [...send].map((k) => {
      const v = out[k];
      // A field cleared on the form is sent empty, so the stored value goes.
      if (v === undefined) return [k, /(Rel|Arr)$/.test(k) ? [] : null];
      return [k, v];
    }),
  );
}

/** Saves an item: creates it when `saved` is null, otherwise sends what changed. */
export function useSaveItem() {
  const account = useAccount();
  const emails = useMentionEmails();
  const create = useCreateDocument<Item>(ITEM_TEMPLATE_ID, { group: ITEMS, defaults: { appTags: ['sdms', 'item'] }, missing: 'The Item template isn’t available on this server.' });
  const update = useUpdateDocument<Item>(ITEMS);
  const [preparing, setPreparing] = useState(false);

  async function save(saved: Item | null, draft: Item): Promise<Item> {
    setPreparing(true);
    let fields: Record<string, unknown>;
    try {
      fields = await prepareSave(saved, draft, account, emails.data ?? []);
    } finally {
      setPreparing(false);
    }
    if (!saved) return create.mutateAsync(fields);
    return update.mutateAsync({ documentId: saved.documentId, fields });
  }

  return { save, saving: preparing || create.isPending || update.isPending };
}
