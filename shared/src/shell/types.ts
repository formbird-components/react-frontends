import type { ComponentType, ReactNode } from 'react';

/** An icon component (a lucide icon). */
export type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/** The app's name and logo, in the sidebar, the phone header and the sign-in page. */
export interface Brand {
  /** "Harbourline". */
  name: string;
  /** Under the name: the product ("Fleet"). */
  product?: string;
  /** The logo's URL (e.g. "/favicon.svg"). */
  logo: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Active only on exactly this path (not on paths under it). */
  end?: boolean;
}

/** A group of pages in the sidebar; a group without a label follows the one before it. */
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** An entry of the header's "New" menu. */
export interface NewItem {
  label: string;
  icon: IconType;
  to: string;
}

/** A result in the ⌘K palette. */
export interface PaletteItem {
  /** Unique among all results (the palette's keyboard selection uses it): e.g. "asset-<documentId>". */
  id: string;
  /** Where choosing it goes. */
  to: string;
  /** Before the label (an icon, 16-24 px). */
  icon?: ReactNode;
  label: ReactNode;
  /** Muted text after the label. */
  detail?: ReactNode;
  /** On the right (a status badge). */
  trailing?: ReactNode;
}

export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

/** What the ⌘K palette finds for typed text (the app's searches). Groups without items aren't shown. */
export type PaletteSearch = (text: string) => Promise<PaletteGroup[]>;
