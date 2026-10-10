import { ASIDE_WIDTH, clampSize, DOCK_HEIGHT, type PaneSize } from "./splitter";

/** How tightly the Studio's rows and controls are packed: compact (about 28px), or comfortable (44px, for touch). */
export type Density = "compact" | "comfortable";

export const DENSITIES: readonly Density[] = ["compact", "comfortable"];

/**
 * How the Studio is laid out on this device: its density, whether the
 * sidebar and the aside are shown on a wide screen, and the aside's
 * width; whether the dock is shown, and its height (in CSS pixels).
 */
export interface StudioPrefs {
  density: Density;
  sidebar: boolean;
  aside: boolean;
  asideWidth: number;
  dock: boolean;
  dockHeight: number;
}

export const DEFAULT_PREFS: StudioPrefs = {
  density: "compact",
  sidebar: true,
  aside: true,
  asideWidth: ASIDE_WIDTH.initial,
  dock: false,
  dockHeight: DOCK_HEIGHT.initial,
};

/** Versioned: a later shape of the preferences gets a key of its own, and starts from the defaults. */
const PREFS_KEY = "solid-memo:studioLayout.v1";

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
  const { density, sidebar, aside, asideWidth, dock, dockHeight } =
    typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const shown = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  // A size out of its bounds is brought within them: the bounds may have changed since.
  const sized = (value: unknown, size: PaneSize) => (typeof value === "number" && Number.isFinite(value) ? clampSize(value, size) : size.initial);
  return {
    density: DENSITIES.includes(density as Density) ? (density as Density) : DEFAULT_PREFS.density,
    sidebar: shown(sidebar, DEFAULT_PREFS.sidebar),
    aside: shown(aside, DEFAULT_PREFS.aside),
    asideWidth: sized(asideWidth, ASIDE_WIDTH),
    dock: shown(dock, DEFAULT_PREFS.dock),
    dockHeight: sized(dockHeight, DOCK_HEIGHT),
  };
}

/** Notes the Studio's layout on this device. */
export function rememberPrefs(prefs: StudioPrefs, storage: () => Storage = () => globalThis.localStorage): void {
  try {
    storage().setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Without storage the layout starts from the defaults on the next visit; nothing else depends on it.
  }
}

/** How many of the palette's entries the device remembers as used last. */
export const RECENT_LIMIT = 8;

const RECENT_KEY = "solid-memo:studioRecent.v1";

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
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string").slice(0, RECENT_LIMIT) : [];
}

/** Notes an entry of the palette as the one used last. */
export function rememberCommand(id: string, storage: () => Storage = () => globalThis.localStorage): void {
  const recent = [id, ...recentCommands(storage).filter((each) => each !== id)].slice(0, RECENT_LIMIT);
  try {
    storage().setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Without storage the palette lists no entry as used last; nothing else depends on it.
  }
}
