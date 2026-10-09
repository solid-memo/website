import { useState } from "preact/hooks";
import { canonicalTag } from "@solid-memo/domain/languageTag";

/** Values kept past their screen, for the life of the page. */
const memory = new Map<string, unknown>();

/**
 * Like useState, but the value outlives the component: it is kept under
 * `key` and comes back when a component asks for that key again. A screen
 * the user leaves for a moment (a deck's page, a preview) is unmounted,
 * and its choices would otherwise be lost on the way back. Kept in memory
 * only, so a reload starts afresh and nothing lands in the browser's storage.
 */
export function useRemembered<T>(
  key: string,
  initial: T,
): [T, (update: (current: T) => T) => void] {
  const [value, setValue] = useState<T>(() =>
    memory.has(key) ? (memory.get(key) as T) : initial,
  );
  function update(next: (current: T) => T) {
    setValue((current) => {
      const value = next(current);
      memory.set(key, value);
      return value;
    });
  }
  return [value, update];
}

/** Drops what is kept under `key`, so its next screen starts afresh. */
export function forget(key: string): void {
  memory.delete(key);
}

/**
 * Whose language a recent choice was: a deck's own text (its name and
 * description) or a card's own text (its notes, label and pictures'
 * descriptions). Card sides take theirs from the deck's cards instead.
 */
export type RecentLanguageKind = "deck" | "own";

/** How many recent languages are kept of each kind. */
export const RECENT_LANGUAGES = 5;

const recentKey = (kind: RecentLanguageKind) => `solid-memo:recentLanguages.${kind}`;

/**
 * The languages last chosen for text of `kind` on this device, the
 * latest first. Kept in the browser's storage, which may be missing or
 * refuse (a private window, blocked site data) or hold something else:
 * then there are none, and nothing is preselected from them.
 */
export function recentLanguages(
  kind: RecentLanguageKind,
  storage: () => Storage = () => globalThis.localStorage,
): string[] {
  let stored: unknown;
  try {
    stored = JSON.parse(storage().getItem(recentKey(kind)) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) return [];
  const tags = stored.filter((tag): tag is string => typeof tag === "string" && canonicalTag(tag) === tag);
  return [...new Set(tags)].slice(0, RECENT_LANGUAGES);
}

/** Notes `tag` as the latest language chosen for text of `kind` on this device. */
export function rememberLanguage(
  kind: RecentLanguageKind,
  tag: string,
  storage: () => Storage = () => globalThis.localStorage,
): void {
  const recent = [tag, ...recentLanguages(kind, storage).filter((other) => other !== tag)];
  try {
    storage().setItem(recentKey(kind), JSON.stringify(recent.slice(0, RECENT_LANGUAGES)));
  } catch {
    // Without storage the choice is not offered again; nothing else depends on it.
  }
}

const collapsedKey = (instanceUrl: string) => `solid-memo:collapsedGroups.${instanceUrl}`;

/**
 * The deck groups of an instance the user folded shut on this device,
 * by URL. Kept in the browser's storage, never in the pod: how the list
 * is folded is this device's view of it. Storage that is missing,
 * refuses or holds something else folds none.
 */
export function collapsedGroups(
  instanceUrl: string,
  storage: () => Storage = () => globalThis.localStorage,
): string[] {
  let stored: unknown;
  try {
    stored = JSON.parse(storage().getItem(collapsedKey(instanceUrl)) ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(stored) ? stored.filter((url): url is string => typeof url === "string") : [];
}

/** Notes which of an instance's deck groups are folded shut on this device. */
export function rememberCollapsed(
  instanceUrl: string,
  urls: readonly string[],
  storage: () => Storage = () => globalThis.localStorage,
): void {
  try {
    storage().setItem(collapsedKey(instanceUrl), JSON.stringify(urls));
  } catch {
    // Without storage the list unfolds again on the next visit; nothing else depends on it.
  }
}
