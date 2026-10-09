import {
  DEFAULT_DECK_TABLE_VIEW,
  deckTableViewFromParams,
  deckTableViewToParams,
  type DeckTableView,
} from "@solid-memo/domain/deckTable";
import { hashParams, useHashRouter } from "@solid-memo/ui/routerCore";

/**
 * A Studio view, as its URL hash carries it (docs/studio.md): only
 * identifiers (instance URLs) and how a screen is looked at (Home's
 * filter and sort), so it round-trips through the hash. Solid Memo's
 * own routes are another set (packages/ui/src/ui/router.ts); both keep
 * the hash with the same core (routerCore.ts).
 */
export type StudioRoute =
  /** The user's instances, to pick the one to manage. */
  | { screen: "instances" }
  /** Home: every deck of the instance, filtered and sorted as `view` says (all, as arranged, when absent). */
  | { screen: "home"; instanceUrl: string; view?: DeckTableView }
  /** The instance's deck groups, to arrange. */
  | { screen: "groups"; instanceUrl: string };

export function studioRouteToHash(route: StudioRoute): string {
  switch (route.screen) {
    case "instances":
      return "#/instances";
    case "home":
      return `#/${hashParams({ instance: route.instanceUrl, ...deckTableViewToParams(route.view ?? DEFAULT_DECK_TABLE_VIEW) })}`;
    case "groups":
      return `#/groups${hashParams({ instance: route.instanceUrl })}`;
  }
}

/**
 * Parse a location hash; null for anything that isn't a route, `#/`
 * without an instance among them: the default route, which depends on
 * how many instances the user has. Home's view is left out when it is
 * the default one.
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
    default:
      return null;
  }
}

/** The URL hash as the Studio's route state. */
export function useStudioRoute(): ReturnType<typeof useHashRouter<StudioRoute>> {
  return useHashRouter(parseStudioHash, studioRouteToHash);
}
