import { CalendarRange, ClipboardCheck, Fuel, LayoutDashboard, Map, Truck, Wrench } from 'lucide-react';
import type { NavItem as ShellNavItem } from '@react-frontends/shared/shell';

export interface NavItem extends ShellNavItem {
  /** Account types that see it (all when absent). */
  roles?: string[];
}

const MANAGERS = ['Administrator', 'Asset Manager'];
const WORKSHOP = ['Administrator', 'Supervisor', 'Technician'];

export const NAV: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, roles: MANAGERS },
  { to: '/bookings', label: 'Bookings', icon: CalendarRange },
  { to: '/assets', label: 'Assets', icon: Truck, roles: [...MANAGERS, 'Supervisor', 'Technician'] },
  { to: '/workshop', label: 'Workshop', icon: Wrench, roles: [...WORKSHOP, 'Asset Manager'] },
  { to: '/checks', label: 'Daily Driver', icon: ClipboardCheck },
  { to: '/fuel', label: 'Fuel', icon: Fuel },
  { to: '/map', label: 'Map', icon: Map },
];

export const navFor = (accountType: string | undefined) => NAV.filter((item) => !item.roles || item.roles.includes(accountType ?? ''));

/** Where each account type starts. */
export function homeFor(accountType: string | undefined): string {
  switch (accountType) {
    case 'Administrator':
    case 'Asset Manager':
      return '/overview';
    case 'Supervisor':
    case 'Technician':
      return '/workshop';
    case 'Operator':
      return '/checks';
    default:
      return '/bookings';
  }
}
