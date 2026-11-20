// The Item page's simpler sections: the card they sit in, the details (links and versions), the
// attached files, the snapshot and the documentation.

import { ExternalLink, FileText, ImageOff, Paperclip } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, Button, Checkbox, Input, Textarea, Tip } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { SdmsMarkdown } from '@/components/sdms-markdown';
import type { Attachment } from '@/domain/types';
import { MarkdownField } from './markdown-editor';
import { fileKind, fileUrl, isImage } from './item-logic';
import type { ItemForm } from './use-item-form';

/** A section of the main column: a titled card. */
export function Section({ id, title, description, actions, children, className }: { id: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('min-w-0 scroll-mt-20 rounded-xl border border-border bg-card shadow-card', className)}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-4 pb-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="min-w-0 px-5 pb-5 sm:px-6">{children}</div>
    </section>
  );
}

const TEXT_FIELDS = [
  { field: 'environmentText', label: 'Environment', placeholder: 'e.g. Production, UAT' },
  { field: 'browserVersion', label: 'Browser version', placeholder: 'e.g. Chrome 141' },
  { field: 'coreVersion', label: 'Core version', placeholder: 'e.g. 5.12.3' },
  { field: 'componentVersion', label: 'Component version', placeholder: 'e.g. sc-uploader 2.4' },
] as const;

