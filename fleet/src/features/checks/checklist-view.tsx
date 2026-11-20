// A check sheet to answer (Daily Driver checks, a PM service's tasks): checks by category, big
// Pass / Fail / N/A answers, a comment on each failure, progress, and "pass the rest".

import { Check, CheckCheck, Info, Minus, Plus, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Input, Textarea } from '@react-frontends/shared/ui';
import { checklistOutcome } from '@/domain/logic/checklist';
import type { CheckItem } from '@/domain/types';
import { cn } from '@react-frontends/shared/utils';
import { answer, categoryProgress, comment, groupByCategory, type Result } from './checklist';

const ANSWERS: { value: Result; label: string; icon: typeof Check; on: string }[] = [
  { value: 'pass', label: 'Pass', icon: Check, on: 'border-success bg-success text-white shadow-sm hover:bg-success/90' },
  { value: 'fail', label: 'Fail', icon: X, on: 'border-danger bg-danger text-white shadow-sm hover:bg-danger/90' },
  { value: 'na', label: 'N/A', icon: Minus, on: 'border-muted-foreground bg-muted-foreground text-background shadow-sm hover:bg-muted-foreground/90' },
];

function AnswerButtons({ item, onAnswer, allowNa, size, labelId }: { item: CheckItem; onAnswer: (r: Result) => void; allowNa: boolean; size: 'md' | 'lg'; labelId: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className={cn('grid shrink-0 gap-1.5', allowNa ? 'grid-cols-3' : 'grid-cols-2', size === 'lg' ? 'w-full sm:w-auto' : '')}>
      {ANSWERS.filter((a) => allowNa || a.value !== 'na').map((a) => {
        const selected = item.result === a.value;
        return (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onAnswer(a.value)}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border font-medium transition-[background-color,border-color,color,box-shadow] select-none focus-visible:outline-2 active:translate-y-px',
              size === 'lg' ? 'h-12 min-w-[5.5rem] px-4 text-[15px] [&_svg]:size-5' : 'h-8 min-w-16 px-2.5 text-[13px] [&_svg]:size-4',
              selected ? a.on : 'border-border bg-card text-muted-foreground hover:border-input hover:bg-accent hover:text-foreground',
            )}
          >
            <a.icon strokeWidth={2.4} />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultChip({ result }: { result: CheckItem['result'] }) {
  if (result === 'pass')
    return (
      <Badge tone="success">
        <Check strokeWidth={3} />
        Pass
      </Badge>
    );
  if (result === 'fail')
    return (
      <Badge tone="danger">
        <X strokeWidth={3} />
        Fail
      </Badge>
    );
  if (result === 'na') return <Badge>N/A</Badge>;
  return <Badge tone="outline">Not answered</Badge>;
}

function CheckRow({ item, onChange, onFailed, readOnly, allowNa, size, focusComment }: { item: CheckItem; onChange?: (update: (list: CheckItem[]) => CheckItem[]) => void; onFailed: (key: string) => void; readOnly?: boolean; allowNa: boolean; size: 'md' | 'lg'; focusComment: boolean }) {
  const labelId = useId();
  const commentId = useId();
  const failed = item.result === 'fail';
  const missingComment = failed && !String(item.comment ?? '').trim();
  return (
    <li
      className={cn(
        'rounded-xl border bg-card transition-colors',
        size === 'lg' ? 'p-4' : 'px-4 py-3',
        failed ? 'border-danger/35 bg-[color-mix(in_oklab,var(--danger)_4%,var(--card))]' : 'border-border',
      )}
    >
      <div className={cn('flex gap-3', size === 'lg' ? 'flex-col sm:flex-row sm:items-center sm:justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between')}>
        <div className="min-w-0">
          <p id={labelId} className={cn('font-medium', size === 'lg' ? 'text-[15px]' : 'text-sm')}>
            {item.question}
            {item.mandatory && (
              <span className="ml-1 text-danger" aria-label="required" title="Required">
                *
              </span>
            )}
          </p>
          {item.instruction && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" />
              {item.instruction}
            </p>
          )}
        </div>
        {readOnly ? (
          <ResultChip result={item.result} />
        ) : (
          <AnswerButtons
            item={item}
            allowNa={allowNa}
            size={size}
            labelId={labelId}
            onAnswer={(r) => {
              if (r === 'fail' && item.result !== 'fail') onFailed(item.key);
              onChange?.((list) => answer(list, item.key, r));
            }}
          />
        )}
      </div>
      {readOnly
        ? item.comment && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{item.comment}</p>
        : (failed || item.comment) && (
            <div className="mt-3 grid gap-1">
              <label htmlFor={commentId} className="text-xs font-medium text-muted-foreground">
                {failed ? 'What’s wrong?' : 'Comment'}
                {failed && <span className="ml-0.5 text-danger">*</span>}
              </label>
              <Textarea
                id={commentId}
                autoFocus={focusComment}
                value={item.comment ?? ''}
                onChange={(e) => onChange?.((list) => comment(list, item.key, e.target.value))}
                placeholder={failed ? 'Describe the problem, e.g. where and how bad' : ''}
                aria-invalid={missingComment || undefined}
                className="min-h-16 bg-background"
                rows={2}
              />
            </div>
          )}
    </li>
  );
}

/** Progress through a sheet: a bar, counts, and "pass the rest". */
export function ChecklistProgress({ items, onPassRest, className, action }: { items: CheckItem[]; onPassRest?: () => void; className?: string; action?: ReactNode }) {
  const o = checklistOutcome(items, { commentOnFail: true });
  const left = o.total - o.answered;
  const pct = o.total ? Math.round((o.answered / o.total) * 100) : 0;
  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold tabular">
            {o.answered}/{o.total}
          </span>
          <span className="text-muted-foreground">answered</span>
          {o.failed > 0 && (
            <Badge tone="danger">
              <X strokeWidth={3} />
              {o.failed} failed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {onPassRest && left > 0 && (
            <Button type="button" variant="soft" size="sm" onClick={onPassRest}>
              <CheckCheck />
              Pass the rest ({left})
            </Button>
          )}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={o.total} aria-valuenow={o.answered} aria-label="Checks answered">
        <div className={cn('h-full rounded-full transition-[width] duration-300', o.failed ? 'bg-danger' : 'bg-success')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The checks by category. `onChange` gets an updater (list → list), so quick answers don't race.
 * `allowAdd` adds a box for one-off checks ("Added checks").
 */
export function ChecklistView({
  items,
  onChange,
  readOnly,
  allowNa = true,
  allowAdd,
  size = 'md',
}: {
  items: CheckItem[];
  onChange?: (update: (list: CheckItem[]) => CheckItem[]) => void;
  readOnly?: boolean;
  allowNa?: boolean;
  allowAdd?: boolean;
  size?: 'md' | 'lg';
}) {
  const [lastFailed, setLastFailed] = useState<string>();
  const [adding, setAdding] = useState('');
  const count = useRef(0);
  const groups = groupByCategory(items);
  const add = () => {
    const question = adding.trim();
    if (!question) return;
    count.current++;
    onChange?.((list) => [...list, { key: `adhoc-${Date.now().toString(36)}-${count.current}`, question, adhoc: true, result: '', comment: '' }]);
    setAdding('');
  };
  return (
    <div className="grid gap-6">
      {groups.map((group) => {
        const p = categoryProgress(group.items);
        return (
          <section key={group.category} aria-label={group.category} className="grid gap-2.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{group.category}</h3>
              <span className="text-xs text-muted-foreground tabular">
                {p.failed > 0 && <span className="mr-2 font-medium text-danger">{p.failed} failed</span>}
                {p.answered}/{p.total}
              </span>
            </div>
            <ul className="grid gap-2">
              {group.items.map((item) => (
                <CheckRow key={item.key} item={item} onChange={onChange} onFailed={setLastFailed} readOnly={readOnly} allowNa={allowNa} size={size} focusComment={lastFailed === item.key} />
              ))}
            </ul>
          </section>
        );
      })}
      {allowAdd && !readOnly && items.length > 0 && (
        <div className="flex gap-2" role="group" aria-label="Add a check">
          <Input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              add();
            }}
            placeholder="Add a check (e.g. ladder rack secure)"
            aria-label="Add a check"
            className={cn(size === 'lg' && 'h-11')}
          />
          <Button variant="outline" className={cn(size === 'lg' && 'h-11')} disabled={!adding.trim()} onClick={add}>
            <Plus />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
