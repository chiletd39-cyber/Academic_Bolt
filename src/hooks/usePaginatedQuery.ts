import { useInfiniteQuery } from '@tanstack/react-query';
import { withRetry } from '@/lib/supabaseWithRetry';

export interface Page<T> { rows: T[]; count: number | null; nextOffset: number | null; }

interface Options<T> {
  key: readonly unknown[];
  pageSize?: number;
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null; count: number | null; error: unknown }>;
  enabled?: boolean;
  staleTime?: number;
}

export function usePaginatedQuery<T>({ key, pageSize = 25, fetcher, enabled = true, staleTime = 60_000 }: Options<T>) {
  return useInfiniteQuery<Page<T>>({
    queryKey: key,
    enabled,
    staleTime,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = Number(pageParam ?? 0);
      const to = from + pageSize - 1;
      const { data, count, error } = await withRetry(() => fetcher(from, to));
      if (error) throw error instanceof Error ? error : new Error(String(error));
      const rows = data ?? [];
      const nextOffset = rows.length === pageSize ? from + pageSize : null;
      return { rows, count, nextOffset };
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
}
