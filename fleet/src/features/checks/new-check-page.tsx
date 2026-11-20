// A Daily Driver, one step at a time (made for a phone in the yard): the asset, its meter, the checks
// from its check sheet, the defect when something failed, and a last look before submitting. After
// submitting: the result, and the workshop request the server raised for a defect.

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Gauge, Loader2, Pencil, Send, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AssetIcon } from '@/components/asset-icon';
import { MeterField } from '@/components/meter-field';
import { Alert, Page, StatusBadge } from '@react-frontends/shared/components';
import { AssetPicker } from '@/components/pickers';
import { Badge, Button, Card, Checkbox, Field, Segmented, Skeleton, Textarea } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useCreate, useRecord } from '@/data/records';
import { useSession } from '@/data/session';
import { assetValue } from '@/data/values';
import { checklistOutcome } from '@/domain/logic/checklist';
import { first, nameOf, type Asset, type CheckItem, type DailyDriver, type WorkshopRequest } from '@/domain/types';
import { api } from '@react-frontends/shared/api';
import { fleetQuery } from '@/lib/es';
import { term } from '@react-frontends/shared/es';
import { formatMeter } from '@/lib/format';
import { relative } from '@react-frontends/shared/format';
import { cn } from '@react-frontends/shared/utils';
import { URGENT } from '@/features/workshop/board';
import { PriorityChoice } from '@/features/workshop/priority-choice';
import { checkSheetIdOf, defectSummary, failures, itemsFromSheet, passRemaining } from './checklist';
import { ChecklistProgress, ChecklistView } from './checklist-view';
import { ResultBadge } from './checks-page';
import { RAISED_FIELDS, useAssetChecks, useCheckSheet } from './data';
import { emptyDraft, MAX_INCREASE, meterWarnings, STEP_TITLES, stepProblem, stepsFor, toRecord, type DailyDriverDraft, type StepId } from './stepper';

function StepHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Progress through the steps: a bar per step, the current one named. */
function Steps({ steps, current, onJump, done }: { steps: StepId[]; current: StepId; onJump: (s: StepId) => void; done: (s: StepId) => boolean }) {
  const at = steps.indexOf(current);
  return (
    <nav aria-label="Steps" className="grid gap-2">
      <ol className="flex gap-1.5">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              onClick={() => i < at && onJump(s)}
              disabled={i >= at}
              aria-current={s === current ? 'step' : undefined}
              aria-label={`${STEP_TITLES[s]}${i < at ? ' (done, go back)' : ''}`}
              className={cn('block h-1.5 w-full rounded-full transition-colors', i < at ? 'cursor-pointer bg-primary' : i === at ? 'bg-primary/60' : 'bg-muted', i < at && !done(s) && 'bg-warning')}
            />
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {at + 1} of {steps.length} · <span className="font-medium text-foreground">{STEP_TITLES[current]}</span>
        </span>
        <span className="hidden gap-3 sm:flex">
          {steps.map((s, i) => (
            <span key={s} className={cn(i === at && 'font-medium text-foreground', i < at && 'text-foreground/70')}>
              {i < at && <Check className="mr-0.5 inline size-3" />}
              {STEP_TITLES[s]}
            </span>
          ))}
        </span>
      </div>
    </nav>
  );
}

function ReviewRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-24 shrink-0 text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {onEdit && (
        <Button variant="ghost" size="sm" className="-my-1 h-7 px-2 text-xs" onClick={onEdit} aria-label={`Change ${label.toLowerCase()}`}>
          <Pencil className="size-3.5" />
          Change
        </Button>
      )}
    </div>
  );
}

