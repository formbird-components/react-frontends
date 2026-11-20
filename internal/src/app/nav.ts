import { History, LayoutDashboard, ListTodo, Plus } from 'lucide-react';
import type { NavGroup, NewItem } from '@react-frontends/shared/shell';

/** The sidebar's pages (and ⌘K's "Go to"). */
export const NAV: NavGroup[] = [
  {
    items: [
      { to: '/my-view', label: 'My View', icon: LayoutDashboard },
      { to: '/items', label: 'All Items', icon: ListTodo },
      { to: '/recent', label: 'Recent', icon: History },
    ],
  },
];

/** The header's New menu. */
export const NEW_ITEMS: NewItem[] = [{ label: 'New item', icon: Plus, to: '/items/new' }];

/** Where people start. */
export const HOME = '/my-view';
