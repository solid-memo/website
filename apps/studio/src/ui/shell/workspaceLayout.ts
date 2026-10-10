import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { isDraftRoute, type DraftRoute, type StudioRoute } from "../router";

/** A section of an instance, as the sidebar lists them. */
export type SidebarSection = "decks" | "groups" | "drafts" | "releases" | "health" | "library" | "transfer" | "instance";

/** The sidebar's sections, in its order. */
export const SIDEBAR_SECTIONS: readonly SidebarSection[] = ["decks", "groups", "drafts", "releases", "health", "library", "transfer", "instance"];

/** Where a section of an instance opens: the decks are Home. */
export function sectionHome(section: SidebarSection, instanceUrl: string): StudioRoute {
  return section === "decks" ? { screen: "home", instanceUrl } : { screen: section, instanceUrl };
}

/**
 * The section a route is in, which the sidebar marks: none on the
 * instances, nor on a deck's or a draft's screens, where the sidebar
 * marks the deck or the draft instead.
 */
export function sectionOf(route: StudioRoute): SidebarSection | null {
  switch (route.screen) {
    case "home":
      return "decks";
    case "groups":
    case "drafts":
    case "releases":
    case "library":
    case "transfer":
    case "instance":
      return route.screen;
    case "health":
      return route.deckUrl === undefined ? "health" : null;
    default:
      return null;
  }
}

/** The deck a route is about: its cards, a card of it, its schedule, its about screen or its health; null for any other. */
export function deckOf(route: StudioRoute): string | null {
  switch (route.screen) {
    case "cards":
    case "card":
    case "schedule":
    case "about":
      return route.deckUrl;
    case "health":
      return route.deckUrl ?? null;
    default:
      return null;
  }
}

/** A deck's tabs, in their order. */
export type DeckTab = "cards" | "schedule" | "health" | "about" | "export";

/** A draft's tabs, in their order. */
export type DraftTab = "overview" | "cards" | "check" | "preview" | "trial" | "diff" | "release";

/** A context tab: which it is, where it goes, and whether the route is on it. */
export interface ContextTab<K extends string = string> {
  key: K;
  route: StudioRoute;
  current: boolean;
}

/** The tabs of the deck or the draft a route is about, and which of the two they are. */
export type ContextTabs = { of: "deck"; tabs: ContextTab<DeckTab>[] } | { of: "draft"; tabs: ContextTab<DraftTab>[] };

/**
 * The tabs of a deck's screens: its cards (a card of it among them), its
 * schedule, its health, its about screen, and its export (import and
 * export, the deck ticked), which is a screen of the instance's, so never
 * the current tab.
 */
export function deckTabs(route: StudioRoute, deckUrl: string): ContextTab<DeckTab>[] {
  const instanceUrl = instanceUrlOfDeck(deckUrl);
  const tab = (key: DeckTab, to: StudioRoute, ...screens: StudioRoute["screen"][]): ContextTab<DeckTab> => ({
    key,
    route: to,
    current: screens.includes(route.screen),
  });
  return [
    tab("cards", { screen: "cards", deckUrl }, "cards", "card"),
    tab("schedule", { screen: "schedule", deckUrl }, "schedule"),
    tab("health", { screen: "health", instanceUrl, deckUrl }, "health"),
    tab("about", { screen: "about", deckUrl }, "about"),
    tab("export", { screen: "transfer", instanceUrl, deckUrls: [deckUrl] }),
  ];
}

/**
 * The tabs of a draft's screens: its overview (a chapter and a step of
 * it among them), its cards (a question among them), its release check,
 * its listing preview, its trial, its changes (only for a draft that
 * follows a release, `hasPrevious`) and its release.
 */
export function draftTabs(route: DraftRoute, hasPrevious: boolean): ContextTab<DraftTab>[] {
  const { draftUrl } = route;
  const tab = (key: DraftTab, to: DraftRoute, ...screens: DraftRoute["screen"][]): ContextTab<DraftTab> => ({
    key,
    route: to,
    current: [to.screen, ...screens].includes(route.screen),
  });
  return [
    tab("overview", { screen: "draft", draftUrl }, "chapter", "step"),
    tab("cards", { screen: "draftCards", draftUrl }, "question"),
    tab("check", { screen: "check", draftUrl }),
    tab("preview", { screen: "preview", draftUrl }),
    tab("trial", { screen: "trial", draftUrl }),
    ...(hasPrevious ? [tab("diff", { screen: "diff", draftUrl })] : []),
    tab("release", { screen: "release", draftUrl }),
  ];
}

/** The context tabs of a route: a deck's on its screens, a draft's (`draft`, as read) on its; null elsewhere. */
export function contextTabsOf(route: StudioRoute, draft: ReleaseDraft | null): ContextTabs | null {
  const deckUrl = deckOf(route);
  if (deckUrl !== null) return { of: "deck", tabs: deckTabs(route, deckUrl) };
  if (isDraftRoute(route)) return { of: "draft", tabs: draftTabs(route, draft!.root.prev !== undefined) };
  return null;
}

/**
 * The tab `]` (step 1) or `[` (step -1) goes to from the current one,
 * round from either end; from none, the first or the last. None of no
 * tabs.
 */
export function stepTab<T extends { current: boolean }>(tabs: readonly T[], step: 1 | -1): T | undefined {
  const at = tabs.findIndex((tab) => tab.current);
  const from = at === -1 ? (step === 1 ? -1 : 0) : at;
  return tabs[(from + step + tabs.length) % tabs.length];
}

/** Below this width the sidebar is a drawer over the page, closed until asked for (studio.css says the same). */
export const NARROW = "(max-width: 48rem)";
