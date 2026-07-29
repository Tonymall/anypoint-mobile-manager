// ============================================================
// usePullRefresh
// ============================================================
// RefreshControl must only spin for a refresh the USER asked for.
//
// Screens used to pass React Query's `isRefetching` straight through,
// but that is true for every refetch — including the interval polling
// several screens run every 30s. The control would appear unprompted,
// push the content down, and retract again while the user was reading
// or mid-scroll. Background refreshes should be invisible; only a pull
// should show a spinner.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PullRefresh {
  /** Pass to RefreshControl's `refreshing` — true only during a pull. */
  refreshing: boolean;
  /** Pass to RefreshControl's `onRefresh`. */
  onRefresh: () => void;
}

/**
 * @param refetch one or more refetch functions; the spinner clears once
 *        they have all settled. Rejections are swallowed deliberately —
 *        a failed refresh surfaces through the screen's own error state,
 *        and an unhandled rejection here would leave the spinner stuck.
 */
export function usePullRefresh(
  refetch: (() => unknown) | Array<() => unknown>,
): PullRefresh {
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Keep the latest callbacks without making onRefresh a new function on
  // every render — screens pass it straight into RefreshControl. The ref is
  // updated in an effect rather than during render: onRefresh only reads it
  // from a press handler, which always runs after effects have committed.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const onRefresh = useCallback(() => {
    const current = refetchRef.current;
    const fns = Array.isArray(current) ? current : [current];

    setRefreshing(true);
    Promise.allSettled(
      fns.map((fn) => {
        try {
          return Promise.resolve(fn());
        } catch (error) {
          return Promise.reject(error);
        }
      }),
    ).finally(() => {
      if (mounted.current) setRefreshing(false);
    });
  }, []);

  return { refreshing, onRefresh };
}
