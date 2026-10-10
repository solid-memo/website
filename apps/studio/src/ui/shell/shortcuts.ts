import type { StudioRoute } from "../router";

/**
 * Where a shortcut works: anywhere in the Studio, or on one screen,
 * whose own handler (useScreenKeys) takes the key before the Studio's.
 */
export type ShortcutScope = "studio" | "cards";

/** A section of the Studio that a `g` chord goes to. */
export type Section = "decks" | "groups" | "drafts" | "releases" | "health" | "library" | "transfer" | "instances";

export type ShortcutId =
  | "palette"
  | "help"
  | "filter"
  | "nextRegion"
  | "previousRegion"
  | `go.${Section}`
  | "toggleSidebar"
  | "toggleAside"
  | "toggleDock"
  | "nextProblem"
  | "previousProblem"
  | "previousTab"
  | "nextTab"
  | `tab.${number}`
  | "down"
  | "up"
  | "select"
  | "open"
  | "extendDown"
  | "extendUp"
  | "clear"
  | "bulk"
  | "edit";

/**
 * A shortcut: its keys as `keyOf` names them, a chord's one after the
 * other with a space between ("g d"). Those that `whileTyping` work
 * from a field the user types in too; the others leave it its keys. The
 * key help shows its keys as `help` says when it says (one entry for
 * several shortcuts), and leaves it out when that is null.
 */
export interface Shortcut {
  id: ShortcutId;
  keys: string;
  scope: ShortcutScope;
  whileTyping?: true;
  help?: string | null;
}

const GO_KEYS: Record<Section, string> = {
  decks: "d",
  groups: "g",
  drafts: "r",
  releases: "p",
  health: "h",
  library: "l",
  transfer: "t",
  instances: "i",
};

/** Every shortcut of the Studio, in the order the key help lists them. */
export const SHORTCUTS: readonly Shortcut[] = [
  // Ctrl+K, or Cmd+K on a Mac: the key help lists the two as one.
  { id: "palette", keys: "Ctrl+k", scope: "studio", whileTyping: true, help: "Ctrl+K" },
  { id: "palette", keys: "Meta+k", scope: "studio", whileTyping: true, help: null },
  { id: "help", keys: "?", scope: "studio" },
  { id: "filter", keys: "/", scope: "studio" },
  { id: "nextRegion", keys: "F6", scope: "studio", whileTyping: true },
  { id: "previousRegion", keys: "Shift+F6", scope: "studio", whileTyping: true },
  ...Object.entries(GO_KEYS).map(([section, key]): Shortcut => ({ id: `go.${section as Section}`, keys: `g ${key}`, scope: "studio" })),
  { id: "toggleSidebar", keys: "Ctrl+b", scope: "studio" },
  { id: "toggleAside", keys: "Ctrl+\\", scope: "studio" },
  { id: "toggleDock", keys: "Ctrl+j", scope: "studio" },
  { id: "nextProblem", keys: "F8", scope: "studio", whileTyping: true },
  { id: "previousProblem", keys: "Shift+F8", scope: "studio", whileTyping: true },
  { id: "previousTab", keys: "[", scope: "studio" },
  { id: "nextTab", keys: "]", scope: "studio" },
  // The key help lists the nine as one.
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): Shortcut => ({ id: `tab.${n}`, keys: String(n), scope: "studio", help: n === 1 ? "1–9" : null })),
  { id: "down", keys: "j", scope: "cards" },
  { id: "up", keys: "k", scope: "cards" },
  { id: "select", keys: "x", scope: "cards" },
  { id: "open", keys: "Enter", scope: "cards" },
  // Shift is in the character: Shift+J types "J".
  { id: "extendDown", keys: "J", scope: "cards", help: "Shift+J" },
  { id: "extendUp", keys: "K", scope: "cards", help: "Shift+K" },
  { id: "clear", keys: "Escape", scope: "cards" },
  { id: "bulk", keys: ".", scope: "cards" },
  { id: "edit", keys: "F2", scope: "cards" },
];

/** A shortcut's keys, as the keymap names them (its first, for one with several). */
export function keysOf(id: ShortcutId): string {
  return SHORTCUTS.find((shortcut) => shortcut.id === id)!.keys;
}

/** How long the second key of a chord may wait for, in milliseconds. */
export const CHORD_TIMEOUT = 1500;

/**
 * A key as the keymap names it: the character it types, or its name
 * ("Enter", "F6"), after the modifiers held ("Ctrl+k"). Shift is named
 * only before a key that types nothing: it is already in the
 * character ("?", "J").
 */
export function keyOf(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string {
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.metaKey && "Meta",
    event.altKey && "Alt",
    event.shiftKey && event.key.length > 1 && "Shift",
  ].filter(Boolean);
  return [...modifiers, event.key].join("+");
}

/** The shortcut of one scope a single key is, if any. */
export function shortcutOf(key: string, scope: ShortcutScope): ShortcutId | null {
  return SHORTCUTS.find((shortcut) => shortcut.scope === scope && shortcut.keys === key)?.id ?? null;
}

/** The first keys of a chord pressed so far, and when the last was. */
export interface Chord {
  keys: string;
  at: number;
}

/**
 * A key pressed anywhere in the Studio, after the chord pressed before
 * it (null: none): the shortcut it completes, or the chord it begins or
 * goes on with. A chord left longer than CHORD_TIMEOUT, or followed by a
 * key that ends none, is dropped, and the key counts on its own.
 */
export function pressKey(
  chord: Chord | null,
  key: string,
  now: number,
  shortcuts: readonly Shortcut[],
): { chord: Chord | null; shortcut: ShortcutId | null } {
  const keys = chord !== null && now - chord.at <= CHORD_TIMEOUT ? [`${chord.keys} ${key}`, key] : [key];
  for (const pressed of keys) {
    const exact = shortcuts.find((shortcut) => shortcut.keys === pressed);
    if (exact !== undefined) return { chord: null, shortcut: exact.id };
    if (shortcuts.some((shortcut) => shortcut.keys.startsWith(`${pressed} `))) return { chord: { keys: pressed, at: now }, shortcut: null };
  }
  return { chord: null, shortcut: null };
}

/** Where a `g` chord goes: a section of the open instance (none without one), or the instances. */
export function sectionRoute(section: Section, instanceUrl: string | null): StudioRoute | null {
  if (section === "instances") return { screen: "instances" };
  if (instanceUrl === null) return null;
  return section === "decks" ? { screen: "home", instanceUrl } : { screen: section, instanceUrl };
}

/** The inputs that are pressed or ticked, not typed in: their keys are the Studio's. */
const CHOSEN_INPUTS: ReadonlySet<string> = new Set(["checkbox", "radio", "button", "submit", "reset"]);

/** Whether a key goes to a field the user types or chooses in (a search, a filter, a text), which keeps it. */
export function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !CHOSEN_INPUTS.has(target.type);
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/**
 * The region F6 (step 1) or Shift+F6 (step -1) moves to, of the page's
 * regions in order, from the one that holds the focus: from none, the
 * first, or the last.
 */
export function nextRegion<R extends { contains(other: Node | null): boolean }>(
  regions: readonly R[],
  focused: Node | null,
  step: 1 | -1,
): R | undefined {
  const at = regions.findIndex((region) => region.contains(focused));
  const from = at === -1 ? (step === 1 ? -1 : 0) : at;
  return regions[(from + step + regions.length) % regions.length];
}
