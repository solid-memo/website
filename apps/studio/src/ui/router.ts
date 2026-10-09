import { hashParams, useHashRouter } from "@solid-memo/ui/routerCore";

/**
 * A Studio view, as its URL hash carries it (docs/studio.md): only
 * identifiers (instance URLs), so it round-trips through the hash.
 * Solid Memo's own routes are another set (packages/ui/src/ui/router.ts);
 * both keep the hash with the same core (routerCore.ts).
 */
export type StudioRoute =
  /** The user's instances, to pick the one to manage. */
  | { screen: "instances" }
  /** Home: every deck of the instance. */
  | { screen: "home"; instanceUrl: string };

export function studioRouteToHash(route: StudioRoute): string {
  switch (route.screen) {
    case "instances":
      return "#/instances";
    case "home":
      return `#/${hashParams({ instance: route.instanceUrl })}`;
  }
}

/**
 * Parse a location hash; null for anything that isn't a route, `#/`
 * without an instance among them: the default route, which depends on
 * how many instances the user has.
 */
export function parseStudioHash(hash: string): StudioRoute | null {
  const [path, search] = hash.replace(/^#/, "").split("?");
  const instanceUrl = new URLSearchParams(search).get("instance");
  switch (path) {
    case "/instances":
      return { screen: "instances" };
    case "/":
      return instanceUrl === null ? null : { screen: "home", instanceUrl };
    default:
      return null;
  }
}

/** The URL hash as the Studio's route state. */
export function useStudioRoute(): ReturnType<typeof useHashRouter<StudioRoute>> {
  return useHashRouter(parseStudioHash, studioRouteToHash);
}
