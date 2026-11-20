// Choosing an asset, a person or a lookup value: searchable, keyboard-friendly pickers (on the shared
// PickerPopover) that return the related values records store.

import { Command } from 'cmdk';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { PickerPopover, pickerItemClass, pickerTriggerClass } from '@react-frontends/shared/components';
import { useLookup } from '@/data/catalog';
import { useSearch } from '@/data/records';
import { ASSET_PICK_FIELDS, assetValue, personValue } from '@/data/values';
import type { LookupKind } from '@/domain/model';
import { first, nameOf, type Account, type Asset, type AssetValue, type LookupValue, type PersonValue } from '@/domain/types';
import { contains, term, type Clause } from '@react-frontends/shared/es';
import { fleetQuery } from '@/lib/es';
import { cn } from '@react-frontends/shared/utils';
import { AssetIcon } from './asset-icon';
import { ColorBadge, PersonAvatar, Select } from '@react-frontends/shared/ui';

const triggerClass = pickerTriggerClass;
const itemClass = pickerItemClass;

/**
 * Pick an asset. `filter` narrows the search (e.g. bookable, active); `describe` adds a note per
 * asset (e.g. "Booked until 3 pm"), `disabledReason` greys one out with the reason.
 */
export function AssetPicker({
  value,
  onChange,
  filter = [],
  extraFields = [],
  placeholder = 'Choose an asset',
  invalid,
  disabled,
  describe,
  disabledReason,
  id,
}: {
  value: AssetValue | undefined;
  onChange: (value: AssetValue | undefined, asset?: Asset) => void;
  filter?: Clause[];
  extraFields?: (keyof Asset)[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  describe?: (asset: Asset) => ReactNode;
  disabledReason?: (asset: Asset) => string | undefined;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const request = useMemo(
    () => fleetQuery('asset', { filter: [...filter, contains(['assetId', 'makeModel', 'registration'], query)], mustNot: [term('assetStatusRel.name', 'Disposed')], sort: [{ 'assetId.lcase': 'asc' }] }),
    [filter, query],
  );
  const { data, isFetching } = useSearch<Asset>('asset', open ? request : null, { size: 60, include: [...ASSET_PICK_FIELDS, ...extraFields.map(String)] });
  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQuery={setQuery}
      placeholder="Search by ID, make, model or rego"
      trigger={
        <button type="button" id={id} disabled={disabled} aria-invalid={invalid || undefined} className={triggerClass}>
          {value ? (
            <>
              <AssetIcon kind={value.iconKind} size={22} />
              <span className="font-medium">{value.assetId}</span>
              <span className="truncate text-muted-foreground">{value.name.replace(/^[^·]*·\s*/, '')}</span>
            </>
          ) : (
            <span className="text-muted-foreground/80">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </button>
      }
    >
      {!data?.documents.length && <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{isFetching ? 'Searching…' : 'No assets match.'}</Command.Empty>}
      {data?.documents.map((asset) => {
        const reason = disabledReason?.(asset);
        return (
          <Command.Item
            key={asset.documentId}
            value={asset.documentId}
            disabled={!!reason}
            onSelect={() => {
              onChange(assetValue(asset, extraFields), asset);
              setOpen(false);
            }}
            className={cn(itemClass, reason && 'opacity-50')}
          >
            <AssetIcon kind={asset.iconKind} color={first(asset.hireStatusRel)?.color} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{asset.assetId}</span>
                <span className="truncate text-muted-foreground">{asset.makeModel}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {reason ?? describe?.(asset) ?? [asset.registration, nameOf(asset.locationRel)].filter(Boolean).join(' · ')}
              </div>
            </div>
            {first(asset.hireStatusRel) && <ColorBadge color={first(asset.hireStatusRel)?.color}>{nameOf(asset.hireStatusRel)}</ColorBadge>}
            {value?.documentId === asset.documentId && <Check className="size-4 text-primary" />}
          </Command.Item>
        );
      })}
    </PickerPopover>
  );
}

/** Pick a person (an account). `types` narrows to account types (e.g. the workshop). */
export function PersonPicker({ value, onChange, types, placeholder = 'Choose a person', invalid, disabled, clearable, id }: { value: PersonValue | undefined; onChange: (value: PersonValue | undefined) => void; types?: string[]; placeholder?: string; invalid?: boolean; disabled?: boolean; clearable?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const request = useMemo(
    () => ({
      sort: [{ 'systemHeader.summaryName': 'asc' }],
      query: { bool: { filter: [term('systemHeader.systemType', 'account'), ...(types ? [{ terms: { accountType: types } }] : []), contains(['systemHeader.summaryName', 'email'], query)].filter(Boolean), must_not: [term('inactiveBool', true)] } },
    }),
    [types, query],
  );
  const { data } = useSearch<Account>('any', open ? request : null, { size: 60, include: ['documentId', 'systemHeader.summaryName', 'email', 'accountType', 'jobTitle'] });
  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      query={query}
      onQuery={setQuery}
      placeholder="Search people"
      trigger={
        <button type="button" id={id} disabled={disabled} aria-invalid={invalid || undefined} className={triggerClass}>
          {value ? (
            <>
              <PersonAvatar name={value.name} size={22} />
              <span className="truncate">{value.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground/80">{placeholder}</span>
          )}
          {clearable && value ? (
            <X
              className="ml-auto size-4 shrink-0 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
            />
          ) : (
            <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
          )}
        </button>
      }
    >
      {data?.documents.map((account) => (
        <Command.Item
          key={account.documentId}
          value={account.documentId}
          onSelect={() => {
            onChange(personValue(account));
            setOpen(false);
          }}
          className={itemClass}
        >
          <PersonAvatar name={account.systemHeader.summaryName ?? ''} size={26} />
          <div className="min-w-0 flex-1">
            <div className="truncate">{account.systemHeader.summaryName}</div>
            <div className="truncate text-xs text-muted-foreground">{[account.jobTitle, account.accountType].filter(Boolean).join(' · ')}</div>
          </div>
          {value?.documentId === account.documentId && <Check className="size-4 text-primary" />}
        </Command.Item>
      ))}
    </PickerPopover>
  );
}

/** Pick one value of a lookup kind (reasons, types, priorities…). */
export function LookupSelect({ kind, value, onChange, placeholder, invalid, disabled, id, only }: { kind: LookupKind; value: LookupValue | undefined; onChange: (value: LookupValue) => void; placeholder?: string; invalid?: boolean; disabled?: boolean; id?: string; only?: string[] }) {
  const { data = [] } = useLookup(kind);
  const options = only ? data.filter((v) => only.includes(v.name)) : data;
  return (
    <Select
      id={id}
      value={value?.documentId}
      onChange={(documentId) => {
        const picked = data.find((v) => v.documentId === documentId);
        if (picked) onChange({ documentId: picked.documentId, name: picked.name, ...(picked.indexNum !== undefined ? { indexNum: picked.indexNum } : {}) });
      }}
      options={options.map((v) => ({ value: v.documentId, label: v.name }))}
      placeholder={placeholder}
      invalid={invalid}
      disabled={disabled}
    />
  );
}
