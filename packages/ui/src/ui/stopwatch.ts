// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useLayoutEffect, useRef } from "preact/hooks";

/** Time the screen was shown for, the time the page was hidden left out (useStopwatch). */
export interface Stopwatch {
  /** Milliseconds counted since the screen came up, or since the last restart. */
  read(): number;
  /** Count from naught again, from now. */
  restart(): void;
}

/**
 * A stopwatch started as the component mounts, for how long an answer
 * takes (Answer.recallMillis, gradeMillis): it stops while the page is
 * hidden (visibilitychange) and goes on as it shows again. Counted on
 * performance.now(), which the screen's clock (useClock) never moves.
 */
export function useStopwatch(): Stopwatch {
  const counted = useRef<{ before: number; since: number | null } | null>(null);
  const shownSince = () => (document.visibilityState === "hidden" ? null : performance.now());
  counted.current ??= { before: 0, since: shownSince() };
  useLayoutEffect(() => {
    const onVisibility = () => {
      const watch = counted.current!;
      if (document.visibilityState === "hidden") {
        if (watch.since !== null) watch.before += performance.now() - watch.since;
        watch.since = null;
      } else {
        watch.since ??= performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return {
    read() {
      const watch = counted.current!;
      return watch.before + (watch.since === null ? 0 : performance.now() - watch.since);
    },
    restart() {
      counted.current = { before: 0, since: shownSince() };
    },
  };
}
