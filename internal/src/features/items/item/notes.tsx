// Notes (the template's Activity panel, sc-note-comment): Markdown notes with their author, when,
// and replies on older items; a note can be added, and its author can change it.
//
// How a note meets other unsaved changes: with nothing else waiting, adding (or changing) a note
// saves it at once, on the latest saved notes. While other changes wait, it joins them and is saved
// with them (shown as "Not saved" until then, and it can be taken back out). A new item's notes are
// saved when it's created.

import { Loader2, MessageSquare, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDateTime, relative } from '@react-frontends/shared/format';
import { Alert } from '@react-frontends/shared/components';
import { Badge, Button, PersonAvatar, Tip } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { SdmsMarkdown } from '@/components/sdms-markdown';
import { LOCK_REASONS } from '@/domain/rules';
import type { Note } from '@/domain/types';
import { MarkdownEditor } from './markdown-editor';
import { canEditNote, unsavedNoteIds } from './item-logic';
import { Section } from './sections';
import type { ItemForm } from './use-item-form';

/** Notes shown before "Show earlier notes". */
const RECENT = 8;

function NoteTime({ value, edited }: { value: string | undefined; edited?: unknown }) {
  if (!value) return null;
  return (
    <span className="text-xs text-muted-foreground">
      <Tip content={formatDateTime(value)}>
        <time dateTime={value}>{relative(value)}</time>
      </Tip>
      {typeof edited === 'string' && edited && (
        <Tip content={`Edited ${formatDateTime(edited)}`}>
          <span> · edited</span>
        </Tip>
      )}
    </span>
  );
}

function NoteEditor({ form, note, onDone }: { form: ItemForm; note: Note; onDone: () => void }) {
  const [text, setText] = useState(note.detail);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim() || text.trim() === note.detail.trim()) return onDone();
    setBusy(true);
    const result = await form.changeNote(note, text);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.saved) toast.success('Note saved');
    onDone();
  };
  return (
    <div className="grid grid-cols-1 gap-2">
      <MarkdownEditor value={text} onChange={setText} itemId={form.saved?.documentId} minRows={3} autoFocus label="Note" onSubmit={() => void submit()} />
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={busy || !text.trim()}>
          {busy && <Loader2 className="animate-spin" />}
          {form.dirty || !form.saved ? 'Update' : 'Save note'}
        </Button>
      </div>
    </div>
  );
}

function NoteItem({ form, note, unsaved, locked }: { form: ItemForm; note: Note; unsaved: boolean; locked: boolean }) {
  const [editing, setEditing] = useState(false);
  const author = note.createdBy?.name ?? 'Someone';
  const mine = canEditNote(note, form.account.documentId);
  const replies = Array.isArray(note.comments) ? note.comments : [];
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
      <span className="relative z-10 rounded-full ring-4 ring-card">
        <PersonAvatar name={author} size={28} />
      </span>
      <div className="min-w-0">
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{author}</span>
          <NoteTime value={note.createdDate} edited={note.modifiedDate} />
          {unsaved && <Badge tone="warning">Not saved</Badge>}
          <span className="ml-auto flex items-center gap-1">
            {unsaved && !editing && (
              <Tip content="Take this change out">
                <Button variant="ghost" size="icon-sm" aria-label="Take this change out" onClick={() => form.revertNote(note.dataId)}>
                  <Undo2 />
                </Button>
              </Tip>
            )}
            {mine && !locked && !editing && (
              <Tip content="Edit your note">
                <Button variant="ghost" size="icon-sm" aria-label="Edit your note" onClick={() => setEditing(true)}>
                  <Pencil />
                </Button>
              </Tip>
            )}
          </span>
        </div>
        {editing ? (
          <div className="mt-2">
            <NoteEditor form={form} note={note} onDone={() => setEditing(false)} />
          </div>
        ) : (
          <div className={cn('mt-1.5 rounded-lg rounded-tl-sm bg-muted/60 px-3.5 py-2.5', unsaved && 'ring-1 ring-warning/50')}>
            <SdmsMarkdown text={note.detail} empty="(empty note)" />
          </div>
        )}
        {replies.length > 0 && (
          <ul className="mt-3 grid gap-3 border-l-2 border-border pl-4" aria-label={`Replies to ${author}`}>
            {replies.map((r) => (
              <li key={r.dataId} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5">
                <PersonAvatar name={r.createdBy?.name ?? '?'} size={22} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-medium">{r.createdBy?.name ?? 'Someone'}</span>
                    <NoteTime value={r.createdDate} />
                  </div>
                  <SdmsMarkdown text={r.detail} className="mt-1" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Composer({ form, locked }: { form: ItemForm; locked: boolean }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const joins = form.dirty || !form.saved;
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    const result = await form.addNote(text);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setText('');
    if (result.saved) toast.success('Note added');
  };
  if (locked) return null;
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-border pt-4">
      <MarkdownEditor id="new-note" value={text} onChange={setText} itemId={form.saved?.documentId} minRows={3} label="Add a note" placeholder="Add a note" onSubmit={() => void submit()} />
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {!form.saved ? 'Saved when the item is created.' : joins ? 'Saved with your other changes.' : 'Saved straight away.'}
          <span className="hidden sm:inline"> Ctrl + Enter to add.</span>
        </span>
        <Button size="sm" onClick={() => void submit()} disabled={!text.trim() || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <MessageSquare />}
          Add note
        </Button>
      </div>
    </div>
  );
}

export function NotesSection({ form }: { form: ItemForm }) {
  const notes = form.draft.notesCommentsArr ?? [];
  const unsaved = unsavedNoteIds(form.saved?.notesCommentsArr, notes);
  const lock = form.lockOf('notesCommentsArr');
  const [showAll, setShowAll] = useState(false);
  const hidden = showAll ? 0 : Math.max(0, notes.length - RECENT);
  const shown = notes.slice(hidden);
  return (
    <Section
      id="notes"
      title={
        <span className="inline-flex items-center gap-2">
          Notes {notes.length > 0 && <Badge>{notes.length}</Badge>}
        </span>
      }
      description={lock && lock !== 'read-only' ? LOCK_REASONS[lock] : undefined}
    >
      <div className="grid grid-cols-1 gap-4">
        {hidden > 0 && (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setShowAll(true)}>
            Show {hidden} earlier {hidden === 1 ? 'note' : 'notes'}
          </Button>
        )}
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ol className="relative grid grid-cols-1 gap-5 before:absolute before:top-3 before:bottom-3 before:left-[13px] before:w-px before:bg-border">
            {shown.map((n) => (
              <NoteItem key={n.dataId} form={form} note={n} unsaved={unsaved.has(n.dataId)} locked={!!lock} />
            ))}
          </ol>
        )}
        <Composer form={form} locked={!!lock} />
      </div>
    </Section>
  );
}
