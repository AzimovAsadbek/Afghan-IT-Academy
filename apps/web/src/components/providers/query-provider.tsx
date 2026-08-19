'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * TanStack Query defaults, tuned for unreliable, expensive connectivity.
 *
 * The stock defaults assume a fast, always-on network: refetch on every window
 * focus, retry three times immediately, treat data as stale at once. On a
 * metered 2G link that behaviour burns the learner's data allowance and makes
 * the app feel broken. Every override below exists for that reason.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Course catalogues and lesson metadata change rarely; five minutes of
        // freshness removes most repeat requests during a study session.
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,

        // Refetching because the user switched tabs is pure waste here.
        refetchOnWindowFocus: false,
        // Do refetch when the connection comes back: that is the moment stale
        // data is most likely to matter.
        refetchOnReconnect: true,

        // Retry transient failures, but never a 4xx — a 404 will still be a 404.
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (typeof status === 'number' && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        // Back off so a flaky link is not hammered.
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: {
        // Mutations are not idempotent; a blind retry could double-submit an
        // enrollment or a quiz answer.
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created in state, not at module scope: a module-level client would be
  // shared across requests on the server and leak one user's cache to another.
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
