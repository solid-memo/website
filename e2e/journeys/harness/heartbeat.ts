// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A page's heartbeat, for diagnostics.json: whether its scripts still
 * run, and whether it still draws. A page that stops answering ends a
 * journey with nothing in its trace to tell why (docs/testing.md#when-a-journey-fails):
 * a page whose scripts hang, or one that runs but no longer paints, stops
 * the network and the screencast alike. Its beats tell the two apart.
 */

/** How long a page may go without a beat, or without a frame, before it is noted. */
export const STALL_MS = 5_000;

/**
 * Calls `binding` every second with how many frames the page has drawn:
 * one requestAnimationFrame a beat, so a page that draws counts up. Runs
 * in the page, before its scripts (page.addInitScript), so it refers to
 * nothing outside itself; in the top frame alone.
 */
export function beat(binding: string): void {
  if (window.top !== window) return;
  let frames = 0;
  const drawn = () => {
    frames += 1;
  };
  setInterval(() => {
    requestAnimationFrame(drawn);
    const send = (window as unknown as Record<string, (frames: number) => Promise<void>>)[binding];
    // Its answer is lost when the page leaves; nothing waits for it.
    send?.(frames).catch(() => undefined);
  }, 1_000);
}

/** A time a page went quiet: no beat (a silence), or beats but no frame drawn (a still). */
export interface Stall {
  page: string;
  from: string;
  /** Null when the page never came back before it closed or the journey ended. */
  to: string | null;
  seconds: number;
}

export interface Stalls {
  silences: Stall[];
  stills: Stall[];
}

interface Pulse {
  /** When the last beat came. */
  at: number;
  frames: number;
  /** When the frames last counted up, and how many beats came since. */
  drawnAt: number;
  beatsSince: number;
}

const stall = (page: string, from: number, to: number | null, until: number): Stall => ({
  page,
  from: new Date(from).toISOString(),
  to: to === null ? null : new Date(to).toISOString(),
  seconds: Math.round((until - from) / 100) / 10,
});

/**
 * What the beats of each page (named by `page`) tell, noted in `found`:
 * each silence, and each still a page's beats came through. Times are
 * the test's clock (Date.now()), as css.log's are.
 */
export function heartbeats(found: Stalls, ms = STALL_MS) {
  const pulses = new Map<string, Pulse>();

  /** Notes a still that ended at `at` (null: it did not) if beats came through it. */
  const noteStill = (page: string, pulse: Pulse, at: number, ended: boolean) => {
    if (at - pulse.drawnAt > ms && pulse.beatsSince > 1)
      found.stills.push(stall(page, pulse.drawnAt, ended ? at : null, at));
  };

  /** The page's pulse, as at `at`: what is open is noted, and the page forgotten. */
  const stop = (page: string, at: number) => {
    const pulse = pulses.get(page);
    if (pulse === undefined) return;
    pulses.delete(page);
    if (at - pulse.at > ms) {
      found.silences.push(stall(page, pulse.at, null, at));
      noteStill(page, pulse, pulse.at, true);
    } else noteStill(page, pulse, at, false);
  };

  return {
    beat(page: string, frames: number, at: number): void {
      const pulse = pulses.get(page);
      if (pulse === undefined) {
        pulses.set(page, { at, frames, drawnAt: at, beatsSince: 0 });
        return;
      }
      if (at - pulse.at > ms) {
        found.silences.push(stall(page, pulse.at, at, at));
        // A still is a time beats came through: one going on ends where the silence began.
        noteStill(page, pulse, pulse.at, true);
        pulses.set(page, { at, frames, drawnAt: at, beatsSince: 0 });
        return;
      }
      pulse.at = at;
      // A page loaded anew counts from 0 again: it drew, as any change of the count says.
      if (frames !== pulse.frames) {
        noteStill(page, pulse, at, true);
        pulse.frames = frames;
        pulse.drawnAt = at;
        pulse.beatsSince = 0;
      } else pulse.beatsSince += 1;
    },
    /** The page closed at `at`. */
    close: stop,
    /** The journey ended at `at`: every page still open is stopped. */
    end(at: number): void {
      for (const page of [...pulses.keys()]) stop(page, at);
    },
  };
}
