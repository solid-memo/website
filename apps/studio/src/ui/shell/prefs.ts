// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { HASHED_CHARACTERS } from "@solid-memo/domain/pathKeys";
import {
  ASIDE_WIDTH,
  clampSize,
  DETAIL_WIDTH,
  DOCK_HEIGHT,
  type PaneSize,
  scaledPane,
} from "./splitter";
import { VIEW_TABLES, type SavedView, type ViewTable } from "./views";

/** How tightly the Studio's rows and controls are packed: compact (about 28px), or comfortable (44px, for touch). */
export type Density = "compact" | "comfortable";

export const DENSITIES: readonly Density[] = ["compact", "comfortable"];

/**
 * How the Studio is laid out on this device: its density, whether the
 * sidebar and the aside are shown on a wide screen, and the aside's
 * width, as itself and as a detail; whether the dock is shown, and its
 * height (in CSS pixels); and the columns each table hides, by the
 * table's name (DataTable's `columnsOf`), every column shown when a
 * table has none; and whether a character alone is a shortcut
 * (`characterKeys`, useShortcuts), which the user may turn off.
 */
export interface StudioPrefs {
  density: Density;
  sidebar: boolean;
  aside: boolean;
  asideWidth: number;
  detailWidth: number;
  dock: boolean;
  dockHeight: number;
  hiddenColumns: Readonly<Record<string, readonly string[]>>;
  characterKeys: boolean;
}

export const DEFAULT_PREFS: StudioPrefs = {
  density: "compact",
  sidebar: true,
  aside: true,
  asideWidth: ASIDE_WIDTH.initial,
  detailWidth: DETAIL_WIDTH.initial,
  dock: false,
  dockHeight: DOCK_HEIGHT.initial,
  hiddenColumns: {},
  characterKeys: true,
};

/** Versioned: a later shape of the preferences gets a key of its own, and starts from the defaults. */
export const PREFS_KEY = "solid-memo:studioLayout.v1";

/**
 * The Studio's layout as the user left it on this device. Kept in the
 * browser's storage, never in the pod: how the Studio is laid out is
 * this device's view of it. Storage that is missing, refuses or holds
 * something else gives the defaults, each preference on its own.
 */
export function studioPrefs(storage: () => Storage = () => globalThis.localStorage): StudioPrefs {
  let stored: unknown;
  try {
    stored = JSON.parse(storage().getItem(PREFS_KEY) ?? "{}");
  } catch {
    return DEFAULT_PREFS;
  }
  const {
    density,
    sidebar,
    aside,
    asideWidth,
    detailWidth,
    dock,
    dockHeight,
    hiddenColumns,
    characterKeys,
  } = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const shown = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;
  // A size out of its bounds is brought within them: the bounds (or the text size) may have changed since.
  const sized = (value: unknown, size: PaneSize) =>
    typeof value === "number" && Number.isFinite(value)
      ? clampSize(value, scaledPane(size))
      : size.initial;
  return {
    density: DENSITIES.includes(density as Density) ? (density as Density) : DEFAULT_PREFS.density,
    sidebar: shown(sidebar, DEFAULT_PREFS.sidebar),
    aside: shown(aside, DEFAULT_PREFS.aside),
    asideWidth: sized(asideWidth, ASIDE_WIDTH),
    detailWidth: sized(detailWidth, DETAIL_WIDTH),
    dock: shown(dock, DEFAULT_PREFS.dock),
    dockHeight: sized(dockHeight, DOCK_HEIGHT),
    hiddenColumns: columnsHidden(hiddenColumns),
    characterKeys: shown(characterKeys, DEFAULT_PREFS.characterKeys),
  };
}

/** The columns each table hides, as stored: only lists of names, by the tables' names; none of anything else. */
function columnsHidden(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([table, keys]) =>
      Array.isArray(keys)
        ? [[table, keys.filter((key): key is string => typeof key === "string")]]
        : [],
    ),
  );
}

/** Notes the Studio's layout on this device. */
export function rememberPrefs(
  prefs: StudioPrefs,
  storage: () => Storage = () => globalThis.localStorage,
): void {
  try {
    storage().setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Without storage the layout starts from the defaults on the next visit; nothing else depends on it.
  }
}

/** How many of the palette's entries the device remembers as used last. */
export const RECENT_LIMIT = 8;

export const RECENT_KEY = "solid-memo:studioRecent.v1";

/**
 * The palette's entries used last on this device, the last first, by
 * their ids (commandIndex.ts). Like the layout, kept in the browser's
 * storage; storage that is missing, refuses or holds something else
 * gives none.
 */
