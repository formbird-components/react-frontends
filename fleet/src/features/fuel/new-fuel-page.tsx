// A fuel receipt: the asset, when, the meter, litres and cost, with a live check against the asset's
// tank, its expected range and the previous fill (fuelCheck, which the server runs on save).

import { AlertTriangle, CheckCircle2, Droplets, Fuel, Gauge, Loader2, Route, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AssetIcon } from '@/components/asset-icon';
import { DateTimeInput, NumberInput, Alert, Page, PageHeader } from '@react-frontends/shared/components';
import { MeterField } from '@/components/meter-field';
import { AssetPicker, LookupSelect } from '@/components/pickers';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Skeleton } from '@react-frontends/shared/ui';
import { useCreate, useRecord } from '@/data/records';
import { useSession } from '@/data/session';
import { assetValue } from '@/data/values';
import { fuelCheck } from '@/domain/logic/meter';
import { first, type Asset, type AssetValue, type FuelReceipt, type LookupValue } from '@/domain/types';
import { formatDate, formatNumber } from '@react-frontends/shared/format';
import { formatMoney } from '@/lib/format';
import { cn } from '@react-frontends/shared/utils';
import { BackLink } from '@/features/workshop/back-link';
import { usePreviousFill, useSuppliers } from './data';
import { FLAG_HELP, pricePerLitre } from './fuel';

function PreviewRow({ icon: Icon, label, children }: { icon: typeof Fuel; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular">{children}</span>
    </div>
  );
}

