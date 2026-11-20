// My View's board (ruleSetupBoard / ruleLoadBoard): your open items in lanes by assignee and
// columns by status. Laying it out, the moves made here that search hasn't caught up with, and
// what a drop (or "Move to…") changes. Pure: the board view renders what these return.

import type { BoardColumn } from '@/domain/queries';
import { byUrgency, lanesOf } from '@/domain/rules';
import type { Item, Ref } from '@/domain/types';

/** A column widens (two cards a row) when one of its cells holds more than this many cards. */
export const WIDE_AFTER = 6;
/** The board shows at most this many items (the original's size). */
export const BOARD_SIZE = 500;
/** Cards a cell shows before "Show more" (a cell can hold hundreds). */
export const CELL_LIMIT = 24;

export const statusOf = (item: Item) => item.statusRel?.[0]?.name ?? '';
export const laneOf = (item: Item) => item.assigneeRel?.[0]?.name ?? 'Unassigned';

export interface Lane {
  name: string;
  assignee?: Ref;
  count: number;
  /** The lane's items per column (same order as the columns), most urgent first. */
  cells: Item[][];
}

export interface BoardLayout {
  columns: (BoardColumn & { count: number; wide: boolean })[];
  lanes: Lane[];
  /** Items in no column (a status the board doesn't show). */
  outside: number;
}

/**
 * The board: lanes by assignee name (in name order), cells by status name, each cell most urgent
 * first (byUrgency; ties keep the search's order, latest change first). A column is wide when
 * any of its cells has more than WIDE_AFTER cards.
 */
export function layoutBoard(items: Item[], columns: BoardColumn[]): BoardLayout {
  const index = new Map(columns.map((c, i) => [c.name, i]));
  let outside = 0;
  const lanes: Lane[] = lanesOf(items).map((lane) => {
    const cells: Item[][] = columns.map(() => []);
    let count = 0;
    for (const item of lane.items) {
      const i = index.get(statusOf(item));
      if (i === undefined) {
        outside++;
        continue;
      }
      cells[i].push(item);
      count++;
    }
    for (const cell of cells) cell.sort(byUrgency);
    return { name: lane.name, assignee: lane.assignee, count, cells };
  });
  return {
    columns: columns.map((c, i) => ({
      ...c,
      count: lanes.reduce((n, l) => n + l.cells[i].length, 0),
      wide: lanes.some((l) => l.cells[i].length > WIDE_AFTER),
    })),
    lanes: lanes.filter((l) => l.count > 0),
    outside,
  };
}

/** Changes saved from the board, by item, until search shows them. */
export type Moves = Record<string, Partial<Item>>;

const sameRef = (a: Ref | undefined, b: Ref | undefined) => a?.documentId === b?.documentId && a?.name === b?.name;

/** Whether an item (as search has it) already shows a move. */
export function showsMove(item: Item, move: Partial<Item>): boolean {
  if (move.statusRel && item.statusRel?.[0]?.documentId !== move.statusRel[0]?.documentId) return false;
  if (move.assigneeRel && !sameRef(item.assigneeRel?.[0], move.assigneeRel[0])) return false;
  return true;
}

/**
 * The items with the moves made here applied (an optimistic board), and the moves search now
 * shows (to forget).
 */
export function applyMoves(items: Item[], moves: Moves): { items: Item[]; settled: string[] } {
  const settled: string[] = [];
  const out = items.map((item) => {
    const move = moves[item.documentId];
    if (!move) return item;
    if (showsMove(item, move)) {
      settled.push(item.documentId);
      return item;
    }
    return { ...item, ...move };
  });
  return { items: out, settled };
}

export interface MoveTarget {
  column?: BoardColumn;
  lane?: Pick<Lane, 'name' | 'assignee'>;
}

export interface PlannedMove {
  status?: BoardColumn['status'];
  assignee?: Ref;
  /** What the toast names: "Moved to In development / Jo Bloggs". */
  message: string;
}

/**
 * What moving an item to a cell changes (the drop handler of setupDragAndDrop): its status when
 * the column differs, its assignee when the lane differs and has one. Null when nothing changes.
 */
export function planMove(item: Item, to: MoveTarget): PlannedMove | null {
  const status = to.column && to.column.name !== statusOf(item) ? to.column.status : undefined;
  const assignee = to.lane && to.lane.name !== laneOf(item) && to.lane.assignee ? to.lane.assignee : undefined;
  if (!status && !assignee) return null;
  const parts = [status ? to.column!.name : undefined, assignee ? to.lane!.name : undefined].filter(Boolean);
  return { status, assignee, message: `Moved to ${parts.join(' / ')}` };
}

/** Items whose number, summary or project contain the text (the board's filter box). */
export function filterCards(items: Item[], text: string): Item[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const hay = [item.itemId, item.itemRef, item.summary, item.projectRel?.[0]?.name, item.typeRel?.[0]?.name].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