/** Example Link, Environment, Browser / Core / Component Version (the template's Details panel). */
export function DetailsSection({ form }: { form: ItemForm }) {
  const { draft } = form;
  const link = draft.exampleLink ?? '';
  const linkError = form.problemOf('exampleLink');
  const opens = /^https?:\/\/\S+$/i.test(link.trim());
  return (
    <Section id="details" title="Details">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div id="field-exampleLink" className="grid scroll-mt-24 gap-1.5 sm:col-span-2">
          <label htmlFor="exampleLink" className="text-[13px] font-medium">
            Example link
          </label>
          <div className="flex gap-2">
            <Input
              id="exampleLink"
              type="url"
              inputMode="url"
              value={link}
              disabled={!!form.lockOf('exampleLink')}
              aria-invalid={!!linkError || undefined}
              aria-describedby={linkError ? 'exampleLink-error' : undefined}
              placeholder={form.lockOf('exampleLink') ? undefined : 'https://'}
              onChange={(e) => form.set('exampleLink', e.target.value)}
            />
            {opens && (
              <Tip content="Open the link">
                <Button asChild variant="outline" size="icon" aria-label="Open the example link">
                  <a href={link.trim()} target="_blank" rel="noreferrer noopener">
                    <ExternalLink />
                  </a>
                </Button>
              </Tip>
            )}
          </div>
          {linkError && (
            <p id="exampleLink-error" className="text-xs font-medium text-danger">
              {linkError}
            </p>
          )}
        </div>
        {TEXT_FIELDS.map(({ field, label, placeholder }) => (
          <div key={field} className="grid grid-cols-1 gap-1.5">
            <label htmlFor={field} className="text-[13px] font-medium">
              {label}
            </label>
            <Input id={field} value={(draft[field] as string | undefined) ?? ''} disabled={!!form.lockOf(field)} placeholder={form.lockOf(field) ? undefined : placeholder} onChange={(e) => form.set(field, e.target.value)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function Thumbnail({ file }: { file: Attachment }) {
  const [broken, setBroken] = useState(false);
  return (
    <a
      href={fileUrl(file)}
      target="_blank"
      rel="noreferrer noopener"
      className="group grid min-w-0 grid-cols-1 overflow-hidden rounded-lg border border-border bg-muted/40 transition-colors hover:border-input focus-visible:border-ring"
      title={file.fileName}
    >
      <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
        {broken ? (
          <ImageOff className="size-6 text-muted-foreground" aria-label="Preview not available" />
        ) : (
          <img src={fileUrl(file)} alt={file.fileName ?? ''} loading="lazy" onError={() => setBroken(true)} className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        )}
      </span>
      <span className="truncate border-t border-border bg-card px-2.5 py-1.5 text-xs">{file.fileName ?? file.fileNo}</span>
    </a>
  );
}

/**
 * The attached files (fileAttachArr): images as thumbnails, other files as links, all served by
 * fieldtec-web at /api/getFile/<fileNo>/<fileName>. Read-only here. Attaching (as sc-uploader does)
 * would be: POST /api/uploadFiles as multipart (fileNo, file, documentId, documentName and
 * fileReferenceTemplateId 4647f01a-…, the SDMS File Reference), which stores the file, creates its
 * fileReference document and answers { fileNo, basePath, fileType }; then save fileAttachArr with
 * { fileNo, fileName, fileType, basePath } added. It isn't built because it can't be tried here: the
 * stand-in backend has no uploads, and the real server can't be signed in to.
 */
export function AttachmentsSection({ files }: { files: Attachment[] | undefined }) {
  const list = files ?? [];
  const images = list.filter(isImage);
  const others = list.filter((f) => !isImage(f));
  return (
    <Section
      id="attachments"
      title={
        <span className="inline-flex items-center gap-2">
          Attachments {list.length > 0 && <Badge>{list.length}</Badge>}
        </span>
      }
      description={list.length ? undefined : 'Files can’t be attached in this app yet.'}
    >
      {!list.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
          <Paperclip className="size-4" />
          No files attached.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {images.map((f) => (
                <Thumbnail key={f.fileNo} file={f} />
              ))}
            </div>
          )}
          {others.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {others.map((f) => (
                <li key={f.fileNo}>
                  <a href={fileUrl(f)} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/60">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.fileName ?? f.fileNo}</span>
                    <span className="text-xs text-muted-foreground">{fileKind(f)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * The snapshot: the AI-written summary (read-only), the progress note people write, and its flags.
 * Writing the progress note turns off the AI override (ruleOnProgressNoteChange); content changes
 * mark the snapshot pending (ruleTriggerPendingSummaryDescription, set at save by changeFlags).
 */
export function SnapshotSection({ form }: { form: ItemForm }) {
  const { draft, saved } = form;
  const lock = form.lockOf('progressNote');
  const noteChanged = form.changed.includes('progressNote');
  return (
    <Section id="snapshot" title="Snapshot" description="The AI summary of this item, and its progress note.">
      <div className="grid grid-cols-1 gap-5">
        <div className="grid grid-cols-1 gap-2">
          <h3 className="text-sm font-semibold">Summary</h3>
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <SdmsMarkdown text={draft.summaryDescription} empty="No snapshot yet." />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <label htmlFor="progressNote" className="text-sm font-semibold">
            Progress note
          </label>
          <Textarea
            id="progressNote"
            rows={3}
            value={draft.progressNote ?? ''}
            disabled={!!lock}
            placeholder="Where this item is up to"
            onChange={(e) => form.setMany({ progressNote: e.target.value, userProgressNoteBool: true })}
          />
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <label className="inline-flex items-start gap-2.5">
            <Checkbox
              className="mt-0.5"
              checked={!!draft.userProgressNoteBool}
              disabled={!!lock}
              onCheckedChange={(c) => form.set('userProgressNoteBool', c === true)}
            />
            <span>
              Disable AI override
              <span className="block text-xs text-muted-foreground">{noteChanged ? 'Ticked because you wrote the progress note. Untick to let the AI rewrite it.' : 'The AI keeps to the progress note people write.'}</span>
            </span>
          </label>
          <span className="inline-flex items-start gap-2.5">
            <Checkbox className="mt-0.5" checked={!!saved?.pendingNewSummaryDescriptionBool} disabled aria-label="Pending snapshot update" />
            <span>
              Pending snapshot update
              <span className="block text-xs text-muted-foreground">Set when the item changes; the AI clears it.</span>
            </span>
          </span>
        </div>
      </div>
    </Section>
  );
}

/** The item's documentation (documentationMD), Markdown, for existing items (ruleSetStateOnLoad). */
export function DocumentationSection({ form }: { form: ItemForm }) {
  return (
    <div id="documentation" className="min-w-0 scroll-mt-20 rounded-xl border border-border bg-card px-5 py-4 shadow-card sm:px-6">
      <MarkdownField
        key={form.version}
        id="documentationMD"
        label="Documentation"
        as="h2"
        value={form.draft.documentationMD}
        savedValue={form.saved?.documentationMD}
        onChange={(v) => form.set('documentationMD', v)}
        itemId={form.saved?.documentId}
        locked={!!form.lockOf('documentationMD')}
        placeholder="Add documentation"
        empty="No documentation."
        minRows={6}
      />
    </div>
  );
}
