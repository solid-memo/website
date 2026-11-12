// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReadBudget } from "./ports";

/**
 * A budget of `ms` milliseconds for some reads (ReadBudget), whose clock
 * runs only while one of them is under way: time spent waiting for any
 * other read, one of the instance's own documents say, takes nothing
 * from it. Once it is spent, a read under way is given up on and none is
 * started. It holds no timer while no read it covers is under way.
 */
export function readBudget(ms: number): ReadBudget {
  let left = ms;
  let running = 0;
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const spent = new AbortController();
  return {
    async spend(otherwise, read) {
      if (spent.signal.aborted) return otherwise;
      if (running++ === 0) {
        since = Date.now();
        timer = setTimeout(() => spent.abort(), left);
      }
      let stop: (() => void) | undefined;
      const given = new Promise<typeof otherwise>((resolve) => {
        stop = () => resolve(otherwise);
        spent.signal.addEventListener("abort", stop, { once: true });
      });
      try {
        return await Promise.race([read(), given]);
      } finally {
        spent.signal.removeEventListener("abort", stop!);
        if (--running === 0) {
          clearTimeout(timer);
          left -= Date.now() - since;
        }
      }
    },
  };
}
