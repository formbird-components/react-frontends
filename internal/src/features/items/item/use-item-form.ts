// The Item form's state: the draft (the saved item with the page's changes), which fields are
// locked and why, what must be fixed before saving, and saving (the whole draft, or a note at once).

import { useMemo, useState } from 'react';
import { api } from '@react-frontends/shared/api';
import { useProject, useAccount } from '@/data/sdms';
import { useSaveItem } from '@/data/save-item';
import { formState, offersQuickNote, validateItem, withNote, type EditableField, type Lock, type Problem } from '@/domain/rules';
import type { Account, Item, Note, Project } from '@/domain/types';
import { editNote, noteFrom, pendingFields, rebaseNotes, replaceNote, setField, withQuickNote, type Patch } from './item-logic';

export type NoteResult = { ok: true; saved: boolean } | { ok: false; error: string };

export interface ItemForm {
  account: Account;
  isNew: boolean;
  /** The item as stored (null for a new item). */
  saved: Item | null;
  /** The item with the page's changes. */
  draft: Item;
  /** The draft's project document (its lookup settings, whether it's inactive). */
  project: Project | null | undefined;
  /** The project document is still loading: lookups and people wait for it. */
  waitingForProject: boolean;
  /** Why a field can't be changed (New Item - onFieldState's lock rules), or null. */
  lockOf: (field: EditableField) => Lock;
  closed: boolean;
  projectInactive: boolean;
  oldVersion: boolean;
  showsRelationships: boolean;
  showsSnapshot: boolean;
  showsDocumentation: boolean;
  set: (field: string, value: unknown) => void;
  setMany: (fields: Record<string, unknown>) => void;
  /** Fields changed on the page. */
  changed: string[];
  dirty: boolean;
  /** The quick status note (#31244) and whether it is offered now. */
  quickNote: string;
  setQuickNote: (text: string) => void;
  offersQuickNote: boolean;
  /** What must be fixed before saving; shown once a save was tried. */
  problems: Problem[];
  showProblems: boolean;
  problemOf: (field: string) => string | undefined;
  /** The last save's error (the server's message). */
  error: string;
  saving: boolean;
  /** Changes with every save and discard (editors close then). */
  version: number;
  save: () => Promise<Item | null>;
  discard: () => void;
  addNote: (text: string) => Promise<NoteResult>;
  changeNote: (note: Note, text: string) => Promise<NoteResult>;
  /** Takes a note change back out of the draft (a note added, or an edit). */
  revertNote: (dataId: string) => void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useItemForm(saved: Item | null, initial: Item): ItemForm {
  const account = useAccount();
  const base = saved ?? initial;
  const [patch, setPatch] = useState<Patch>({});
  const [quickNote, setQuickNote] = useState('');
  const [showProblems, setShowProblems] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const { save: saveItem, saving } = useSaveItem();

  const draft = useMemo(() => ({ ...base, ...patch }) as Item, [base, patch]);
  const projectId = draft.projectRel?.[0]?.documentId;
  const project = useProject(projectId);
  const state = formState(saved, draft, { project: project.data, account });
  const offers = offersQuickNote(saved, draft);
  const changed = pendingFields(base, patch);
  const dirty = changed.length > 0 || (offers && !!quickNote.trim());
  const problems = validateItem(draft, saved);

  const set = (field: string, value: unknown) => {
    setError('');
    setPatch((p) => setField(p, base, field, value));
  };
  const setMany = (fields: Record<string, unknown>) => {
    setError('');
    setPatch((p) => Object.entries(fields).reduce((acc, [k, v]) => setField(acc, base, k, v), p));
  };
  const reset = () => {
    setPatch({});
    setQuickNote('');
    setShowProblems(false);
    setError('');
    setVersion((v) => v + 1);
  };

  /**
   * Saves the draft: checked first (the template's mandatory fields; a refused update only says
   * "Error updating document"), notes rebased on the latest saved ones, the quick status note added
   * last (ruleAppendQuickStatusNote), then useSaveItem links mentions and #numbers, sets the
   * snapshot flags and authorship, and sends what changed.
   */
  async function save(): Promise<Item | null> {
    setError('');
    if (problems.length) {
      setShowProblems(true);
      return null;
    }
    setBusy(true);
    try {
      let next = draft;
      if (saved && (changed.includes('notesCommentsArr') || (offers && quickNote.trim()))) {
        const latest = await api.get<Item>(saved.documentId);
        next = { ...next, notesCommentsArr: rebaseNotes(saved.notesCommentsArr, draft.notesCommentsArr, latest.notesCommentsArr) };
      }
      next = withQuickNote(saved, next, quickNote, account);
      const result = await saveItem(saved, next);
      reset();
      return result;
    } catch (e) {
      setError(messageOf(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  /**
   * A note on its own: saved at once when nothing else is waiting to be saved (on the latest saved
   * notes), otherwise it joins the draft and is saved with the other changes. A new item's notes
   * are saved when it's created.
   */
  async function saveNotes(notes: Note[], apply: (latest: Note[] | undefined) => Note[]): Promise<NoteResult> {
    if (!saved || dirty || validateItem({ ...draft, notesCommentsArr: notes }, saved).length) {
      set('notesCommentsArr', notes);
      if (saved && !dirty) setShowProblems(true);
      return { ok: true, saved: false };
    }
    setBusy(true);
    try {
      const latest = await api.get<Item>(saved.documentId);
      await saveItem(saved, { ...saved, notesCommentsArr: apply(latest.notesCommentsArr) });
      return { ok: true, saved: true };
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    } finally {
      setBusy(false);
    }
  }

  const addNote = (text: string) => {
    const note = noteFrom(text, account);
    return saveNotes(withNote(draft.notesCommentsArr, note), (latest) => withNote(latest, note));
  };

  const changeNote = (note: Note, text: string) => {
    const edited = editNote(note, text);
    return saveNotes(replaceNote(draft.notesCommentsArr, edited), (latest) => replaceNote(latest, edited));
  };

  const revertNote = (dataId: string) => {
    const before = saved?.notesCommentsArr?.find((n) => n.dataId === dataId);
    const notes = draft.notesCommentsArr ?? [];
    set('notesCommentsArr', before ? replaceNote(notes, before) : notes.filter((n) => n.dataId !== dataId));
  };

  return {
    account,
    isNew: state.isNew,
    saved,
    draft,
    project: project.data,
    waitingForProject: !!projectId && project.isPending,
    lockOf: state.lockOf,
    closed: state.closed,
    projectInactive: state.projectInactive,
    oldVersion: state.oldVersion,
    showsRelationships: state.showsRelationships,
    showsSnapshot: state.showsSnapshot,
    showsDocumentation: state.showsDocumentation,
    set,
    setMany,
    changed,
    dirty,
    quickNote,
    setQuickNote,
    offersQuickNote: offers,
    problems,
    showProblems,
    problemOf: (field) => (showProblems ? problems.find((p) => p.field === field)?.message : undefined),
    error,
    saving: saving || busy,
    version,
    save,
    discard: reset,
    addNote,
    changeNote,
    revertNote,
  };
}
