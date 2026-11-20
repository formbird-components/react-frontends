import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind class names, merged (later ones win). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** Initials for an avatar. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

/** A stable hue (0-359) for a string: avatar colours. */
export const hueOf = (text: string) => {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
};
