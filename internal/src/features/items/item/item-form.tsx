// The Item form: the page is the form. The summary is the title; Description, Steps to Reproduce
// and Additional Information are Markdown edited in place; details, attachments, relationships,
// snapshot, notes, documentation and history follow; the properties sit beside them (above them,
// folded, on a phone). Changes wait in a draft until Save in the bar at the bottom.

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Lock, Save } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Alert, Page } from '@react-frontends/shared/components';
import { relative } from '@react-frontends/shared/format';
import { Button, Dialog, DialogContent, DialogFooter } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { ItemStatus, TypeIcon } from '@/components/item-bits';
import { FIELD_LABELS } from '@/domain/model';
import { LOCK_REASONS } from '@/domain/rules';
import type { Item } from '@/domain/types';
import { HistorySection } from './history';
import { MarkdownField } from './markdown-editor';
import { NotesSection } from './notes';
import { CopyLinkButton, PropertiesPanel } from './properties-panel';
import { RelationshipsSection } from './relationships';
import { AttachmentsSection, DetailsSection, DocumentationSection, SnapshotSection } from './sections';
import { useItemForm, type ItemForm } from './use-item-form';

/** "← All items": back where the person came from in this app, else to All Items. */
export function BackLink() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Link
      to="/items"
      onClick={(e) => {
        if (location.key === 'default') return;
        e.preventDefault();
        navigate(-1);
      }}
      className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      All items
    </Link>
  );
}