export function NewFuelPage() {
  const { me } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('asset') ?? undefined;
  const presetAsset = useRecord<Asset>(preset);
  const create = useCreate<FuelReceipt>('fuelReceipt');
  const suppliers = useSuppliers();

  const [asset, setAsset] = useState<AssetValue>();
  const [date, setDate] = useState<string | undefined>(() => new Date().toISOString());
  const [meter, setMeter] = useState<number | null>(null);
  const [litres, setLitres] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [fuelType, setFuelType] = useState<LookupValue>();
  const [supplier, setSupplier] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (presetAsset.data && !asset) setAsset(assetValue(presetAsset.data));
  }, [presetAsset.data, asset]);
  const assetDoc = useRecord<Asset>(asset?.documentId);
  // The asset's own fuel, when an asset is chosen (not again on a refetch, so a change sticks).
  const fuelFor = useRef<string>(undefined);
  useEffect(() => {
    const doc = assetDoc.data;
    if (!doc || fuelFor.current === doc.documentId) return;
    fuelFor.current = doc.documentId;
    const own = first(doc.fuelTypeRel);
    setFuelType(own ? { documentId: own.documentId, name: own.name, ...(own.indexNum !== undefined ? { indexNum: own.indexNum } : {}) } : undefined);
  }, [assetDoc.data]);

  const previous = usePreviousFill(asset?.documentId, date);
  const last = previous.data?.documents[0];
  const check = useMemo(
    () => fuelCheck({ litres, meter, previousMeter: last?.meterReadingNum ?? null, tankCapacity: assetDoc.data?.tankCapacityL ?? null, rangeKm: assetDoc.data?.rangeKm ?? null }),
    [litres, meter, last, assetDoc.data],
  );
  const perLitre = pricePerLitre(cost, litres);
  const unit = asset?.primaryMeterUnit ?? assetDoc.data?.primaryMeterUnit;
  const ready = !!asset && meter !== null && !!litres;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailure('');
    const problems: Record<string, string> = {};
    if (!asset) problems.asset = 'Choose the asset.';
    if (!date) problems.date = 'When was it filled?';
    if (meter === null) problems.meter = 'Enter the meter reading.';
    else if (meter < 0) problems.meter = 'A meter reading cannot be negative.';
    if (!(litres && litres > 0)) problems.litres = 'Enter the litres (more than 0).';
    if (!(cost && cost > 0)) problems.cost = 'Enter the cost (more than $0).';
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const fields: Partial<FuelReceipt> = {
      assetRel: [asset!],
      driverRel: me ? [me] : [],
      fuelDate: date,
      meterReadingNum: meter!,
      litresNum: litres!,
      costNum: cost!,
      fuelTypeRel: fuelType ? [fuelType] : [],
      supplier: supplier.trim(),
    };
    try {
      const saved = await create.mutateAsync(fields as Record<string, unknown>);
      const flags = saved.fuelFlags ?? [];
      if (flags.length) toast.warning(`${saved.fuelRef ?? 'Receipt'} saved, flagged`, { description: flags.join(', ') });
      else toast.success(`${saved.fuelRef ?? 'Receipt'} saved`, { description: saved.consumptionNum ? `${formatNumber(saved.consumptionNum, 1)} L/100 km since the last fill` : undefined });
      navigate(`/fuel?highlight=${saved.documentId}`);
    } catch (error) {
      setFailure((error as Error).message);
    }
  };

  return (
    <Page className="max-w-5xl">
      <BackLink to="/fuel" history>
        Fuel
      </BackLink>
      <PageHeader title="Add a fuel receipt" description="From the docket: the meter when you filled up, litres and cost." />
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card>
          <CardContent className="grid gap-5 pt-5">
            <Field label="Asset" htmlFor="fuel-asset" required error={errors.asset}>
              {preset && presetAsset.isPending ? <Skeleton className="h-9" /> : (
                <AssetPicker
                  id="fuel-asset"
                  value={asset}
                  invalid={!!errors.asset}
                  onChange={(v) => {
                    setAsset(v);
                    setMeter(null);
                  }}
                />
              )}
            </Field>
            <Field label="Filled" htmlFor="fuel-date" required error={errors.date}>
              <DateTimeInput id="fuel-date" value={date} onChange={setDate} invalid={!!errors.date} step={60} />
            </Field>
            <Field label={unit === 'hours' ? 'Hour meter' : 'Odometer'} htmlFor="fuel-meter" required error={errors.meter}>
              <MeterField id="fuel-meter" value={meter} onChange={setMeter} unit={unit} assetMeter={assetDoc.data?.meterReadingNum} assetMeterDate={assetDoc.data?.meterReadingDate} invalid={!!errors.meter} disabled={!asset} emptyText={asset ? undefined : 'Choose the asset first.'} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Litres" htmlFor="fuel-litres" required error={errors.litres} className="content-start">
                <NumberInput id="fuel-litres" value={litres} onValueChange={setLitres} suffix="L" digits={2} placeholder="0.0" aria-invalid={!!errors.litres || undefined} />
              </Field>
              <Field label="Cost" htmlFor="fuel-cost" required error={errors.cost} hint={perLitre ? `${formatMoney(perLitre, 3)} per litre` : 'Including GST'} className="content-start">
                <NumberInput id="fuel-cost" value={cost} onValueChange={setCost} prefix="$" digits={2} placeholder="0.00" aria-invalid={!!errors.cost || undefined} />
              </Field>
              <Field label="Fuel" htmlFor="fuel-type" className="content-start">
                <LookupSelect id="fuel-type" kind="fuelType" value={fuelType} onChange={setFuelType} placeholder="Choose the fuel" />
              </Field>
              <Field label="Supplier" htmlFor="fuel-supplier" className="content-start">
                <Input id="fuel-supplier" list="fuel-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Ampol Alexandria" autoComplete="off" />
                <datalist id="fuel-suppliers">
                  {suppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <CardHeader>
            <div>
              <CardTitle>Check</CardTitle>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Against the tank, the range and the last fill.</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {asset ? (
              <div className="flex items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <AssetIcon kind={asset.iconKind} size={28} />
                <div className="min-w-0">
                  <div className="font-medium">{asset.assetId}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {assetDoc.data?.tankCapacityL ? `${formatNumber(assetDoc.data.tankCapacityL)} L tank` : 'Tank size unknown'}
                    {assetDoc.data?.rangeKm ? ` · ${formatNumber(assetDoc.data.rangeKm)} km range` : ''}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Choose the asset to check the receipt against it.</p>
            )}
            {asset && (
              <div className="divide-y divide-border">
                <PreviewRow icon={Fuel} label="Last fill">
                  {previous.isPending ? <Skeleton className="h-4 w-20" /> : last ? <span className="font-normal">{formatDate(last.fuelDate)} · {formatNumber(last.meterReadingNum)} {unit === 'hours' ? 'h' : 'km'}</span> : <span className="font-normal text-muted-foreground">None before</span>}
                </PreviewRow>
                <PreviewRow icon={Route} label="Distance">
                  {check.distance !== undefined ? `${formatNumber(check.distance)} ${unit === 'hours' ? 'h' : 'km'}` : '–'}
                </PreviewRow>
                <PreviewRow icon={Gauge} label="Consumption">
                  {check.litresPer100km !== undefined ? `${formatNumber(check.litresPer100km, 1)} L/100 km` : '–'}
                </PreviewRow>
                <PreviewRow icon={Droplets} label="Price">
                  {perLitre ? `${formatMoney(perLitre, 3)}/L` : '–'}
                </PreviewRow>
              </div>
            )}
            {asset && (meter !== null || litres) ? (
              check.flags.length ? (
                <div role="status" className="grid gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  {check.flags.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>
                        <span className="font-medium">{f}</span>
                        <span className="block text-xs text-muted-foreground">{FLAG_HELP[f]} It’s saved, flagged, and won’t update the asset’s meter.</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : ready ? (
                <div role="status" className={cn('flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 p-3 text-sm')}>
                  <CheckCircle2 className="size-4 text-success" />
                  Looks right.
                </div>
              ) : null
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-3 lg:col-start-1">
          {failure && <Alert>{failure}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate('/fuel')}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Save receipt
            </Button>
          </div>
        </div>
      </form>
    </Page>
  );
}
