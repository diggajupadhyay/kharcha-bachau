import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Tracks whether a scrollable region is parked at its top edge.
 *
 * Bottom sheets let a downward drag dismiss them, but their content has to scroll
 * too. Handing every drag to the sheet makes the content unscrollable; handing none
 * of them makes the sheet feel stuck. `useSheetDrag` takes this ref and only claims
 * a body drag while it is true, which gives the usual contract: the list scrolls
 * until it reaches the top, then the sheet takes over.
 *
 * A ref rather than state on purpose — this is read inside a PanResponder, and a
 * state update would re-render the sheet on every scroll frame.
 */
export const useScrollTop = (resetKey?: unknown) => {
  const atTop = useRef(true);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTop.current = e.nativeEvent.contentOffset.y <= 0;
  }, []);

  // Reopened sheets start at the top; the flag has to agree or the first drag would
  // be swallowed by content that is not where the flag says it is.
  useEffect(() => {
    atTop.current = true;
  }, [resetKey]);

  return { atTop, onScroll };
};