/** The summary as the page's title: a heading-sized field that grows with the text. */
function SummaryField({ form }: { form: ItemForm }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const value = form.draft.summary ?? '';
  const locked = !!form.lockOf('summary');
  const error = form.problemOf('summary');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, locked]);
  if (locked) return <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-[1.7rem]">{value || '(no summary)'}</h1>;
  return (
    <div id="field-summary" className="scroll-mt-24">
      <h1 className="sr-only">{value || 'New item'}</h1>
      <textarea
        ref={ref}
        id="summary"
        rows={1}
        value={value}
        autoFocus={form.isNew}
        aria-label="Summary"
        aria-invalid={!!error || undefined}
        aria-describedby={error ? 'summary-error' : undefined}
        placeholder="Summary"
        onChange={(e) => form.set('summary', e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        className="block w-full resize-none sm:-ml-2.5 sm:w-[calc(100%+0.625rem)] overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl leading-snug font-semibold tracking-tight transition-colors placeholder:text-muted-foreground/60 hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none aria-invalid:border-danger sm:text-[1.7rem]"
      />
      {error && (
        <p id="summary-error" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Header({ form }: { form: ItemForm }) {
  const { draft, saved } = form;
  const type = draft.typeRel?.[0]?.name;
  return (
    <header className="mb-6 grid gap-2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
        <TypeIcon name={type} withName={!!type} />
        {saved ? (
          <span className="font-mono text-[0.8rem] tabular-nums">{saved.itemId ?? saved.itemRef}</span>
        ) : (
          <span className="font-medium text-foreground">New item</span>
        )}
        {draft.projectRel?.[0] && (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{draft.projectRel[0].name}</span>
          </>
        )}
      </div>
      <SummaryField form={form} />
      {saved && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          <ItemStatus value={draft.statusRel} className="font-medium text-foreground" fallback="No status" />
          {draft.priorityRel?.[0] && <span>{draft.priorityRel[0].name} priority</span>}
          <span>
            Reported by {draft.reporterRel?.[0]?.name ?? 'someone'} {relative(saved.createdDate ?? saved.systemHeader?.documentCreatedDate)}
          </span>
          {saved.itemRef && <CopyLinkButton itemRef={saved.itemRef} className="ml-auto hidden h-7 md:inline-flex lg:hidden" />}
        </div>
      )}
    </header>
  );
}

/** Why the item can't be changed (closed, inactive project, old version). */
function Locks({ form }: { form: ItemForm }) {
  if (form.oldVersion) return <Alert tone="warning">{LOCK_REASONS['old-version']}</Alert>;
  if (form.projectInactive) return <Alert tone="warning">{LOCK_REASONS['inactive-project']}</Alert>;
  if (form.closed) {
    const reopening = !form.draft.statusRel?.[0]?.disableItemBool;
    return (
      <div role="status" className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 px-3.5 py-2.5 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{reopening ? 'Save to reopen the item. Its other fields unlock after the save.' : LOCK_REASONS.closed}</span>
      </div>
    );
  }
  return null;
}

/** What to fix before saving, each a link to its field. */
function Problems({ form }: { form: ItemForm }) {
  if (!form.showProblems || !form.problems.length) return null;
  const go = (field: string) => {
    const box = document.getElementById(`field-${field}`);
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = document.getElementById(field) ?? box?.querySelector<HTMLElement>('button, textarea, input');
    target?.focus({ preventScroll: true });
  };
  return (
    <Alert>
      <p className="font-medium">Fix {form.problems.length === 1 ? 'this' : `these ${form.problems.length} things`} before saving:</p>
      <ul className="mt-1 grid gap-0.5">
        {form.problems.map((p) => (
          <li key={p.field + p.message}>
            {p.field in FIELD_LABELS ? (
              <button type="button" className="cursor-pointer text-left underline-offset-2 hover:underline" onClick={() => go(p.field)}>
                {p.message}
              </button>
            ) : (
              p.message
            )}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function SaveBar({ form, onSave }: { form: ItemForm; onSave: () => void }) {
  const problems = form.showProblems ? form.problems.length : 0;
  const message = form.error || (problems ? `${problems} ${problems === 1 ? 'problem' : 'problems'} to fix` : form.isNew ? 'Not created yet' : 'Unsaved changes');
  const bad = !!form.error || problems > 0;
  return (
    <div className="sticky bottom-3 z-30 flex justify-center">
      <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-border bg-popover py-2 pr-2 pl-4 shadow-pop animate-in sm:gap-3">
        <span className={cn('size-2 shrink-0 rounded-full', bad ? 'bg-danger' : 'bg-warning')} />
        <span role={bad ? 'alert' : 'status'} title={message} className={cn('min-w-0 flex-1 truncate text-sm', bad && 'font-medium text-danger')}>
          {message}
        </span>
        <Button variant="ghost" size="sm" onClick={form.discard} disabled={!form.dirty || form.saving}>
          Discard
        </Button>
        <Button size="sm" onClick={onSave} disabled={form.saving || (!form.isNew && !form.dirty)}>
          {form.saving ? <Loader2 className="animate-spin" /> : <Save />}
          {form.isNew ? 'Create item' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function Column({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-1 content-start gap-6">{children}</div>;
}

export function ItemFormPage({ saved, initial }: { saved: Item | null; initial: Item }) {
  const form = useItemForm(saved, initial);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { draft } = form;
  const editable = !form.oldVersion;
  const label = saved?.itemId ?? 'this item';

  // Leaving with unsaved changes asks first (in the app), and the browser warns on reload or close.
  const dirtyRef = useRef(false);
  const leavingRef = useRef(false);
  dirtyRef.current = form.dirty && editable;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && !leavingRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!form.dirty || !editable) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [form.dirty, editable]);

  const save = async () => {
    const result = await form.save();
    if (!result) return;
    if (!saved) {
      toast.success(`Item ${result.itemId ?? result.itemRef ?? ''} created`.replace(/\s+/g, ' '));
      // Search finds a new item a second or so after it's saved: tell the item page where it is.
      const ref = result.itemRef || result.documentId;
      queryClient.setQueryData(['item-id', ref], result.documentId);
      queryClient.setQueryData(['record', result.documentId], result);
      leavingRef.current = true;
      navigate(`/items/${ref}`, { replace: true });
    } else {
      toast.success(`${result.itemId ?? 'Item'} saved`);
    }
  };

  // Ctrl/⌘ + S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirtyRef.current || !saved) void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saved]);

  const text = (field: 'description' | 'reproduction' | 'additionalInformation', label: string, o: { required?: boolean; placeholder: string; empty: string }) => (
    <MarkdownField
      key={`${field}-${form.version}`}
      id={field}
      label={label}
      value={draft[field]}
      savedValue={saved?.[field]}
      onChange={(v) => form.set(field, v)}
      itemId={saved?.documentId}
      required={o.required}
      locked={!!form.lockOf(field)}
      error={form.problemOf(field)}
      placeholder={o.placeholder}
      empty={o.empty}
      startEditing={form.isNew}
      minRows={form.isNew ? (o.required ? 6 : 3) : 6}
    />
  );

  return (
    <Page>
      <BackLink />
      <Header form={form} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Column>
          <Locks form={form} />
          <Problems form={form} />
          <div className="grid min-w-0 grid-cols-1 gap-6 rounded-xl border border-border bg-card px-5 py-5 shadow-card sm:px-6">
            {text('description', 'Description', { required: true, placeholder: 'What happens, and what should happen instead', empty: 'No description.' })}
            <div className="border-t border-border" />
            {text('reproduction', 'Steps to reproduce', { placeholder: 'Add steps to reproduce', empty: 'No steps to reproduce.' })}
            <div className="border-t border-border" />
            {text('additionalInformation', 'Additional information', { placeholder: 'Add more information', empty: 'No additional information.' })}
          </div>
          <DetailsSection form={form} />
          {!form.isNew && <AttachmentsSection files={saved?.fileAttachArr} />}
          {form.showsRelationships && saved && <RelationshipsSection form={form} />}
          {form.showsSnapshot && <SnapshotSection form={form} />}
          <NotesSection form={form} />
          {form.showsDocumentation && <DocumentationSection form={form} />}
          {saved && <HistorySection item={saved} />}
          {/* In the main column, so the toasts (bottom right) don't cover it. */}
          {editable && (form.dirty || form.isNew) && <SaveBar form={form} onSave={() => void save()} />}
        </Column>

        <aside aria-label="Properties" className="order-first lg:sticky lg:top-20 lg:order-none lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-xl">
          <PropertiesPanel form={form} />
        </aside>
      </div>

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(o) => !o && blocker.reset?.()}>
        <DialogContent title="Leave without saving?" description={`Your changes to ${form.isNew ? 'the new item' : label} haven’t been saved.`}>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Stay
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
