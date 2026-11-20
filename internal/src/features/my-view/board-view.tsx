// My View's "My items" board (ruleSetupBoard, ruleLoadBoard, ruleRefreshBoard): your open items,
// lanes by assignee and columns by status (the first project's statuses, indexNum 10–59). Drag a
// card to another column or lane to change its status or assignee, or use its "Move to…" menu
// (keyboards, touch screens). On a phone it shows one status at a time.

import { useQuery } from '@tanstack/react-query';
import { Check, Columns3, ExternalLink, MoreHorizontal, RefreshCw, RotateCw, Search, SearchX, X } from 'lucide-react';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api } from '@react-frontends/shared/api';
import { Alert, EmptyState } from '@react-frontends/shared/components';
import { useSearch, useUpdateDocument } from '@react-frontends/shared/data';
import type { Clause } from '@react-frontends/shared/es';
import { formatNumber } from '@react-frontends/shared/format';
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  PersonAvatar,
  Skeleton,
} from '@react-frontends/shared/ui';
import { cn } from '@react-frontends/shared/utils';
import { itemPath, TypeIcon } from '@/components/item-bits';
import { ITEMS, useAccount } from '@/data/sdms';
import { boardColumns, boardItemsQuery, boardStatusQuery, type BoardColumn } from '@/domain/queries';
import { boardMove } from '@/domain/rules';
import type { Item, LookupDoc, Project, Ref } from '@/domain/types';
import { applyMoves, BOARD_SIZE, CELL_LIMIT, filterCards, laneOf, layoutBoard, planMove, statusOf, type Lane, type MoveTarget, type Moves } from './board';

/** Fields a card shows (and a move needs). */
const CARD_FIELDS = ['documentId', 'itemId', 'itemRef', 'summary', 'typeRel', 'statusRel', 'assigneeRel', 'priorityRel', 'severityRel', 'projectRel', 'updatedDate'];

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** A status colour as a header: tinted, readable in light and dark. */
const headerStyle = (color: string): CSSProperties => ({ backgroundColor: `color-mix(in oklab, ${color} 30%, var(--card))`, borderTopColor: color });

/** Priority and severity: high ones stand out (by their order). */
function Level({ value, warnAt, dangerAt }: { value: Ref | undefined; warnAt: number; dangerAt: number }) {
  if (!value?.name) return null;
  const i = value.indexNum ?? 0;
  const tone =
    i >= dangerAt
      ? 'border-danger/30 bg-danger/10 text-danger'
      : i >= warnAt
        ? 'border-warning/40 bg-warning/12 text-[color-mix(in_oklab,var(--warning)_70%,var(--foreground))]'
        : 'border-border bg-muted/50 text-muted-foreground';
  return <span className={cn('inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-medium whitespace-nowrap', tone)}>{value.name}</span>;
}

interface Targets {
  columns: BoardColumn[];
  lanes: Pick<Lane, 'name' | 'assignee'>[];
}

/** The card whose "Move to…" menu is open, and the button that opened it. */
interface OpenMenu {
  item: Item;
  button: HTMLElement;
  /** Opened from the keyboard: the first choice takes the focus. */
  keyboard: boolean;
}

/**
 * "Move to…" for one card: one menu for the whole board (a menu per card would weigh down a board
 * of hundreds), placed at the button that opened it.
 */
