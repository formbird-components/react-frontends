// Writing Markdown on the Item page: a textarea that grows, Write / Preview, and suggestions while
// typing: "@" offers SDMS people and inserts the mention link ruleGetAtNamesInNotes writes; "#"
// offers items and inserts the link ruleUrlIdHelper writes. The save links any typed "@name" or
// "#12345" the same way (useSaveItem), so the suggestions are a shortcut, not a requirement.

import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Badge, Button, PersonAvatar, Segmented, Textarea } from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { SdmsMarkdown } from '@/components/sdms-markdown';
import { ItemStatus, TypeIcon } from '@/components/item-bits';
import { useAccount } from '@/data/sdms';
import { suggestItems, suggestPeople } from './data';
import { itemLinkMarkdown, mentionMarkdown, replaceToken, tokenAt, type Token } from './item-logic';

// ---------------------------------------------------------------------------------------------
// Where the caret is in a textarea (a hidden copy of it, measured), to show suggestions there
// ---------------------------------------------------------------------------------------------

const MIRRORED = [
  'box-sizing', 'width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family',
  'text-align', 'text-transform', 'text-indent', 'letter-spacing', 'word-spacing', 'tab-size',
];

function caretAt(el: HTMLTextAreaElement, position: number) {
  const style = getComputedStyle(el);
  const mirror = document.createElement('div');
  for (const p of MIRRORED) mirror.style.setProperty(p, style.getPropertyValue(p));
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = el.value.slice(position) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const at = { top: marker.offsetTop - el.scrollTop, left: marker.offsetLeft - el.scrollLeft, line };
  mirror.remove();
  return at;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface Suggestion {
  key: string;
  label: string;
  detail?: ReactNode;
  icon: ReactNode;
  insert: string;
}

/** The suggestions for the token being typed. */
function useSuggestions(token: Token | null, itemId: string | undefined): { list: Suggestion[]; loading: boolean } {
  const account = useAccount();
  const query = useDebounced(token ? `${token.trigger}${token.query}` : '', 120);
  const trigger = query[0];
  const text = query.slice(1);
  const people = useQuery({
    queryKey: ['suggest', 'people', text],
    queryFn: () => suggestPeople(text),
    enabled: trigger === '@',
    staleTime: 60_000,
  });
  const items = useQuery({
    queryKey: ['suggest', 'items', text, itemId],
    queryFn: () => suggestItems(text, itemId, account),
    enabled: trigger === '#' && !!text,
    staleTime: 60_000,
  });
  if (!token) return { list: [], loading: false };
  if (token.trigger === '@') {
    const list = (people.data ?? [])
      .filter((a) => a.email)
      .map((a) => {
        const name = a.systemHeader?.summaryName ?? a.email!;
        return { key: a.documentId, label: name, detail: a.email, icon: <PersonAvatar name={name} size={24} />, insert: mentionMarkdown(a.email!) };
      });
    return { list, loading: people.isFetching };
  }
  const list = (items.data ?? []).map((i) => ({
    key: i.documentId,
    label: i.summary ?? i.systemHeader?.summaryName ?? '',
    detail: (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono tabular-nums">{i.itemId}</span>
        <ItemStatus value={i.statusRel} className="text-xs" />
      </span>
    ),
    icon: <TypeIcon name={i.typeRel?.[0]?.name} className="size-4" />,
    insert: itemLinkMarkdown(i),
  }));
  return { list, loading: items.isFetching };
}

// ---------------------------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------------------------

export interface MarkdownEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** The item being edited (left out of #suggestions). */
  itemId?: string;
  placeholder?: string;
  minRows?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Ctrl/⌘ + Enter. */
  onSubmit?: () => void;
  /** The accessible name when there's no visible label. */
  label?: string;
  describedBy?: string;
  className?: string;
}

export function MarkdownEditor({ id, value, onChange, itemId, placeholder, minRows = 4, invalid, autoFocus, disabled, onSubmit, label, describedBy, className }: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const hintId = useId();
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [token, setToken] = useState<Token | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState({ top: 0, left: 0 });
  const { list, loading } = useSuggestions(token, itemId);
  const open = !!token && dismissed !== token.start && (list.length > 0 || loading);

  // Grow with the text.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || mode !== 'write') return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, mode]);

  useEffect(() => setActive(0), [token?.trigger, token?.query]);

  const follow = (el: HTMLTextAreaElement) => {
    const t = el.selectionStart === el.selectionEnd ? tokenAt(el.value, el.selectionStart) : null;
    setToken(t);
    if (!t) return setDismissed(null);
    const c = caretAt(el, t.start);
    const width = wrap.current?.clientWidth ?? 320;
    setAt({ top: el.offsetTop + c.top + c.line + 4, left: Math.max(0, Math.min(el.offsetLeft + c.left, width - Math.min(320, width))) });
  };

  const choose = (s: Suggestion) => {
    if (!token) return;
    const next = replaceToken(value, token, s.insert);
    onChange(next.text);
    setToken(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && list.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(list[Math.min(active, list.length - 1)]);
        return;
      }
    }
    if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(token!.start);
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={cn('grid min-w-0 grid-cols-1 gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
        <span id={hintId} className="hidden text-xs text-muted-foreground sm:inline">
          Markdown · @ mentions someone · # links an item
        </span>
      </div>
      <div ref={wrap} className="relative">
        {mode === 'write' ? (
          <Textarea
            ref={ref}
            id={id}
            value={value}
            rows={minRows}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-describedby={[describedBy, hintId].filter(Boolean).join(' ') || undefined}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && list.length ? `${listId}-${Math.min(active, list.length - 1)}` : undefined}
            onChange={(e) => {
              onChange(e.target.value);
              follow(e.target);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) follow(e.currentTarget);
            }}
            onClick={(e) => follow(e.currentTarget)}
            onBlur={() => setToken(null)}
            className="resize-none overflow-hidden font-mono text-[13px] leading-relaxed"
          />
        ) : (
          <div className="min-h-24 rounded-md border border-dashed border-border px-3 py-2.5" aria-label="Preview">
            <SdmsMarkdown text={value} empty="Nothing to preview." />
          </div>
        )}
        {open && mode === 'write' && (
          <ul
            id={listId}
            role="listbox"
            aria-label={token?.trigger === '@' ? 'People' : 'Items'}
            className="absolute z-30 max-h-72 w-80 max-w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-pop animate-in"
            style={{ top: at.top, left: at.left }}
          >
            {!list.length && <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>}
            {list.map((s, i) => (
              <li
                key={s.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={cn('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-accent')}
              >
                {s.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.label}</span>
                  {s.detail && <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A Markdown field of the item: shown as Markdown, edited in place
// ---------------------------------------------------------------------------------------------

export interface MarkdownFieldProps {
  id: string;
  label: string;
  value: string | undefined;
  /** The stored value: the field shows "Edited" when the draft differs. */
  savedValue?: string;
  onChange: (value: string) => void;
  itemId?: string;
  required?: boolean;
  locked?: boolean;
  error?: string;
  placeholder?: string;
  /** Shown when there's no text. */
  empty?: string;
  /** Start in the editor (a new item's fields). */
  startEditing?: boolean;
  minRows?: number;
  /** A heading level for the label. */
  as?: 'h2' | 'h3';
}

export function MarkdownField({ id, label, value, savedValue, onChange, itemId, required, locked, error, placeholder, empty = 'Nothing yet.', startEditing, minRows, as: Heading = 'h3' }: MarkdownFieldProps) {
  const [editing, setEditing] = useState(!!startEditing);
  const errorId = `${id}-error`;
  const edited = (value ?? '') !== (savedValue ?? '');
  const showEditor = editing && !locked;
  return (
    <section id={`field-${id}`} aria-labelledby={`${id}-label`} className="grid min-w-0 grid-cols-1 gap-2 scroll-mt-24">
      <div className="flex min-h-8 items-center gap-2">
        <Heading id={`${id}-label`} className={Heading === 'h2' ? 'text-[15px] font-semibold tracking-tight' : 'text-sm font-semibold'}>
          {showEditor ? <label htmlFor={id}>{label}</label> : label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </Heading>
        {edited && <Badge tone="warning">Edited</Badge>}
        <span className="ml-auto" />
        {!locked &&
          (showEditor || !value?.trim() ? (
            showEditor &&
            !startEditing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Done
              </Button>
            )
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${label}`}>
              <Pencil />
              Edit
            </Button>
          ))}
      </div>
      {showEditor ? (
        <MarkdownEditor id={id} value={value ?? ''} onChange={onChange} itemId={itemId} placeholder={placeholder} minRows={minRows} invalid={!!error} autoFocus={!startEditing} describedBy={error ? errorId : undefined} />
      ) : value?.trim() ? (
        <SdmsMarkdown text={value} />
      ) : (
        <button
          type="button"
          disabled={locked}
          onClick={() => setEditing(true)}
          className={cn(
            'rounded-md border border-dashed px-3 py-3 text-left text-sm text-muted-foreground transition-colors',
            locked ? 'cursor-default border-transparent px-0' : 'cursor-pointer border-border hover:border-input hover:bg-accent/50',
            error && 'border-danger/60',
          )}
        >
          {locked ? empty : placeholder ?? empty}
        </button>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
