// Report a fault: a new workshop request. Drivers describe the fault for a supervisor to triage;
// workshop staff can schedule and assign it straight away (fleet's client rules' defaults).

import { Loader2, Send } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { DateTimeInput, Alert, Page, PageHeader, StatusBadge } from '@react-frontends/shared/components';
import { AssetPicker, LookupSelect, PersonPicker } from '@/components/pickers';
import { Button, Card, Field, PersonAvatar, Segmented, Select, Skeleton, Textarea } from '@react-frontends/shared/ui';
import { useLookup } from '@/data/catalog';
import { useCreate, useRecord } from '@/data/records';
import { useSession } from '@/data/session';
import { assetValue } from '@/data/values';
import { first, nameOf, type Asset, type AssetValue, type LookupValue, type PersonValue, type StatusValue, type WorkshopRequest } from '@/domain/types';
import { validateRequest } from '@/domain/validate';
import { BackLink } from './back-link';
import { useWorkshops, WORKSHOP_TYPES } from './data';
import { PriorityChoice } from './priority-choice';
import { DISABLE_BOOKING, requestDefaults, workshopOf } from './request';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-border px-5 py-5 last:border-0 sm:px-6">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function NewRequestPage() {
  const { who, me } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('asset') ?? undefined;
  const presetAsset = useRecord<Asset>(preset);
  const statuses = useLookup('requestStatus');
  const types = useLookup('requestType');
  const priorities = useLookup('requestPriority');
  const { workshops } = useWorkshops();
  const create = useCreate<WorkshopRequest>('request');

  const [asset, setAsset] = useState<AssetValue>();
  const [assetDoc, setAssetDoc] = useState<Asset>();
  const [type, setType] = useState<LookupValue>();
  const [priority, setPriority] = useState<LookupValue>();
  const [reason, setReason] = useState<LookupValue>();
  const [description, setDescription] = useState('');
  const [requestedBy, setRequestedBy] = useState<PersonValue>();
  const [workshop, setWorkshop] = useState<LookupValue[]>([]);
  const [assignee, setAssignee] = useState<PersonValue>();
  const [start, setStart] = useState<string>();
  const [end, setEnd] = useState<string>();
  const [disableBooking, setDisableBooking] = useState('Auto Disable');
  const [startAs, setStartAs] = useState<'Open' | 'Pending'>('Open');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');

  const defaults = useMemo(() => requestDefaults(who, { statuses: statuses.data, types: types.data, priorities: priorities.data }), [who, statuses.data, types.data, priorities.data]);
  useEffect(() => {
    if (!type && defaults.requestTypeRel[0]) setType(defaults.requestTypeRel[0]);
    if (!priority && defaults.priorityRel[0]) setPriority(defaults.priorityRel[0]);
  }, [defaults, type, priority]);
  useEffect(() => {
    if (!requestedBy && me) setRequestedBy(me);
  }, [me, requestedBy]);
  useEffect(() => {
    if (presetAsset.data && !asset) {
      setAsset(assetValue(presetAsset.data, ['responsibleWorkshopRel']));
      setAssetDoc(presetAsset.data);
      setWorkshop(workshopOf(assetValue(presetAsset.data, ['responsibleWorkshopRel'])));
    }
  }, [presetAsset.data, asset]);

  const statusName = who.isWorkshop ? startAs : 'Pending';
  const status = statuses.data?.find((s) => s.name === statusName);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailure('');
    const problems: Record<string, string> = {};
    if (!asset) problems.asset = 'Choose the asset.';
    if (!type) problems.type = 'Choose the request type.';
    if (!priority) problems.priority = 'Choose the priority.';
    if (!description.trim()) problems.description = 'Describe the fault.';
    if (!requestedBy) problems.requestedBy = 'Choose who is asking.';
    if (start && end && new Date(end) <= new Date(start)) problems.end = 'The expected completion must be after the start.';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    if (!status) return setFailure('The request statuses are still loading. Try again in a moment.');
    const statusRel: StatusValue[] = [{ documentId: status.documentId, name: status.name, ...(status.color ? { color: status.color } : {}), ...(status.statusCategory ? { statusCategory: status.statusCategory } : {}), ...(status.indexNum !== undefined ? { indexNum: status.indexNum } : {}) }];
    const fields: Partial<WorkshopRequest> = {
      assetRel: [asset!],
      requestTypeRel: [type!],
      priorityRel: [priority!],
      requestReasonRel: reason ? [reason] : [],
      reqDescription: description.trim(),
      requestedByRel: [requestedBy!],
      workshopRel: workshop,
      requestStatusRel: statusRel,
      disableBooking: who.isWorkshop ? disableBooking : defaults.disableBooking,
      assignedToRel: who.isWorkshop && assignee ? [assignee] : [],
      ...(who.isWorkshop && start ? { expectedStartDate: start } : {}),
      ...(who.isWorkshop && end ? { expectedCompletionDate: end } : {}),
      deferredBool: false,
      closeReasonRel: [],
      dailyDriverRel: [],
    };
    const message = validateRequest(fields, who);
    if (message) return setFailure(message);
    try {
      const saved = await create.mutateAsync(fields);
      toast.success(`${saved.requestRef ?? 'Request'} sent to the workshop`, { description: statusName === 'Pending' ? 'A workshop supervisor will triage it.' : 'It’s open on the workshop board.' });
      navigate(`/workshop/requests/${saved.documentId}`, { replace: true });
    } catch (error) {
      setFailure((error as Error).message);
    }
  };

  const hire = first(assetDoc?.hireStatusRel);

  return (
    <Page className="max-w-3xl">
      <BackLink to={who.isWorkshop ? '/workshop' : '/'} history>
        Back
      </BackLink>
      <PageHeader
        title="Report a fault"
        description={who.isWorkshop ? 'Raise a request for the workshop, and schedule it if you know when.' : 'Tell the workshop what’s wrong. A workshop supervisor triages new requests.'}
      />
      <form onSubmit={submit} noValidate>
        <Card>
          <Section title="Asset">
            <Field label="Which asset?" htmlFor="req-asset" required error={errors.asset}>
              {preset && presetAsset.isPending ? (
                <Skeleton className="h-9" />
              ) : (
                <AssetPicker
                  id="req-asset"
                  value={asset}
                  extraFields={['responsibleWorkshopRel']}
                  invalid={!!errors.asset}
                  onChange={(value, doc) => {
                    setAsset(value);
                    setAssetDoc(doc);
                    setWorkshop(workshopOf(value));
                  }}
                />
              )}
            </Field>
            {asset && assetDoc && (
              <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {hire && <StatusBadge value={assetDoc.hireStatusRel} />}
                {nameOf(assetDoc.locationRel) && <span>{nameOf(assetDoc.locationRel)}</span>}
                {workshop[0] && <span>Looked after by {workshop[0].name}</span>}
              </div>
            )}
          </Section>

          <Section title="What’s wrong" description="Say what happens and when: the more the workshop knows, the faster it’s fixed.">
            <Field label="Priority" required error={errors.priority}>
              {priorities.data ? <PriorityChoice value={priority} onChange={setPriority} options={priorities.data} /> : <Skeleton className="h-16" />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Request type" htmlFor="req-type" required error={errors.type} className="content-start">
                <LookupSelect id="req-type" kind="requestType" value={type} onChange={setType} invalid={!!errors.type} />
              </Field>
              <Field label="Reason" htmlFor="req-reason" className="content-start">
                <LookupSelect id="req-reason" kind="requestReason" value={reason} onChange={setReason} placeholder="Choose a reason" />
              </Field>
            </div>
            <Field label="Description" htmlFor="req-description" required error={errors.description} hint="Lists (“- ”) and **bold** are kept.">
              <Textarea
                id="req-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                aria-invalid={!!errors.description || undefined}
                placeholder="e.g. Grinding noise from the front brakes when stopping, worse downhill. Brake warning light came on near Burwood."
              />
            </Field>
            <Field label="Requested by" htmlFor="req-by" required error={errors.requestedBy}>
              {who.isWorkshop ? (
                <PersonPicker id="req-by" value={requestedBy} onChange={setRequestedBy} />
              ) : (
                <div className="flex h-9 items-center gap-2 text-sm">
                  <PersonAvatar name={me?.name ?? ''} size={24} />
                  {me?.name} <span className="text-muted-foreground">(you)</span>
                </div>
              )}
            </Field>
          </Section>

          {who.isWorkshop && (
            <Section title="Scheduling" description="Optional. Expected dates block the asset in the booking calendar.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workshop" htmlFor="req-workshop">
                  <Select
                    id="req-workshop"
                    value={workshop[0]?.documentId}
                    onChange={(id) => {
                      const w = workshops.find((x) => x.documentId === id);
                      setWorkshop(w ? [w] : []);
                    }}
                    options={workshops.map((w) => ({ value: w.documentId, label: w.name }))}
                    placeholder="Choose a workshop"
                  />
                </Field>
                <Field label="Assign to" htmlFor="req-assignee">
                  <PersonPicker id="req-assignee" types={WORKSHOP_TYPES} value={assignee} onChange={setAssignee} placeholder="Unassigned" clearable />
                </Field>
                <Field label="Expected start" htmlFor="req-start" className="content-start">
                  <DateTimeInput id="req-start" value={start} onChange={setStart} />
                </Field>
                <Field label="Expected completion" htmlFor="req-end" error={errors.end} className="content-start">
                  <DateTimeInput id="req-end" value={end} onChange={setEnd} invalid={!!errors.end} />
                </Field>
              </div>
              <Field label="Booking while it’s open" hint={DISABLE_BOOKING.find((d) => d.value === disableBooking)?.hint}>
                <Segmented value={disableBooking} onChange={setDisableBooking} options={DISABLE_BOOKING.map((d) => ({ value: d.value, label: d.label }))} className="w-fit" />
              </Field>
              <Field label="Start as" hint={startAs === 'Open' ? 'On the board for the workshop now.' : 'Waits in Pending for a supervisor to triage.'}>
                <Segmented
                  value={startAs}
                  onChange={setStartAs}
                  options={[
                    { value: 'Open', label: 'Open' },
                    { value: 'Pending', label: 'Pending triage' },
                  ]}
                  className="w-fit"
                />
              </Field>
            </Section>
          )}
        </Card>

        {failure && <Alert className="mt-4">{failure}</Alert>}

        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex items-center justify-end gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Send to workshop
          </Button>
        </div>
      </form>
    </Page>
  );
}
