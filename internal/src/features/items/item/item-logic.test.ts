import { describe, expect, it } from 'vitest';
import { linkMentions } from '@/domain/rules';
import type { Account, Item, Note } from '@/domain/types';
import {
  canEditNote,
  editNote,
  escapeRawHtml,
  fileKind,
  fileUrl,
  isImage,
  itemLinkMarkdown,
  mentionMarkdown,
  oldHistoryRows,
  pendingFields,
  rebaseNotes,
  relatedIds,
  relationshipRows,
  replaceToken,
  setField,
  tokenAt,
  unsavedNoteIds,
  withQuickNote,
} from './item-logic';

const me: Account = { documentId: 'me', systemHeader: { summaryName: 'Jo Bloggs' }, email: 'jo.bloggs@example.com' };
const now = new Date('2026-11-11T01:00:00Z');
const note = (dataId: string, detail: string, by = 'me'): Note => ({ dataId, detail, createdDate: '2026-01-01T00:00:00Z', createdBy: { documentId: by, name: by } });
const closed = { documentId: 'closed', name: 'Closed', disableItemBool: true };
const open = { documentId: 'open', name: 'Open' };

describe('the draft', () => {
  const base: Item = { documentId: 'i', summary: 'A', description: 'Text', tagsRel: [] };

  it('keeps a change', () => {
    expect(setField({}, base, 'summary', 'B')).toEqual({ summary: 'B' });
  });

  it('drops a change back to the saved value', () => {
    expect(setField({ summary: 'B' }, base, 'summary', 'A')).toEqual({});
  });

  it('treats empty as unchanged where the item had nothing', () => {
    expect(setField({}, base, 'reproduction', '')).toEqual({});
    expect(setField({}, base, 'tagsRel', [])).toEqual({});
    expect(setField({}, base, 'assigneeRel', [])).toEqual({});
  });

  it('keeps clearing a field that had a value', () => {
    expect(setField({}, base, 'description', '')).toEqual({ description: '' });
  });

  it('lists only real changes when the saved item caught up', () => {
    expect(pendingFields({ ...base, summary: 'B' }, { summary: 'B', description: 'New' })).toEqual(['description']);
  });
});

describe('notes', () => {
  it('shows raw HTML as text, but not in code', () => {
    expect(escapeRawHtml('<img src=x onerror=alert(1)> and `<b>` a < b')).toBe('&lt;img src=x onerror=alert(1)> and `<b>` a < b');
    expect(escapeRawHtml('```\n<div>\n```\n</p>')).toBe('```\n<div>\n```\n&lt;/p>');
  });

  it('only the author edits a note', () => {
    expect(canEditNote(note('1', 'x'), 'me')).toBe(true);
    expect(canEditNote(note('1', 'x', 'them'), 'me')).toBe(false);
    expect(canEditNote({ dataId: '1', detail: 'x', createdDate: '' }, 'me')).toBe(false);
  });

  it('keeps the text a note had in its history', () => {
    const edited = editNote(note('1', 'old'), ' new ', now);
    expect(edited.detail).toBe('new');
    expect(edited.modifiedDate).toBe(now.toISOString());
    expect(edited.notesHistory).toEqual([{ dataId: '1', detail: 'old', createdBy: { documentId: 'me', name: 'me' }, createdDate: '2026-01-01T00:00:00Z' }]);
    expect(editNote(edited, 'newer', now).notesHistory).toHaveLength(2);
  });

  it('applies added and edited notes to the latest saved notes', () => {
    const saved = [note('1', 'one'), note('2', 'two')];
    const draft = [note('1', 'one, edited'), note('2', 'two'), note('4', 'mine')];
    const latest = [note('1', 'one'), note('2', 'two'), note('3', 'theirs')];
    expect(rebaseNotes(saved, draft, latest).map((n) => `${n.dataId}:${n.detail}`)).toEqual(['1:one, edited', '2:two', '3:theirs', '4:mine']);
  });

  it('knows which notes are not saved yet', () => {
    expect([...unsavedNoteIds([note('1', 'a'), note('2', 'b')], [note('1', 'a'), note('2', 'b!'), note('3', 'c')])]).toEqual(['2', '3']);
  });
});

describe('the quick status note (#31244)', () => {
  const saved: Item = { documentId: 'i', statusRel: [open], notesCommentsArr: [note('1', 'one')] };

  it('is added as the last note when the status changes to a closing one', () => {
    const out = withQuickNote(saved, { ...saved, statusRel: [closed] }, ' Done <b>now</b> ', me, now);
    expect(out.notesCommentsArr?.map((n) => n.detail)).toEqual(['one', 'Done &lt;b>now&lt;/b>']);
    expect(out.notesCommentsArr?.[1].createdBy).toEqual({ documentId: 'me', name: 'Jo Bloggs' });
    expect(out).not.toHaveProperty('quickStatusNote');
  });

  it('is dropped unless the status is being closed in this edit', () => {
    expect(withQuickNote(saved, saved, 'x', me, now)).toBe(saved);
    const alreadyClosed = { ...saved, statusRel: [closed] };
    expect(withQuickNote(alreadyClosed, alreadyClosed, 'x', me, now)).toBe(alreadyClosed);
    expect(withQuickNote(saved, { ...saved, statusRel: [closed] }, '  ', me, now).notesCommentsArr).toHaveLength(1);
  });
});