export function recentCommands(storage: () => Storage = () => globalThis.localStorage): string[] {
  let stored: unknown;
  try {
    stored = JSON.parse(storage().getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === "string").slice(0, RECENT_LIMIT)
    : [];
}

/** Notes an entry of the palette as the one used last. */
export function rememberCommand(
  id: string,
  storage: () => Storage = () => globalThis.localStorage,
): void {
  const recent = [id, ...recentCommands(storage).filter((each) => each !== id)].slice(
    0,
    RECENT_LIMIT,
  );
  try {
    storage().setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Without storage the palette lists no entry as used last; nothing else depends on it.
  }
}

/** A deck or a draft of an instance, by its URL, as the sidebar pins it or lists it as opened lately. */
export interface WorkItem {
  kind: "deck" | "draft";
  url: string;
}

/**
 * What the device keeps of each of the user's instances: the views
 * saved of each table (views.ts), the decks and drafts pinned, in the
 * order pinned, and those opened last, the last first.
 */
export interface InstancePrefs {
  views: Readonly<Record<ViewTable, readonly SavedView[]>>;
  pinned: readonly WorkItem[];
  recent: readonly WorkItem[];
}

export const NO_INSTANCE_PREFS: InstancePrefs = {
  views: { home: [], cards: [] },
  pinned: [],
  recent: [],
};

/** How many of the decks and drafts opened last the device keeps for an instance. */
export const RECENT_ITEMS = 5;

export const INSTANCE_KEY = "solid-memo:studioInstances.v1";

/**
 * The longest URL the device keeps, of an instance, a deck or a draft,
 * and the longest name or query of a saved view: the bound on a term
 * the app reads (HASHED_CHARACTERS, the solid package's
 * MAX_TERM_CHARACTERS). A longer URL names nothing the app could have
 * read, and no view the user saves needs more, so neither is kept, and
 * one kept before is left out as it is read.
 */
const MAX_KEPT_TEXT = HASHED_CHARACTERS;

/** Whether the device keeps a URL, a view's name or its query: one no longer than MAX_KEPT_TEXT. */
function keptText(text: string): boolean {
  return text.length <= MAX_KEPT_TEXT;
}

/**
 * Every instance's, as stored, by the instance's URL, each read as
 * instancePrefs reads it: none when the storage holds something else,
 * and none of an instance whose URL the device does not keep. When the
 * storage holds more than that, what is read is written back in its
 * place, once, so what the device does not keep leaves the storage
 * without waiting for the next change.
 */
function storedInstances(storage: () => Storage): Map<string, InstancePrefs> {
  let raw: string;
  let stored: unknown;
  try {
    raw = storage().getItem(INSTANCE_KEY) ?? "{}";
    stored = JSON.parse(raw);
  } catch {
    return new Map();
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return new Map();
  const instances = new Map(
    Object.entries(stored).flatMap(([instanceUrl, prefs]) =>
      keptText(instanceUrl) ? [[instanceUrl, prefsOf(prefs)] as const] : [],
    ),
  );
  const cleaned = JSON.stringify(Object.fromEntries(instances));
  if (cleaned !== raw) writeInstances(storage, cleaned);
  return instances;
}

/** Writes every instance's, as text; storage that refuses keeps what it had. */
function writeInstances(storage: () => Storage, value: string): void {
  try {
    storage().setItem(INSTANCE_KEY, value);
  } catch {
    // Without storage the views, the pins and the decks opened last go with the page; nothing else depends on them.
  }
}

/**
 * What the device keeps of an instance. Like the layout, kept in the
 * browser's storage, never in the pod; storage that is missing, refuses
 * or holds something else gives none, each part on its own, and a view
 * or an item that is not one is left out.
 */
export function instancePrefs(
  instanceUrl: string,
  storage: () => Storage = () => globalThis.localStorage,
): InstancePrefs {
  return storedInstances(storage).get(instanceUrl) ?? NO_INSTANCE_PREFS;
}

/** An instance's, as stored: each part on its own, what is not one left out. */
function prefsOf(stored: unknown): InstancePrefs {
  const { views, pinned, recent } =
    typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const byTable =
    typeof views === "object" && views !== null ? (views as Record<string, unknown>) : {};
  return {
    views: Object.fromEntries(
      VIEW_TABLES.map((table) => [table, savedViews(byTable[table])]),
    ) as Record<ViewTable, SavedView[]>,
    pinned: workItems(pinned),
    recent: workItems(recent).slice(0, RECENT_ITEMS),
  };
}

/** The views stored, those that are: a name and a query's parameters, as text, each one the device keeps. */
function savedViews(value: unknown): SavedView[] {
  return listOf(value).flatMap((view) =>
    typeof view.name === "string" &&
    view.name !== "" &&
    keptText(view.name) &&
    typeof view.params === "string" &&
    keptText(view.params)
      ? [{ name: view.name, params: view.params }]
      : [],
  );
}

/** The items stored, those that are: a deck's or a draft's URL, one the device keeps. */
function workItems(value: unknown): WorkItem[] {
  return listOf(value).flatMap((item) =>
    (item.kind === "deck" || item.kind === "draft") &&
    typeof item.url === "string" &&
    keptText(item.url)
      ? [{ kind: item.kind, url: item.url }]
      : [],
  );
}

/** The objects of a list stored; none of anything else. */
function listOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (each): each is Record<string, unknown> => typeof each === "object" && each !== null,
      )
    : [];
}

/**
 * Notes what the device keeps of an instance, the others' kept as they
 * are read (instancePrefs): an instance, a view or an item the device
 * does not keep is left out, of the others too.
 */
export function rememberInstancePrefs(
  instanceUrl: string,
  prefs: InstancePrefs,
  storage: () => Storage = () => globalThis.localStorage,
): void {
  const instances = storedInstances(storage);
  if (keptText(instanceUrl)) instances.set(instanceUrl, prefsOf(prefs));
  writeInstances(storage, JSON.stringify(Object.fromEntries(instances)));
}

/** Whether two items are the same deck or draft. */
export function sameItem(a: WorkItem, b: WorkItem): boolean {
  return a.kind === b.kind && a.url === b.url;
}

/** The items pinned with one pinned at the end, or, pinned already, no longer; one the device does not keep is not pinned. */
export function togglePin(pinned: readonly WorkItem[], item: WorkItem): WorkItem[] {
  if (pinned.some((each) => sameItem(each, item)))
    return pinned.filter((each) => !sameItem(each, item));
  return keptText(item.url) ? [...pinned, item] : [...pinned];
}

/** The items opened last with one opened now: first, once, as many as the device keeps; one it does not keep is not listed. */
export function openedNow(recent: readonly WorkItem[], item: WorkItem): WorkItem[] {
  if (!keptText(item.url)) return [...recent];
  return [item, ...recent.filter((each) => !sameItem(each, item))].slice(0, RECENT_ITEMS);
}
