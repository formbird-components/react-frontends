// My View (Formbird's "My View" template and its rules, My View - onFieldState): the person's own
// items in the projects picked. Three views, kept in the URL: the eight lists (counted in tiles),
// the "My items" board, and the SDMS emails sent to them.

import { Bell, Columns3, ListTodo, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Page, PageHeader } from '@react-frontends/shared/components';
import { Button, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Tip } from '@react-frontends/shared/ui';
import { ProjectPicker } from '@/components/pickers';
import { useProject } from '@/data/sdms';
import type { MyViewPanel } from '@/domain/queries';
import { BoardView } from './board-view';
import { isPanel, MyLists } from './lists';
import { NotificationsPanel } from './notifications-panel';
import { useMyViewScope } from './scope';

const VIEWS = ['lists', 'board', 'notifications'] as const;
type View = (typeof VIEWS)[number];

export function MyViewPage() {
  const s = useMyViewScope();
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const view: View = (VIEWS as readonly string[]).includes(viewParam ?? '') ? (viewParam as View) : 'lists';
  const listParam = params.get('list');
  const panel: MyViewPanel = isPanel(listParam) ? listParam : 'assigned';
  // The board uses the first project's statuses (the original's projectRel[0]).
  const project = useProject(s.picked[0]?.documentId);

  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <Page wide>
      <PageHeader
        title="My View"
        description={s.describe}
        actions={
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:w-auto">
            <div className="flex min-w-0 flex-1 items-center gap-1 sm:w-80 sm:flex-none">
              <ProjectPicker
                field="projectRel"
                multiple
                showAll={s.showAll}
                value={s.picked}
                onChange={s.setPicked}
                placeholder={s.showAll ? 'All projects' : 'All your projects'}
                id="my-view-projects"
                className="min-w-0 flex-1"
              />
              {s.picked.length > 0 && (
                <Tip content="Clear the projects">
                  <Button variant="ghost" size="icon" onClick={() => s.setPicked([])} aria-label="Clear the projects">
                    <X />
                  </Button>
                </Tip>
              )}
            </div>
            {s.isAdmin && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium whitespace-nowrap text-muted-foreground">
                <Switch checked={s.showAll} onCheckedChange={s.setShowAll} />
                Show all projects
              </label>
            )}
          </div>
        }
      />

      <Tabs value={view} onValueChange={(v) => setParam('view', v === 'lists' ? undefined : v)}>
        <TabsList className="mb-1">
          <TabsTrigger value="lists">
            <ListTodo />
            Lists
          </TabsTrigger>
          <TabsTrigger value="board">
            <Columns3 />
            My board
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell />
            Notifications
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lists">
          <MyLists me={s.account.documentId} scope={s.scope} panel={panel} onPanel={(p) => setParam('list', p === 'assigned' ? undefined : p)} />
        </TabsContent>
        <TabsContent value="board">
          <BoardView me={s.account.documentId} scope={s.scope} project={project.data} projectLoading={s.picked.length > 0 && project.isPending} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsPanel email={s.account.email} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
