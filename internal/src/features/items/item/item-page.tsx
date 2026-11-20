// The Item pages (Formbird's Item template): /items/new, and /items/:ref where ref is the item's
// number ("31492"), its padded id ("0031492") or its documentId.

import { FileQuestion, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '@react-frontends/shared/api';
import { EmptyState, Page } from '@react-frontends/shared/components';
import { Button, Skeleton } from '@react-frontends/shared/ui';
import { rememberedProject, useAccount, useItem } from '@/data/sdms';
import { newItemDefaults } from '@/domain/rules';
import type { Item } from '@/domain/types';
import { BackLink, ItemFormPage } from './item-form';

function ItemSkeleton() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading the item">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="mb-2 h-4 w-40" />
        <Skeleton className="mb-3 h-8 w-full max-w-xl" />
        <Skeleton className="mb-8 h-4 w-72" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid content-start gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <Skeleton className="order-first h-96 rounded-xl lg:order-none" />
        </div>
      </div>
    </Page>
  );
}

function ItemMissing({ number, error, onRetry }: { number?: string; error?: unknown; onRetry?: () => void }) {
  const gone = !error || (error instanceof ApiError && (error.status === 404 || /not found/i.test(error.message)));
  return (
    <Page>
      <BackLink />
      <EmptyState
        icon={FileQuestion}
        title={gone ? 'Item not found' : 'Couldn’t load the item'}
        action={
          gone ? (
            <Button asChild variant="outline">
              <Link to="/items">Go to All items</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={onRetry}>
              <RotateCw />
              Try again
            </Button>
          )
        }
      >
        {gone ? `There’s no item ${number ? `“${number}”` : 'at this address'}. It may have been removed, or the number is wrong.` : (error as Error)?.message}
      </EmptyState>
    </Page>
  );
}

export function NewItemPage() {
  const account = useAccount();
  // The starting values, once: you as reporter and creator, your project or the last one picked.
  const [initial] = useState<Item>(() => newItemDefaults(account, rememberedProject()));
  return <ItemFormPage saved={null} initial={initial} />;
}

export function ItemPage() {
  const { ref } = useParams();
  const { id, item, notFound } = useItem(ref);
  if (notFound) return <ItemMissing number={ref} />;
  if (id.isError) return <ItemMissing number={ref} error={id.error} onRetry={() => void id.refetch()} />;
  if (item.isError) return <ItemMissing number={ref} error={item.error} onRetry={() => void item.refetch()} />;
  if (!item.data) return <ItemSkeleton />;
  // An id can name any document: only items open here.
  if (!item.data.appTags?.includes('item')) return <ItemMissing number={ref} />;
  // A new form for each item (its draft starts empty).
  return <ItemFormPage key={item.data.documentId} saved={item.data} initial={item.data} />;
}
