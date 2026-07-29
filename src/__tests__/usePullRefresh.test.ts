import { act, renderHook } from '@testing-library/react-native';

import { usePullRefresh } from '../hooks/usePullRefresh';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('usePullRefresh', () => {
  it('does not report refreshing until the user pulls', () => {
    const { result } = renderHook(() => usePullRefresh(() => Promise.resolve()));

    expect(result.current.refreshing).toBe(false);
  });

  it('reports refreshing for the duration of the pull', async () => {
    const d = deferred();
    const { result } = renderHook(() => usePullRefresh(() => d.promise));

    act(() => result.current.onRefresh());
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('waits for every refetch before clearing', async () => {
    const a = deferred();
    const b = deferred();
    const { result } = renderHook(() =>
      usePullRefresh([() => a.promise, () => b.promise]),
    );

    act(() => result.current.onRefresh());
    await act(async () => {
      a.resolve();
      await a.promise;
    });
    expect(result.current.refreshing).toBe(true);

    await act(async () => {
      b.resolve();
      await b.promise;
    });
    expect(result.current.refreshing).toBe(false);
  });

  it('clears the spinner when a refetch rejects', async () => {
    const d = deferred();
    const { result } = renderHook(() => usePullRefresh(() => d.promise));

    act(() => result.current.onRefresh());
    await act(async () => {
      d.reject(new Error('network'));
      await d.promise.catch(() => undefined);
    });

    expect(result.current.refreshing).toBe(false);
  });

  it('clears the spinner when a refetch throws synchronously', async () => {
    const { result } = renderHook(() =>
      usePullRefresh(() => {
        throw new Error('boom');
      }),
    );

    await act(async () => {
      result.current.onRefresh();
    });

    expect(result.current.refreshing).toBe(false);
  });

  it('accepts a refetch that returns a non-promise', async () => {
    const refetch = jest.fn(() => 'done');
    const { result } = renderHook(() => usePullRefresh(refetch));

    await act(async () => {
      result.current.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  it('keeps a stable onRefresh identity across renders', () => {
    const { result, rerender } = renderHook(() =>
      usePullRefresh(() => Promise.resolve()),
    );
    const first = result.current.onRefresh;

    rerender({});

    expect(result.current.onRefresh).toBe(first);
  });

  it('calls the latest refetch even though the callback is stable', async () => {
    const first = jest.fn(() => Promise.resolve());
    const second = jest.fn(() => Promise.resolve());
    const { result, rerender } = renderHook<
      ReturnType<typeof usePullRefresh>,
      { fn: () => Promise<void> }
    >(({ fn }) => usePullRefresh(fn), { initialProps: { fn: first } });

    rerender({ fn: second });
    await act(async () => {
      result.current.onRefresh();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not set state after unmount', async () => {
    const d = deferred();
    const { result, unmount } = renderHook(() => usePullRefresh(() => d.promise));

    act(() => result.current.onRefresh());
    unmount();

    await act(async () => {
      d.resolve();
      await d.promise;
    });
    // No "state update on unmounted component" warning should be produced.
  });
});