describe('mentions and item links', () => {
  it('finds the @mention or #item at the caret', () => {
    expect(tokenAt('Hi @jo', 6)).toEqual({ trigger: '@', query: 'jo', start: 3, end: 6 });
    expect(tokenAt('@', 1)).toEqual({ trigger: '@', query: '', start: 0, end: 1 });
    expect(tokenAt('see #314', 8)).toEqual({ trigger: '#', query: '314', start: 4, end: 8 });
    expect(tokenAt('(#31', 4)?.query).toBe('31');
  });

  it('ignores emails, headings and finished words', () => {
    expect(tokenAt('mail jo@x.com', 13)).toBeNull();
    expect(tokenAt('# Heading', 1)).toBeNull();
    expect(tokenAt('@jo done', 8)).toBeNull();
  });

  it('replaces the token and puts the caret after it', () => {
    const t = tokenAt('Hi @jo please', 6)!;
    expect(replaceToken('Hi @jo please', t, '[@Jo](mailto:jo@x)')).toEqual({ text: 'Hi [@Jo](mailto:jo@x) please', caret: 21 });
    expect(replaceToken('Hi @jo', tokenAt('Hi @jo', 6)!, 'X')).toEqual({ text: 'Hi X ', caret: 5 });
  });

  it('writes a mention the way linkMentions does', () => {
    expect(mentionMarkdown('jo.bloggs@example.com')).toBe('[@JoBloggs](mailto:jo.bloggs@example.com)');
    expect(mentionMarkdown('jo.bloggs@example.com')).toBe(linkMentions('@jobloggs', ['jo.bloggs@example.com']));
    expect(mentionMarkdown('admin@example.com')).toBe('[@Admin](mailto:admin@example.com)');
  });

  it('writes an item link the way linkItemRefs does', () => {
    expect(itemLinkMarkdown({ documentId: 'abc', itemId: '0031492', itemRef: '31492' })).toBe('[0031492](/form/abc)');
  });
});

describe('relationships', () => {
  const rels = [
    { documentId: 'a', relationshipType: 'Parent' as const, itemId: '0000001' },
    { documentId: 'xx', name: 'xx', relationshipType: 'Related' as const, mantisIssueIdForMatch: '0011036' },
    { documentId: 'gone', relationshipType: 'Child' as const },
  ];

  it('pairs each link with its item, and marks unmatched and missing ones', () => {
    const rows = relationshipRows(rels, [{ documentId: 'a', itemId: '0000001' }]);
    expect(rows.map((r) => [r.type, r.item?.documentId, r.unmatched, r.missing])).toEqual([
      ['Parent', 'a', undefined, false],
      ['Related', undefined, '0011036', false],
      ['Child', undefined, undefined, true],
    ]);
  });

  it('reads only matched items', () => {
    expect(relatedIds(rels)).toEqual(['a', 'gone']);
  });
});

describe('attachments', () => {
  it('knows images by name, else by type', () => {
    expect(isImage({ fileNo: '1', fileName: 'Shot.PNG', fileType: 'txt' })).toBe(true);
    expect(isImage({ fileNo: '1', fileName: 'notes.md', fileType: 'png' })).toBe(false);
    expect(isImage({ fileNo: '1', fileName: 'shot', fileType: 'jpeg' })).toBe(true);
  });

  it('links to the file with its name', () => {
    expect(fileUrl({ fileNo: 'f-1', fileName: 'Screen shot 1.png' })).toBe('/api/getFile/f-1/Screen%20shot%201.png');
    expect(fileUrl({ fileNo: 'f-1' })).toBe('/api/getFile/f-1/f-1');
    expect(fileKind({ fileNo: '1', fileName: 'a.tar.gz' })).toBe('GZ');
  });
});

describe('migrated history', () => {
  it('keeps date, user, message and change', () => {
    expect(oldHistoryRows([{ createdDate: '2025-01-06T23:34:07.000Z', user: { name: 'Jo' }, message: 'Status', change: 'new => assigned' }])).toEqual([
      { key: '2025-01-06T23:34:07.000Z-0', date: '2025-01-06T23:34:07.000Z', user: 'Jo', message: 'Status', change: 'new => assigned' },
    ]);
    expect(oldHistoryRows(undefined)).toEqual([]);
  });
});
