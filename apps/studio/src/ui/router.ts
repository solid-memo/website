import {
  DEFAULT_DECK_TABLE_VIEW,
  deckTableViewFromParams,
  deckTableViewToParams,
  type DeckTableView,
} from "@solid-memo/domain/deckTable";
import { isDefaultQuery, queryFromParams, queryToParams, type CardQuery } from "@solid-memo/domain/cardQuery";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import { hashParams, useHashRouter } from "@solid-memo/ui/routerCore";

/**
 * A Studio view, as its URL hash carries it (docs/studio.md): only
 * identifiers (instance, deck and card URLs) and how a screen is looked
 * at (Home's filter and sort, the card workbench's query, the card
 * inspector's tab), so it round-trips through the hash. Solid Memo's
 * own routes are another set (packages/ui/src/ui/router.ts); both keep
 * the hash with the same core (routerCore.ts).
 */
export type StudioRoute =
  /** The user's instances, to pick the one to manage. */
  | { screen: "instances" }
  /** Home: every deck of the instance, filtered and sorted as `view` says (all, as arranged, when absent). */
  | { screen: "home"; instanceUrl: string; view?: DeckTableView }
  /** The instance's deck groups, to arrange. */
  | { screen: "groups"; instanceUrl: string }
  /** The card workbench: a deck's cards, searched, filtered, sorted and paged as `query` says (all, as listed, when absent). */
  | { screen: "cards"; deckUrl: string; query?: CardQuery }
  /** The card inspector: one card of a deck, its content, its wrong options or its schedule (`tab`; the content when absent). */
  | { screen: "card"; deckUrl: string; cardUrl: string; tab?: CardTab }
  /** What a deck says of itself, how it is studied and, for a course, the learner's progress through it. */
  | { screen: "about"; deckUrl: string }
  /** The instance's name and its catalogue's description and licence. */
  | { screen: "instance"; instanceUrl: string };

/** What the card inspector shows: the card's content, its wrong options, or its review state in each direction. */
export type CardTab = "content" | "distractors" | "schedule";

/** The inspector's tabs, in their order. */
export const CARD_TABS: readonly CardTab[] = ["content", "distractors", "schedule"];

/** The instance a route is in: the one it names, or the one of the deck it names; null for the picker. */
export function instanceOfRoute(route: StudioRoute): string | null {
  switch (route.screen) {
    case "instances":
      return null;
    case "cards":
    case "card":
    case "about":
      return instanceUrlOfDeck(route.deckUrl);
    default:
      return route.instanceUrl;
  }
}

export function studioRouteToHash(route: StudioRoute): string {
  switch (route.screen) {
    case "instances":
      return "#/instances";
    case "home":
      return `#/${hashParams({ instance: route.instanceUrl, ...deckTableViewToParams(route.view ?? DEFAULT_DECK_TABLE_VIEW) })}`;
    case "groups":
      return `#/groups${hashParams({ instance: route.instanceUrl })}`;
    case "cards":
      return `#/cards${hashParams({ deck: route.deckUrl, ...(route.query === undefined ? {} : queryToParams(route.query)) })}`;
    case "card":
      return `#/card${hashParams({ deck: route.deckUrl, card: route.cardUrl, ...(route.tab === undefined || route.tab === "content" ? {} : { tab: route.tab }) })}`;
    case "about":
      return `#/about${hashParams({ deck: route.deckUrl })}`;
    case "instance":
      return `#/instance${hashParams({ instance: route.instanceUrl })}`;
  }
}

/**
 * Parse a location hash; null for anything that isn't a route, `#/`
 * without an instance among them: the default route, which depends on
 * how many instances the user has. Home's view, and the workbench's
 * query, are left out when they are the default ones.
 */
export function parseStudioHash(hash: string): StudioRoute | null {
  const [path, search] = hash.replace(/^#/, "").split("?");
  const query = new URLSearchParams(search);
  const instanceUrl = query.get("instance");
  switch (path) {
    case "/instances":
      return { screen: "instances" };
    case "/": {
      if (instanceUrl === null) return null;
      const view = deckTableViewFromParams(query);
      return view.filter === "" && view.sort === undefined
        ? { screen: "home", instanceUrl }
        : { screen: "home", instanceUrl, view };
    }
    case "/groups":
      return instanceUrl === null ? null : { screen: "groups", instanceUrl };
    case "/instance":
      return instanceUrl === null ? null : { screen: "instance", instanceUrl };
    case "/about": {
      const deckUrl = query.get("deck");
      return deckUrl === null ? null : { screen: "about", deckUrl };
    }
    case "/cards": {
      const deckUrl = query.get("deck");
      if (deckUrl === null) return null;
      const cardQuery = queryFromParams(query);
      return isDefaultQuery(cardQuery) ? { screen: "cards", deckUrl } : { screen: "cards", deckUrl, query: cardQuery };
    }
    case "/card": {
      const deckUrl = query.get("deck");
      const cardUrl = query.get("card");
      if (deckUrl === null || cardUrl === null) return null;
      const tab = CARD_TABS.find((known) => known !== "content" && known === query.get("tab"));
      return tab === undefined ? { screen: "card", deckUrl, cardUrl } : { screen: "card", deckUrl, cardUrl, tab };
    }
    default:
      return null;
  }
}

/** The URL hash as the Studio's route state. */
export function useStudioRoute(): ReturnType<typeof useHashRouter<StudioRoute>> {
  return useHashRouter(parseStudioHash, studioRouteToHash);
}
