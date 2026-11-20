import { Construction } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState, Page, PageHeader } from './page';

/** A page still being built: its title, and what will go there. */
export const Placeholder = ({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) => (
  <Page>
    <PageHeader title={title} description={description} />
    <EmptyState icon={Construction} title="Coming soon">
      {children}
    </EmptyState>
  </Page>
);