/** After submitting: the result, and (for a defect) the request the server raises a moment later. */
function Submitted({ check, onAnother }: { check: DailyDriver; onAnother: () => void }) {
  const asset = first(check.assetRel);
  const defects = (check.defectCount ?? failures(check.checksArr).length) > 0;
  const started = useRef(Date.now());
  const raised = useQuery({
    queryKey: ['search', 'request', 'raised-by', check.documentId],
    queryFn: () => api.search<WorkshopRequest>(fleetQuery('request', { filter: [term('dailyDriverRel.documentId', check.documentId)] }), { size: 5, include: RAISED_FIELDS }),
    enabled: defects,
    refetchInterval: (q) => (q.state.data?.documents.length || Date.now() - started.current > 20_000 ? false : 1500),
  });
  const request = raised.data?.documents[0];
  const waiting = defects && !request && Date.now() - started.current < 20_000;
  const urgent = nameOf(check.defectPriorityRel) === URGENT;
  return (
    <Card className="overflow-hidden">
      <div className={cn('flex flex-col items-center gap-3 px-6 pt-10 pb-8 text-center', defects ? 'bg-[color-mix(in_oklab,var(--danger)_6%,var(--card))]' : 'bg-[color-mix(in_oklab,var(--success)_7%,var(--card))]')}>
        <span className={cn('flex size-16 items-center justify-center rounded-full animate-in', defects ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success')}>
          {defects ? <AlertTriangle className="size-8" /> : <CheckCircle2 className="size-8" />}
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{defects ? 'Defect reported' : 'All clear'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {check.ddRef} · {asset?.assetId} {asset?.name?.split(' · ')[1]}
          </p>
        </div>
        <ResultBadge check={check} />
      </div>
      <div className="grid gap-4 p-5 sm:p-6">
        {defects ? (
          <>
            <p className="text-sm">
              The workshop has been told. {urgent ? 'As it’s urgent, the asset comes off hire until it’s fixed.' : 'A workshop supervisor will triage it.'}
            </p>
            {request ? (
              <Link to={`/workshop/requests/${request.documentId}`} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Wrench className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{request.requestRef} raised</div>
                  <div className="truncate text-xs text-muted-foreground">{nameOf(request.requestTypeRel)}</div>
                </div>
                <StatusBadge value={request.requestStatusRel} />
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ) : waiting ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" />
                Raising a workshop request…
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">The request will show on the workshop board shortly.</div>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Nothing to report. Drive safe.</p>
        )}
        {check.meterExcludedBool && <Alert tone="warning">{check.meterExcludedReason || 'The meter reading was flagged'}. It’s kept, but didn’t update the asset.</Alert>}
        <div className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline">
            <Link to={`/checks/${check.documentId}`}>View the check</Link>
          </Button>
          <Button variant="outline" onClick={onAnother}>
            <ClipboardCheck />
            Check another
          </Button>
          <Button asChild>
            <Link to="/checks">Done</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function NewCheckPage() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const preset = params.get('asset') ?? undefined;
  const create = useCreate<DailyDriver>('dailyDriver');
  const priorities = useLookup('requestPriority');

  const [draft, setDraft] = useState<DailyDriverDraft>(() => emptyDraft());
  const [stepId, setStepId] = useState<StepId>('asset');
  const [problem, setProblem] = useState('');
  const [submitted, setSubmitted] = useState<DailyDriver>();
  const [checksFor, setChecksFor] = useState<string>();
  const top = useRef<HTMLDivElement>(null);

  const presetAsset = useRecord<Asset>(preset);
  useEffect(() => {
    if (presetAsset.data && !draft.asset) setDraft((d) => ({ ...d, asset: assetValue(presetAsset.data!, ['checkSheetRel']) }));
  }, [presetAsset.data, draft.asset]);

  // The asset as it is now (meter, check sheet), its sheet, and its last check.
  const assetDoc = useRecord<Asset>(draft.asset?.documentId);
  const sheetId = checkSheetIdOf(assetDoc.data ?? draft.asset);
  const sheet = useCheckSheet(sheetId);
  const lastCheck = useAssetChecks(draft.asset?.documentId);
  useEffect(() => {
    if (assetDoc.data) setDraft((d) => (d.assetMeter === (assetDoc.data!.meterReadingNum ?? null) ? d : { ...d, assetMeter: assetDoc.data!.meterReadingNum ?? null }));
  }, [assetDoc.data]);
  useEffect(() => {
    const assetId = draft.asset?.documentId;
    if (!assetId || !sheet.data || checksFor === assetId || sheet.data.documentId !== sheetId) return;
    setDraft((d) => ({ ...d, checks: itemsFromSheet(sheet.data!.checkItems) }));
    setChecksFor(assetId);
  }, [sheet.data, sheetId, draft.asset?.documentId, checksFor]);

  const steps = stepsFor(draft);
  const step = steps.includes(stepId) ? stepId : 'review';
  const at = steps.indexOf(step);
  const set = (patch: Partial<DailyDriverDraft>) => {
    setProblem('');
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setChecks = (fn: (items: CheckItem[]) => CheckItem[]) => {
    setProblem('');
    setDraft((d) => ({ ...d, checks: fn(d.checks) }));
  };
  const go = (s: StepId) => {
    setProblem('');
    setStepId(s);
    if (s === 'defects' && !draft.defectDescription.trim()) setDraft((d) => ({ ...d, defectDescription: defectSummary(d.checks) }));
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const sheetLoading = !!draft.asset && (assetDoc.isPending || (!!sheetId && sheet.isPending) || (checksFor !== draft.asset.documentId && !!sheetId && !sheet.isError));

  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 'checks' && sheetLoading) return;
    const message = stepProblem(step, draft);
    if (message) {
      setProblem(message);
      // Take the person to what needs them (a missing comment, the meter…).
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus({ preventScroll: true });
      });
      return;
    }
    if (step !== 'review') return go(steps[at + 1]);
    // Submit: every step, then the server's own check.
    const blocked = steps.find((s) => stepProblem(s, draft));
    if (blocked) {
      go(blocked);
      setProblem(stepProblem(blocked, draft));
      return;
    }
    try {
      const saved = await create.mutateAsync(toRecord({ ...draft, checkDate: new Date().toISOString() }, me) as Record<string, unknown>);
      setSubmitted(saved);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const restart = () => {
    setDraft(emptyDraft());
    setChecksFor(undefined);
    setSubmitted(undefined);
    setStepId('asset');
    setProblem('');
    setParams({}, { replace: true });
  };

  const outcome = checklistOutcome(draft.checks);
  const unit = draft.asset?.primaryMeterUnit ?? assetDoc.data?.primaryMeterUnit;
  const warnings = meterWarnings(draft);
  const last = lastCheck.data?.documents[0];

  if (submitted)
    return (
      <Page className="max-w-xl">
        <Submitted check={submitted} onAnother={restart} />
      </Page>
    );

  return (
    <Page className="max-w-2xl pb-28 sm:pb-8">
      <div ref={top} className="scroll-mt-20" />
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Daily Driver</div>
          <h1 className="text-2xl font-semibold tracking-tight">Pre-start check</h1>
        </div>
        {draft.asset && step !== 'asset' && (
          <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm shadow-xs">
            <AssetIcon kind={draft.asset.iconKind} size={24} />
            <span className="font-medium">{draft.asset.assetId}</span>
          </span>
        )}
      </div>
      <div className="sticky top-14 z-20 -mx-4 mb-5 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Steps steps={steps} current={step} onJump={go} done={(s) => !stepProblem(s, draft)} />
        {step === 'checks' && draft.checks.length > 0 && <ChecklistProgress items={draft.checks} onPassRest={() => setChecks(passRemaining)} className="mt-3 sm:hidden" />}
      </div>

      <form onSubmit={next} noValidate>
        {step === 'asset' && (
          <section className="animate-in">
            <StepHeading title="Which asset are you checking?">Search by ID, make, model or rego.</StepHeading>
            {preset && presetAsset.isPending ? (
              <Skeleton className="h-12" />
            ) : (
              <AssetPicker
                id="dd-asset"
                value={draft.asset}
                extraFields={['checkSheetRel']}
                invalid={!!problem}
                onChange={(value) => {
                  if (value?.documentId === draft.asset?.documentId) return;
                  setChecksFor(undefined);
                  set({ asset: value, checks: [], meter: null, assetMeter: undefined, defectDescription: '', defectPriority: undefined, inspectionComplete: false });
                }}
              />
            )}
            {draft.asset && (
              <Card className="mt-4 p-4">
                <div className="flex items-center gap-3">
                  <AssetIcon kind={draft.asset.iconKind} size={44} color={first(assetDoc.data?.hireStatusRel)?.color} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{draft.asset.assetId}</div>
                    <div className="truncate text-sm text-muted-foreground">{assetDoc.data?.makeModel ?? draft.asset.name}</div>
                  </div>
                  {assetDoc.data && <StatusBadge value={assetDoc.data.hireStatusRel} />}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Check sheet</dt>
                    <dd className="mt-0.5 truncate">{sheet.data?.nameId ?? (sheetLoading ? <Skeleton className="h-5 w-32" /> : 'None')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Last check</dt>
                    <dd className="mt-0.5 truncate">
                      {lastCheck.isPending ? (
                        <Skeleton className="h-5 w-24" />
                      ) : last ? (
                        <Link to={`/checks/${last.documentId}`} className="hover:underline">
                          {relative(last.checkDate)} · {last.ddResult}
                        </Link>
                      ) : (
                        'Never'
                      )}
                    </dd>
                  </div>
                </dl>
                {!sheetLoading && !sheetId && <Alert tone="warning" className="mt-3">This asset has no check sheet, so there’s nothing to check. Ask an asset manager to set one.</Alert>}
              </Card>
            )}
          </section>
        )}

        {step === 'meter' && (
          <section className="animate-in">
            <StepHeading title={unit === 'hours' ? 'Hour meter reading' : 'Odometer reading'}>Read it off the {unit === 'hours' ? 'hour meter' : 'dash'} as it is now.</StepHeading>
            <Field label={unit === 'hours' ? 'Engine hours' : 'Kilometres'} htmlFor="dd-meter" required>
              <MeterField
                id="dd-meter"
                size="lg"
                autoFocus
                value={draft.meter}
                onChange={(v) => set({ meter: v })}
                unit={unit}
                assetMeter={assetDoc.data?.meterReadingNum}
                assetMeterDate={assetDoc.data?.meterReadingDate}
                maxIncrease={MAX_INCREASE}
                invalid={!!problem}
              />
            </Field>
          </section>
        )}

        {step === 'checks' && (
          <section className="animate-in">
            <StepHeading title="Checks">Pass, fail or N/A for each. Say what’s wrong with anything that fails. * marks the checks you must answer.</StepHeading>
            {sheetLoading ? (
              <div className="grid gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                <ChecklistProgress items={draft.checks} onPassRest={() => setChecks(passRemaining)} className="mb-5 hidden sm:grid" />
                <ChecklistView items={draft.checks} onChange={setChecks} size="lg" allowAdd />
              </>
            )}
          </section>
        )}

        {step === 'defects' && (
          <section className="grid gap-5 animate-in">
            <StepHeading title="Report the defect">The workshop gets a request with this and the failed checks.</StepHeading>
            <div className="rounded-xl border border-danger/30 bg-[color-mix(in_oklab,var(--danger)_5%,var(--card))] p-4">
              <div className="mb-2 text-xs font-semibold tracking-wide text-danger uppercase">Failed checks</div>
              <ul className="grid gap-1.5 text-sm">
                {failures(draft.checks).map((c) => (
                  <li key={c.key}>
                    <span className="font-medium">{c.question}</span>
                    {c.comment && <span className="text-muted-foreground">: {c.comment}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <Field label="Defect description" htmlFor="dd-defect" required error={problem === 'Describe the defect.' ? problem : undefined}>
              <Textarea id="dd-defect" rows={4} value={draft.defectDescription} onChange={(e) => set({ defectDescription: e.target.value })} aria-invalid={problem === 'Describe the defect.' || undefined} />
            </Field>
            <Field label="Priority" required error={problem === 'Choose the defect priority.' ? problem : undefined}>
              {priorities.data ? <PriorityChoice value={draft.defectPriority} onChange={(v) => set({ defectPriority: v })} options={priorities.data} size="lg" invalid={problem === 'Choose the defect priority.'} /> : <Skeleton className="h-20" />}
            </Field>
            <Field label="Service requested">
              <Segmented
                value={draft.serviceRequested || 'In Workshop'}
                onChange={(v) => set({ serviceRequested: v })}
                options={[
                  { value: 'In Workshop', label: 'In the workshop' },
                  { value: 'In Field', label: 'In the field' },
                ]}
                className="grid w-full grid-cols-2 sm:w-fit"
              />
            </Field>
            <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 transition-colors', draft.inspectionComplete ? 'border-primary/50 bg-primary-soft/30' : problem.startsWith('Tick') ? 'border-danger/60' : 'border-border')}>
              <Checkbox checked={draft.inspectionComplete} onCheckedChange={(c) => set({ inspectionComplete: c === true })} className="mt-0.5 size-5" aria-describedby="dd-inspection-hint" />
              <span>
                <span className="block text-sm font-medium">Defect inspection complete</span>
                <span id="dd-inspection-hint" className="block text-[13px] text-muted-foreground">
                  I’ve looked at the defect and described it as best I can.
                </span>
              </span>
            </label>
          </section>
        )}

        {step === 'review' && (
          <section className="animate-in">
            <StepHeading title="Review and submit">Submitted checks can’t be changed.</StepHeading>
            <Card className="divide-y divide-border px-4">
              <ReviewRow label="Asset" onEdit={() => go('asset')}>
                <span className="inline-flex items-center gap-2">
                  <AssetIcon kind={draft.asset?.iconKind} size={22} />
                  <span className="font-medium">{draft.asset?.assetId}</span>
                  <span className="truncate text-muted-foreground">{draft.asset?.name?.split(' · ')[1]}</span>
                </span>
              </ReviewRow>
              <ReviewRow label="Meter" onEdit={() => go('meter')}>
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="size-4 text-muted-foreground" />
                  {formatMeter(draft.meter, unit)}
                </span>
                {warnings.length > 0 && <div className="mt-1 text-xs text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]">{warnings.join(' ')} It’ll be kept, but won’t update the asset.</div>}
              </ReviewRow>
              <ReviewRow label="Checks" onEdit={() => go('checks')}>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="success">{outcome.passed} passed</Badge>
                  {outcome.failed > 0 && <Badge tone="danger">{outcome.failed} failed</Badge>}
                  {outcome.na > 0 && <Badge>{outcome.na} N/A</Badge>}
                  {outcome.total - outcome.answered > 0 && <Badge tone="outline">{outcome.total - outcome.answered} not answered</Badge>}
                </div>
                {failures(draft.checks).length > 0 && (
                  <ul className="mt-2 grid gap-1 text-[13px]">
                    {failures(draft.checks).map((c) => (
                      <li key={c.key}>
                        <span className="font-medium text-danger">{c.question}</span>: {c.comment}
                      </li>
                    ))}
                  </ul>
                )}
              </ReviewRow>
              {outcome.failed > 0 && (
                <ReviewRow label="Defect" onEdit={() => go('defects')}>
                  <p className="whitespace-pre-wrap">{draft.defectDescription}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {draft.defectPriority && <Badge tone={draft.defectPriority.name === URGENT ? 'danger' : 'neutral'}>{draft.defectPriority.name === URGENT ? 'Urgent' : 'Non-urgent'}</Badge>}
                    <Badge tone="outline">{draft.serviceRequested === 'In Field' ? 'In the field' : 'In the workshop'}</Badge>
                  </div>
                </ReviewRow>
              )}
            </Card>
            <div className={cn('mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm', outcome.failed ? 'border-danger/30 bg-[color-mix(in_oklab,var(--danger)_5%,var(--card))]' : 'border-success/30 bg-[color-mix(in_oklab,var(--success)_6%,var(--card))]')}>
              {outcome.failed ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />}
              <span>
                {outcome.failed
                  ? `Submitting raises a workshop request for ${draft.asset?.assetId}.${draft.defectPriority?.name === URGENT ? ' As it’s urgent, the asset comes off hire.' : ''}`
                  : `${draft.asset?.assetId} passes. Thanks for checking.`}
              </span>
            </div>
          </section>
        )}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none lg:pl-0">
          {problem && <Alert className="mx-auto mb-3 max-w-2xl animate-in">{problem}</Alert>}
          <div className="mx-auto flex max-w-2xl items-center gap-2 sm:justify-between">
            {at > 0 ? (
              <Button variant="outline" size="lg" onClick={() => go(steps[at - 1])} className="h-12 sm:h-10">
                <ArrowLeft />
                Back
              </Button>
            ) : (
              <Button asChild variant="ghost" size="lg" className="h-12 sm:h-10">
                <Link to="/checks">Cancel</Link>
              </Button>
            )}
            <Button type="submit" size="lg" className="h-12 flex-1 text-[15px] sm:h-10 sm:flex-none sm:text-sm" disabled={create.isPending || (step === 'checks' && sheetLoading)}>
              {step === 'review' ? (
                <>
                  {create.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                  Submit check
                </>
              ) : (
                <>
                  {step === 'checks' && outcome.failed ? 'Next: the defect' : 'Next'}
                  <ArrowRight />
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Page>
  );
}
