// The frame around every page: the sidebar (the app's pages, in groups), the top bar with search
// (⌘K), the "New" menu, and the account menu with the theme. On a phone the sidebar is a menu
// that slides in. The app gives its brand, pages, New entries and the palette's search.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { LogOut, Menu, Monitor, Moon, Plus, Search, Sun } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { BaseAccount } from '../api';
import { useSession } from '../data/session';
import { useTheme, type ThemeChoice } from '../theme';
import { Button, Dialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Kbd, PersonAvatar } from '../ui';
import { cn } from '../utils';
import type { Brand, NavGroup, NewItem, PaletteSearch } from './types';

export interface AppShellProps {
  brand: Brand;
  /** The sidebar's pages (also the palette's "Go to" list). */
  nav: NavGroup[];
  /** The header's "New" menu (none when empty). */
  newItems?: NewItem[];
  /** What the ⌘K palette finds for typed text; without it the palette only goes to pages. */
  search?: PaletteSearch;
  /** The palette's search box placeholder (default "Search…"). */
  searchPlaceholder?: string;
  /** After "Search" on the header's search button, on wider screens: e.g. " assets, bookings…". */
  searchHint?: string;
  /** What the palette finds, for screen readers (default "Go to a page"). */
  searchDescription?: string;
  /** A note at the foot of the sidebar. */
  sidebarFooter?: ReactNode;
  /** The account menu's second line (default: job title · account type). */
  accountLine?: (account: BaseAccount) => ReactNode;
  /** Where signing out goes (default /login). */
  loginPath?: string;
}

function BrandMark({ brand }: { brand: Brand }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src={brand.logo} alt="" className="size-8 rounded-lg" />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">{brand.name}</div>
        {brand.product && <div className="text-xs text-muted-foreground">{brand.product}</div>}
      </div>
    </div>
  );
}

function SidebarNav({ nav, onNavigate }: { nav: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav className="grid gap-0.5" aria-label="Main">
      {nav.map((group, g) => (
        <Fragment key={group.label ?? g}>
          {group.label && <div className={cn('px-3 pb-1 text-xs font-medium text-muted-foreground', g > 0 && 'pt-4')}>{group.label}</div>}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive && 'bg-card text-foreground shadow-card ring-1 ring-border',
                )
              }
            >
              <item.icon className="size-[18px]" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </Fragment>
      ))}
    </nav>
  );
}

const defaultAccountLine = (account: BaseAccount) =>
  [account.jobTitle, account.accountType].filter(Boolean).flatMap((part, i) => (i ? [' · ', part] : [part]));

function AccountMenu({ accountLine = defaultAccountLine, loginPath }: { accountLine?: (account: BaseAccount) => ReactNode; loginPath: string }) {
  const { account, signOut } = useSession();
  const { choice, setChoice } = useTheme();
  const navigate = useNavigate();
  const name = account?.systemHeader?.summaryName ?? '';
  const themes: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-accent" aria-label="Account">
          <PersonAvatar name={name} size={30} />
          <span className="hidden text-sm font-medium md:inline">{account?.usersName?.firstName ?? name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="px-2 py-2">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{account && accountLine(account)}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {themes.map((t) => (
          <DropdownMenuItem key={t.value} onSelect={() => setChoice(t.value)}>
            <t.icon />
            {t.label}
            {choice === t.value && <span className="ml-auto text-xs text-primary">●</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            navigate(loginPath, { replace: true });
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NewMenu({ items }: { items: NewItem[] }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus />
          <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {items.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => navigate(item.to)}>
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** ⌘K: jump to a page, or to what the app's search finds. */
function CommandPalette({
  open,
  onOpenChange,
  nav,
  search,
  placeholder,
  description,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nav: NavGroup[];
  search?: PaletteSearch;
  placeholder: string;
  description: string;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const text = query.trim();
  // Under 'search', so saves (which refresh searches) refresh what the palette shows too.
  const found = useQuery({
    queryKey: ['search', 'palette', text],
    queryFn: () => search!(text),
    enabled: open && !!text && !!search,
    placeholderData: keepPreviousData,
  });
  const groups = text ? (found.data ?? []).filter((g) => g.items.length) : [];
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const pages = nav.flatMap((g) => g.items);
  const itemClass = 'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-[selected=true]:bg-accent';
  const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-pop animate-in">
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <Command shouldFilter={!search} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder={placeholder} className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {/* With a search, pages show until something is typed; without one, typing filters them. */}
              {(!text || !search) && (
                <Command.Group heading="Go to" className={group}>
                  {pages.map((p) => (
                    <Command.Item key={p.to} value={p.to} keywords={[p.label]} onSelect={() => go(p.to)} className={itemClass}>
                      <p.icon className="size-4 text-muted-foreground" />
                      {p.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {groups.map((g) => (
                <Command.Group key={g.heading} heading={g.heading} className={group}>
                  {g.items.map((item) => (
                    <Command.Item key={item.id} value={item.id} onSelect={() => go(item.to)} className={itemClass}>
                      {item.icon}
                      {item.label}
                      {item.detail !== undefined && <span className="truncate text-muted-foreground">{item.detail}</span>}
                      {item.trailing !== undefined && <span className="ml-auto">{item.trailing}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              {search ? (
                text && !found.isFetching && !groups.length && <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches “{text}”.</div>
              ) : (
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches “{text}”.</Command.Empty>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

export function AppShell({
  brand,
  nav,
  newItems = [],
  search,
  searchPlaceholder = 'Search…',
  searchHint = '',
  searchDescription = 'Go to a page',
  sidebarFooter,
  accountLine,
  loginPath = '/login',
}: AppShellProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const isMac = useMemo(() => /mac/i.test(navigator.platform), []);
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-sidebar px-3 py-4 lg:flex">
        <BrandMark brand={brand} />
        <SidebarNav nav={nav} />
        {sidebarFooter && <div className="mt-auto rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">{sidebarFooter}</div>}
      </aside>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 bg-sidebar px-3 py-4 shadow-pop data-[state=open]:animate-[slide-in_200ms_ease-out] lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Pages</DialogPrimitive.Description>
            <BrandMark brand={brand} />
            <SidebarNav nav={nav} onNavigate={() => setMenuOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Menu">
            <Menu />
          </Button>
          <img src={brand.logo} alt={[brand.name, brand.product].filter(Boolean).join(' ')} className="size-8 shrink-0 rounded-lg lg:hidden" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-input sm:max-w-md"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">
              Search{searchHint && <span className="hidden sm:inline">{searchHint}</span>}
            </span>
            <Kbd className="hidden sm:inline-flex">{isMac ? '⌘' : 'Ctrl'} K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {newItems.length > 0 && <NewMenu items={newItems} />}
            <AccountMenu accountLine={accountLine} loginPath={loginPath} />
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} nav={nav} search={search} placeholder={searchPlaceholder} description={searchDescription} />
    </div>
  );
}
