// Add note (All Items - onFieldState: ruleQuickStatusNoteDialog): a note on the one selected item
// without opening it. The item is read first, the note goes last, and the save marks the item's
// snapshot out of date, as a note added on the item's own form does.

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@react-frontends/shared/api';
import { useRefresh } from '@react-frontends/shared/data';
import { Button, Dialog, DialogContent, DialogFooter, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@react-frontends/shared/ui';
import { SdmsMarkdown } from '@/components/sdms-markdown';
import { linkText } from '@/data/save-item';
import { ITEMS, useAccount, useMentionEmails } from '@/data/sdms';
import { authorship, escapeRawHtml, newNote, notesFieldOf, withNote } from '@/domain/rules';
import type { Item, Note } from '@/domain/types';
import { labelOf } from './bulk';

export function AddNoteDialog({ item, open, onOpenChange }: { item: Item | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const account = useAccount();
  const emails = useMentionEmails();
  const refresh = useRefresh();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [tab, setTab] = useState('write');
  const [saving, setSaving] = useState(false);

  const close = (o: boolean) => {
    if (saving) return;
    onOpenChange(o);
    if (!o) {
      setText('');
      setTab('write');
    }
  };

  async function save() {
    if (!item || !text.trim()) return;
    setSaving(true);
    try {
      // Read the item as it is now: the note goes after any added since the list loaded.
      const current = await api.get<Item>(item.documentId);
      const detail = await linkText(escapeRawHtml(text.trim()), emails.data ?? []);
      const field = notesFieldOf(current);
      const saved = await api.update<Item>(item.documentId, {
        [field]: withNote(current[field] as Note[] | undefined, newNote(detail, account)),
        ...authorship(account),
        pendingNewSummaryDescriptionBool: true,
      });
      if (saved) client.setQueryData(['record', item.documentId], saved);
      refresh(ITEMS, item.documentId);
      toast.success(`Note added to ${labelOf(current)}.`);
      setSaving(false);
      close(false);
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : 'The note couldn’t be added.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent wide title={item ? `Add a note to ${labelOf(item)}` : 'Add a note'} description={item?.summary || undefined}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview" disabled={!text.trim()}>
              Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="pt-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              autoFocus
              placeholder="Status note…"
              aria-label="Note"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
              }}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Added as the item’s last note. Markdown; @name mentions and #12345 item numbers become links.</p>
          </TabsContent>
          <TabsContent value="preview" className="min-h-40 pt-3">
            <SdmsMarkdown text={text} className="rounded-lg border border-border p-3" />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!text.trim() || saving}>
            {saving ? 'Adding…' : 'Add note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
