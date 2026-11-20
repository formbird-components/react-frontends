// The fleet's own formats: money (AUD) and meter readings. Dates, times, numbers and durations are
// @react-frontends/shared/format.

import { formatNumber } from '@react-frontends/shared/format';

export const formatMoney = (value: unknown, digits = 2) =>
  value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? '' : Number(value).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: digits, minimumFractionDigits: digits });

export const formatMeter = (value: unknown, unit?: string | null) => {
  const n = formatNumber(value);
  return n ? `${n} ${unit === 'hours' ? 'h' : 'km'}` : '';
};
