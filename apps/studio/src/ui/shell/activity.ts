import { createContext } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";

/** A line of the Studio's activity: what a screen said was done, and when. */
export interface ActivityEntry {
  id: number;
  at: Date;
  text: string;
}

/** How many lines the activity keeps: the oldest go first. */
export const ACTIVITY_LIMIT = 50;

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
