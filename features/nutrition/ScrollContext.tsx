import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

interface ScrollContextValue {
  /** True while the active screen is scrolled to (or near) the top. */
  atTop:     boolean;
  /** Attach to a ScrollView's onScroll to drive the value above. */
  onScroll:  (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Screens without a scroll view call this so the button doesn't stay collapsed. */
  resetAtTop: () => void;
}

const Ctx = createContext<ScrollContextValue | null>(null);

// Past this the page has clearly moved and the label is just taking up room.
// A few pixels of overscroll or a keyboard nudge shouldn't collapse anything,
// hence not zero.
const TOP_THRESHOLD = 24;

/**
 * Tracks whether the visible screen is scrolled to the top.
 *
 * Lives above the tab bar rather than inside a screen because the button that
 * reacts to it is part of the tab bar, which outlives any one screen. Screens
 * opt in by spreading `onScroll` onto their ScrollView.
 */
export function ScrollProvider({ children }: { children: ReactNode }) {
  const [atTop, setAtTop] = useState(true);
  // Mirrors state so the scroll handler can skip setState on most frames —
  // this fires ~60x/sec while dragging and only two values matter.
  const atTopRef = useRef(true);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y <= TOP_THRESHOLD;
    if (next !== atTopRef.current) {
      atTopRef.current = next;
      setAtTop(next);
    }
  }, []);

  // Deferred a frame: callers invoke this from a focus effect, which runs
  // while the incoming screen is still committing. Setting provider state
  // synchronously there updates an ancestor mid-commit, which React reports
  // as a state update on a component that hasn't mounted.
  const resetAtTop = useCallback(() => {
    if (atTopRef.current) return;
    atTopRef.current = true;
    requestAnimationFrame(() => setAtTop(true));
  }, []);

  const value = useMemo(
    () => ({ atTop, onScroll, resetAtTop }),
    [atTop, onScroll, resetAtTop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Safe to call outside the provider — returns a sensible default rather than
 * throwing, so a screen rendered on its own (a modal route, say) still works.
 */
export function useScrollState(): ScrollContextValue {
  return useContext(Ctx) ?? {
    atTop: true,
    onScroll: () => {},
    resetAtTop: () => {},
  };
}