function MoveMenu({ menu, targets, onMove, onClose }: { menu: OpenMenu; targets: Targets; onMove: (item: Item, to: MoveTarget) => void; onClose: () => void }) {
  const { item } = menu;
  const status = statusOf(item);
  const lane = laneOf(item);
  const r = menu.button.getBoundingClientRect();
  // Opened from the keyboard: focus the first choice (as a menu button does).
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu.keyboard) return;
    const frame = requestAnimationFrame(() => content.current?.querySelector<HTMLElement>('[role=menuitem]:not([data-disabled])')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menu]);
  return (
    <DropdownMenu open onOpenChange={(o) => !o && onClose()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label={`Move ${item.itemId ?? 'the item'}`}
        className="max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto"
        ref={content}
        onCloseAutoFocus={(e) => {
          // Back to the card's button: where it was, or where the move put it.
          e.preventDefault();
          const button = menu.button.isConnected ? menu.button : document.querySelector<HTMLElement>(`[data-card-menu="${item.documentId}"]`);
          button?.focus();
        }}
      >
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {targets.columns.map((c) => (
          <DropdownMenuItem key={c.name} disabled={c.name === status} onSelect={() => onMove(item, { column: c })}>
            <span className="size-3 shrink-0 rounded-[3px] border border-black/10 dark:border-white/15" style={{ backgroundColor: c.color }} />
            <span className="flex-1 truncate">{c.name}</span>
            {c.name === status && <Check className="text-primary!" />}
          </DropdownMenuItem>
        ))}
        {targets.lanes.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            {targets.lanes.map((l) => (
              <DropdownMenuItem key={l.name} disabled={l.name === lane || !l.assignee} onSelect={() => onMove(item, { lane: l })}>
                <PersonAvatar name={l.name} size={18} />
                <span className="flex-1 truncate">{l.name}</span>
                {l.name === lane && <Check className="text-primary!" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={itemPath(item)}>
            <ExternalLink />
            Open {item.itemId ?? 'the item'}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const BoardCard = memo(function BoardCard({
  item,
  draggable,
  dragging,
  menuOpen,
  onMenu,
  onDragStart,
  onDragEnd,
}: {
  item: Item;
  draggable: boolean;
  dragging: boolean;
  menuOpen: boolean;
  onMenu: (item: Item, button: HTMLElement, keyboard: boolean) => void;
  onDragStart: (item: Item) => void;
  onDragEnd: () => void;
}) {
  const number = item.itemId || item.itemRef || '';
  const project = item.projectRel?.[0]?.name;
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.documentId);
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
      aria-label={`${number}: ${item.summary ?? ''}`}
      className={cn(
        'group relative rounded-lg border border-border bg-card p-2.5 shadow-card transition-[box-shadow,border-color,opacity] [contain-intrinsic-size:auto_6rem] [content-visibility:auto] hover:border-input hover:shadow-md',
        draggable && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="relative z-10 flex">
          <TypeIcon name={item.typeRel?.[0]?.name} tip={false} />
        </span>
        <Link
          to={itemPath(item)}
          draggable={false}
          className="font-mono text-[0.78rem] font-medium text-primary tabular-nums outline-none after:absolute after:inset-0 after:rounded-lg hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {number}
        </Link>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Move ${number}`}
          data-card-menu={item.documentId}
          onClick={(e) => onMenu(item, e.currentTarget, e.detail === 0)}
          className={cn(
            'relative z-10 -my-1 -mr-1 ml-auto cursor-pointer rounded-md p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100',
            menuOpen && 'bg-accent text-foreground pointer-fine:opacity-100',
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{item.summary || '(no summary)'}</p>
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <Level value={item.priorityRel?.[0]} warnAt={30} dangerAt={40} />
        <Level value={item.severityRel?.[0]} warnAt={30} dangerAt={40} />
        {project && (
          <span className="ml-auto min-w-0 truncate text-[11px] text-muted-foreground" title={project}>
            {project}
          </span>
        )}
      </div>
    </article>
  );
});

/** A cell's cards: the first CELL_LIMIT, then "Show more". */
function CellCards({ items, wide, expanded, onExpand, card }: { items: Item[]; wide?: boolean; expanded: boolean; onExpand: () => void; card: (item: Item) => ReactNode }) {
  const shown = expanded ? items : items.slice(0, CELL_LIMIT);
  return (
    <div className={cn('grid content-start gap-2', wide && 'grid-cols-2')}>
      {shown.map(card)}
      {items.length > shown.length && (
        <Button variant="ghost" size="sm" className="col-span-full text-muted-foreground" onClick={onExpand}>
          Show {formatNumber(items.length - shown.length)} more
        </Button>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Loading the board">
      {[4, 2, 3, 1, 2].map((n, i) => (
        <div key={i} className="grid w-64 shrink-0 content-start gap-2 rounded-xl bg-muted/60 p-2">
          <Skeleton className="m-1 h-5 w-28" />
          {Array.from({ length: n }, (_, j) => (
            <Skeleton key={j} className="h-24 rounded-lg bg-card" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BoardView({ me, scope, project, projectLoading }: { me: string; scope: Clause | undefined; project: Project | null | undefined; projectLoading: boolean }) {
  const account = useAccount();
  const phone = useMediaQuery('(max-width: 767px)');

  // The statuses the first project picked uses (all active ones without a project), as columns.
  const statuses = useQuery({
    queryKey: ['board-statuses', project?.documentId ?? null, project?.configStatus ?? null],
    queryFn: async () => (await api.search<LookupDoc>(boardStatusQuery(project), { size: 100 })).documents,
    enabled: !projectLoading,
    staleTime: 10 * 60_000,
  });
  const columns = useMemo(() => boardColumns(statuses.data ?? []), [statuses.data]);
  const request = useMemo(() => (columns.length ? boardItemsQuery(me, columns, scope) : null), [me, columns, scope]);
  const search = useSearch<Item>(ITEMS, request, { size: BOARD_SIZE, include: CARD_FIELDS });

  // Moves saved here that search hasn't caught up with yet (an optimistic board).
  const [moves, setMoves] = useState<Moves>({});
  const { items, settled } = useMemo(() => applyMoves(search.data?.documents ?? [], moves), [search.data, moves]);
  useEffect(() => {
    if (settled.length)
      setMoves((m) => {
        const next = { ...m };
        for (const id of settled) delete next[id];
        return next;
      });
  }, [settled]);

  const [text, setText] = useState('');
  const all = useMemo(() => layoutBoard(items, columns), [items, columns]);
  const board = useMemo(() => (text.trim() ? layoutBoard(filterCards(items, text), columns) : all), [all, items, columns, text]);
  const targets = useMemo<Targets>(() => ({ columns, lanes: all.lanes.map((l) => ({ name: l.name, assignee: l.assignee })) }), [columns, all.lanes]);

  const { mutate } = useUpdateDocument<Item>(ITEMS);
  const move = useCallback(
    (item: Item, to: MoveTarget) => {
      const plan = planMove(item, to);
      if (!plan) return;
      const change = boardMove({ status: plan.status, assignee: plan.assignee }, account);
      const id = item.documentId;
      setMoves((m) => ({ ...m, [id]: change }));
      mutate(
        { documentId: id, fields: change },
        {
          onSuccess: () => toast.success(plan.message, { description: `${item.itemId ?? item.itemRef} · ${item.summary ?? ''}` }),
          onError: (error) => {
            setMoves((m) => {
              const next = { ...m };
              delete next[id];
              return next;
            });
            toast.error(`Couldn’t move ${item.itemId ?? 'the item'}`, { description: (error as Error).message });
          },
        },
      );
    },
    [account, mutate],
  );

  // Dragging (desktop): the card held and the cell under it.
  const [dragging, setDragging] = useState<{ id: string; cell: string }>();
  const held = useRef<Item | null>(null);
  const [over, setOver] = useState<string>();
  const startDrag = useCallback((item: Item) => {
    held.current = item;
    setDragging({ id: item.documentId, cell: `${laneOf(item)}|${statusOf(item)}` });
  }, []);
  const endDrag = useCallback(() => {
    held.current = null;
    setDragging(undefined);
    setOver(undefined);
  }, []);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expand = (key: string) => setExpanded((s) => new Set(s).add(key));
  const [phoneColumn, setPhoneColumn] = useState<string>();

  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const openMenu = useCallback((item: Item, button: HTMLElement, keyboard: boolean) => setMenu({ item, button, keyboard }), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const card = (item: Item) => (
    <BoardCard
      key={item.documentId}
      item={item}
      draggable={!phone}
      dragging={dragging?.id === item.documentId}
      menuOpen={menu?.item.documentId === item.documentId}
      onMenu={openMenu}
      onDragStart={startDrag}
      onDragEnd={endDrag}
    />
  );
  const moveMenu = menu && <MoveMenu menu={menu} targets={targets} onMove={move} onClose={closeMenu} />;

  const total = search.data?.total ?? 0;
  const shownCount = board.lanes.reduce((n, l) => n + l.count, 0);

  if (statuses.isError) return <Alert>{(statuses.error as Error).message}</Alert>;
  if (projectLoading || statuses.isPending || (request && search.isPending)) return <BoardSkeleton />;
  if (!columns.length)
    return (
      <Card>
        <EmptyState icon={Columns3} title="No board statuses">
          The project picked has no active statuses from Open to Released awaiting test.
        </EmptyState>
      </Card>
    );
  if (search.isError)
    return (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Couldn’t load your board. {(search.error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => void search.refetch()}>
            <RotateCw />
            Try again
          </Button>
        </div>
      </Alert>
    );
  if (!items.length)
    return (
      <Card>
        <EmptyState icon={Columns3} title="Nothing on your board">
          No open items are assigned to you in these projects.
        </EmptyState>
      </Card>
    );

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter cards" aria-label="Filter the board" className="pl-9" />
      </div>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {text.trim() ? `${formatNumber(shownCount)} of ${formatNumber(items.length)} items match. ` : `${formatNumber(items.length)} open items. `}
        {total > BOARD_SIZE && `The board shows the ${formatNumber(BOARD_SIZE)} most recently updated of ${formatNumber(total)}: pick a project to narrow it down. `}
        {!phone && 'Drag a card to change its status, or use its menu.'}
      </p>
      <Button variant="ghost" size="icon-sm" onClick={() => void search.refetch()} aria-label="Reload the board" disabled={search.isFetching}>
        <RefreshCw className={cn(search.isFetching && 'animate-spin')} />
      </Button>
    </div>
  );

  const nothingMatches = !!text.trim() && shownCount === 0 && (
    <Card>
      <EmptyState
        icon={SearchX}
        title={`No cards match “${text.trim()}”`}
        action={
          <Button variant="outline" onClick={() => setText('')}>
            <X />
            Clear the filter
          </Button>
        }
      />
    </Card>
  );

  if (phone) {
    const current = board.columns.find((c) => c.name === phoneColumn) ?? board.columns.find((c) => c.count > 0) ?? board.columns[0];
    const ci = board.columns.indexOf(current);
    return (
      <div>
        {toolbar}
        {moveMenu}
        {nothingMatches || (
          <>
            <div role="radiogroup" aria-label="Status" className="-mx-4 mb-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
              {board.columns.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={c === current}
                  onClick={() => setPhoneColumn(c.name)}
                  className={cn(
                    'inline-flex shrink-0 cursor-pointer snap-start items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground shadow-xs',
                    c === current && 'border-primary/60 text-foreground ring-2 ring-primary/15',
                  )}
                >
                  <span className="size-2.5 rounded-full border border-black/10 dark:border-white/15" style={{ backgroundColor: c.color }} />
                  {c.name}
                  <span className="tabular-nums">{formatNumber(c.count)}</span>
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {board.lanes.map((lane) => {
                const cell = lane.cells[ci] ?? [];
                const key = `${lane.name}|${current.name}`;
                return (
                  <section key={lane.name} aria-label={`${lane.name}: ${cell.length}`}>
                    {board.lanes.length > 1 && (
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <PersonAvatar name={lane.name} size={22} />
                        {lane.name}
                        <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(cell.length)}</span>
                      </h3>
                    )}
                    {cell.length ? (
                      <CellCards items={cell} expanded={expanded.has(key)} onExpand={() => expand(key)} card={card} />
                    ) : (
                      <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">Nothing in {current.name}</div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  const minWidths = board.columns.map((c) => (c.wide ? 33 : 17));
  return (
    <div>
      {toolbar}
      {moveMenu}
      {nothingMatches || (
        <div role="region" aria-label="My items board" tabIndex={0} className="max-h-[max(28rem,calc(100dvh-20rem))] overflow-auto rounded-xl border border-border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/25">
          <div className="grid" style={{ gridTemplateColumns: minWidths.map((w) => `minmax(${w}rem, 1fr)`).join(' '), minWidth: `${minWidths.reduce((a, b) => a + b, 0)}rem` }}>
            {board.columns.map((c, ci) => (
              <div
                key={c.name}
                className={cn('sticky top-0 z-20 flex items-center gap-2 border-t-[3px] border-r border-b border-r-border border-b-border px-3 py-2.5', ci === board.columns.length - 1 && 'border-r-0')}
                style={headerStyle(c.color)}
              >
                <h3 className="truncate text-sm font-semibold">{c.name}</h3>
                <span className="rounded-full bg-card/80 px-1.5 py-px text-xs font-medium text-muted-foreground tabular-nums shadow-xs">{formatNumber(c.count)}</span>
              </div>
            ))}
            {board.lanes.map((lane) => (
              <Fragment key={lane.name}>
                <div className="col-span-full border-b border-border bg-card/70">
                  <div className="sticky left-0 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium">
                    <PersonAvatar name={lane.name} size={22} />
                    {lane.name}
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatNumber(lane.count)} items</span>
                  </div>
                </div>
                {board.columns.map((c, ci) => {
                  const key = `${lane.name}|${c.name}`;
                  const cell = lane.cells[ci];
                  const source = dragging?.cell === key;
                  const target = !!dragging && !source;
                  return (
                    <div
                      key={key}
                      data-cell={key}
                      aria-label={`${lane.name}, ${c.name}: ${cell.length}`}
                      onDragOver={(e: DragEvent) => {
                        if (!target) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (over !== key) setOver(key);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === key ? undefined : o));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const item = held.current;
                        endDrag();
                        if (item && target) move(item, { column: c, lane });
                      }}
                      className={cn('min-h-28 border-r border-b border-border p-2 transition-colors', ci === board.columns.length - 1 && 'border-r-0', over === key && 'bg-primary-soft/70 outline-2 -outline-offset-2 outline-primary outline-dashed')}
                    >
                      {cell.length ? (
                        <CellCards items={cell} wide={c.wide} expanded={expanded.has(key)} onExpand={() => expand(key)} card={card} />
                      ) : (
                        <div className={cn('flex h-full min-h-24 items-center justify-center rounded-lg text-xs text-muted-foreground', target && 'border border-dashed border-border')}>{target ? 'Drop here' : ''}</div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
