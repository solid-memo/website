/** How tightly the Studio's rows and controls are packed: compact (about 28px), or comfortable (44px, for touch). */
export type Density = "compact" | "comfortable";

export const DENSITIES: readonly Density[] = ["compact", "comfortable"];

/** How the Studio is laid out on this device: its density, and whether the sidebar is shown on a wide screen. */
export interface StudioPrefs {
  density: Density;
  sidebar: boolean;
}

export const DEFAULT_PREFS: StudioPrefs = { density: "compact", sidebar: true };

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
  const { density, sidebar } = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    density: DENSITIES.includes(density as Density) ? (density as Density) : DEFAULT_PREFS.density,
    sidebar: typeof sidebar === "boolean" ? sidebar : DEFAULT_PREFS.sidebar,
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
