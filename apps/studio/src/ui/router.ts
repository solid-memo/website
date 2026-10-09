import {
  DEFAULT_DECK_TABLE_VIEW,
  deckTableViewFromParams,
  deckTableViewToParams,
  type DeckTableView,
} from "@solid-memo/domain/deckTable";
import { isDefaultQuery, queryFromParams, queryToParams, type CardQuery } from "@solid-memo/domain/cardQuery";
import type { CardSpot } from "@solid-memo/domain/deckHealth";
import { instanceUrlOfDeck } from "@solid-memo/domain/instanceLayout";
import { STUDIO_PATH } from "@solid-memo/ui/router";
import { hashParams, useHashRouter } from "@solid-memo/ui/routerCore";

/**
 * A Studio view, as its URL hash carries it (docs/studio.md): only
 * identifiers (instance, deck and card URLs) and how a screen is looked
 * at (Home's filter and sort, the card workbench's query, the card
 * inspector's tab), so it round-trips through the hash. The Studio
 * shares the site's one page with Solid Memo, so its hashes all start
 * with `#/studio` (STUDIO_PATH); Solid Memo's own routes are the others
 * (packages/ui/src/ui/router.ts). Both keep the hash with the same core
 * (routerCore.ts).
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
  /**
   * The card inspector: one card of a deck, its content, its wrong
   * options, its schedule or its history (`tab`; the content when
   * absent), opened at one of its fields when `field` says (a text of
   * its content, or a wrong option by its id).
   */
  | { screen: "card"; deckUrl: string; cardUrl: string; tab?: CardTab; field?: string }
  /** A deck's schedule: the reviews to come, how its intervals and eases are spread, its lapses and leeches. */
  | { screen: "schedule"; deckUrl: string }
  /** What a deck says of itself, how it is studied and, for a course, the learner's progress through it. */
  | { screen: "about"; deckUrl: string }
  /** The instance's name and its catalogue's description and licence. */
  | { screen: "instance"; instanceUrl: string }
  /** Everything wrong with the instance or, with `deckUrl`, one of its decks. */
  | { screen: "health"; instanceUrl: string; deckUrl?: string }
  /** The instance's copies of library releases: their versions, the newer releases and what upgrading would change. */
  | { screen: "library"; instanceUrl: string }
  /** Decks to and from files: the instance's decks to export (those of `deckUrls` chosen, none when absent), and a file to import. */
  | { screen: "transfer"; instanceUrl: string; deckUrls?: readonly string[] };

/** What the card inspector shows: the card's content, its wrong options, its review state in each direction, or its answers. */
export type CardTab = "content" | "distractors" | "schedule" | "history";

/** The inspector's tabs, in their order. */
export const CARD_TABS: readonly CardTab[] = ["content", "distractors", "schedule", "history"];

/** The card inspector, opened at where in a card a problem is (`spot`, domain/deckHealth.ts): its tab, and the field there. */
export function spotRoute(deckUrl: string, { card, place }: CardSpot): StudioRoute {
  const field = place.tab === "content" ? place.part : place.tab === "distractors" ? place.distractor : undefined;
  return { screen: "card", deckUrl, cardUrl: card.url, tab: place.tab, ...(field === undefined ? {} : { field }) };
}

/** The instance a route is in: the one it names, or the one of the deck it names; null for the picker. */
export function instanceOfRoute(route: StudioRoute): string | null {
  switch (route.screen) {
    case "instances":
      return null;
    case "cards":
    case "card":
    case "about":
    case "schedule":
      return instanceUrlOfDeck(route.deckUrl);
    default:
      return route.instanceUrl;
  }
}

export function studioRouteToHash(route: StudioRoute): string {
  switch (route.screen) {
    case "instances":
      return `#${STUDIO_PATH}/instances`;
    case "home":
      return `#${STUDIO_PATH}${hashParams({ instance: route.instanceUrl, ...deckTableViewToParams(route.view ?? DEFAULT_DECK_TABLE_VIEW) })}`;
    case "groups":
      return `#${STUDIO_PATH}/groups${hashParams({ instance: route.instanceUrl })}`;
    case "cards":
      return `#${STUDIO_PATH}/cards${hashParams({ deck: route.deckUrl, ...(route.query === undefined ? {} : queryToParams(route.query)) })}`;
    case "card":
      return `#${STUDIO_PATH}/card${hashParams({
        deck: route.deckUrl,
        card: route.cardUrl,
        ...(route.tab === undefined || route.tab === "content" ? {} : { tab: route.tab }),
        ...(route.field === undefined ? {} : { field: route.field }),
      })}`;
    case "about":
      return `#${STUDIO_PATH}/about${hashParams({ deck: route.deckUrl })}`;
    case "schedule":
      return `#${STUDIO_PATH}/schedule${hashParams({ deck: route.deckUrl })}`;
    case "instance":
      return `#${STUDIO_PATH}/instance${hashParams({ instance: route.instanceUrl })}`;
    case "health":
      return `#${STUDIO_PATH}/health${hashParams({ instance: route.instanceUrl, ...(route.deckUrl === undefined ? {} : { deck: route.deckUrl }) })}`;
    case "library":
      return `#${STUDIO_PATH}/library${hashParams({ instance: route.instanceUrl })}`;
    case "transfer":
      // A `deck` each: hashParams takes one value a name.
      return `#${STUDIO_PATH}/transfer?${new URLSearchParams([
        ["instance", route.instanceUrl],
        ...(route.deckUrls ?? []).map((url) => ["deck", url]),
      ]).toString()}`;
  }
}

/**
 * Parse a location hash; null for anything that isn't a route, `#/studio`
 * without an instance among them: the default route, which depends on
 * how many instances the user has. Home is `#/studio`, or `#/studio/` as
 * the redirect from the Studio's old address makes it (docs/studio.md).
 * Home's view, and the workbench's query, are left out when they are the
 * default ones.
 */
export function parseStudioHash(hash: string): StudioRoute | null {
  const [path, search] = hash.replace(/^#/, "").split("?");
  if (!path!.startsWith(STUDIO_PATH)) return null;
  const query = new URLSearchParams(search);
  const instanceUrl = query.get("instance");
  switch (path!.slice(STUDIO_PATH.length)) {
    case "/instances":
      return { screen: "instances" };
    case "":
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
    case "/library":
      return instanceUrl === null ? null : { screen: "library", instanceUrl };
    case "/transfer": {
      if (instanceUrl === null) return null;
      const deckUrls = query.getAll("deck");
      return deckUrls.length === 0 ? { screen: "transfer", instanceUrl } : { screen: "transfer", instanceUrl, deckUrls };
    }
    case "/health": {
      const deckUrl = query.get("deck");
      if (instanceUrl === null) return null;
      return deckUrl === null ? { screen: "health", instanceUrl } : { screen: "health", instanceUrl, deckUrl };
    }
    case "/about": {
      const deckUrl = query.get("deck");
      return deckUrl === null ? null : { screen: "about", deckUrl };
    }
    case "/schedule": {
      const deckUrl = query.get("deck");
      return deckUrl === null ? null : { screen: "schedule", deckUrl };
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
      const field = query.get("field");
      return {
        screen: "card",
        deckUrl,
        cardUrl,
        ...(tab === undefined ? {} : { tab }),
        ...(field === null ? {} : { field }),
      };
    }
    default:
      return null;
  }
}

/** The URL hash as the Studio's route state. */
export function useStudioRoute(): ReturnType<typeof useHashRouter<StudioRoute>> {
  return useHashRouter(parseStudioHash, studioRouteToHash);
}
