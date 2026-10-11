// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";

/** A line of the Studio's activity: what a screen said was done, when it last did, and how many times in a row. */
export interface ActivityEntry {
  id: number;
  at: Date;
  text: string;
  count: number;
}

/** How many lines the activity keeps: the oldest go first. */
export const ACTIVITY_LIMIT = 50;

/**
 * The activity (`entries`, the last first) with what was done told:
 * said again just after itself ("Draft saved", save after save), the
 * last line counts it once more, at the time told; else it is a line of
 * its own, `id`, before the others, the oldest past ACTIVITY_LIMIT left out.
 */
export function addActivity(
  entries: readonly ActivityEntry[],
  text: string,
  at: Date,
  id: number,
): ActivityEntry[] {
  const [last, ...before] = entries;
  if (last?.text === text) return [{ ...last, at, count: last.count + 1 }, ...before];
  return [{ id, at, text, count: 1 }, ...entries].slice(0, ACTIVITY_LIMIT);
}

/**
 * Where a screen tells the Studio's activity (the dock's Activity tab)
 * what was done: the line its status said; nothing, outside the Studio.
 */
export const ActivityLog = createContext<(text: string) => void>(() => undefined);

/** Tells the activity what was done, from an event's handler. */
export function useActivityLog(): (text: string) => void {
  return useContext(ActivityLog);
}

/**
 * Tells the activity what was done (`text`) each time `source` changes
 * to something done (anything but null, undefined or false): a result a
 * screen shows in its status line. What a screen shows as it opens was
 * not done there, and is not told.
 */
export function useActivity(source: unknown, text: () => string): void {
  const log = useActivityLog();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current && source !== null && source !== undefined && source !== false) log(text());
    opened.current = true;
  }, [source]);
}
