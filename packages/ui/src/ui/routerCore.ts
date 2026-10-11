import { useEffect, useLayoutEffect, useState } from "preact/hooks";

/**
 * What every app's hash router shares (docs/routing.md): each app has
 * its own routes, a serializable union, and the pair of functions that
 * turn one into a hash and a hash back into one (null for anything that
 * is not a route). This keeps the URL hash in step with the route.
 */

/**
 * How the route last changed: "initial" on load, "push" by `navigate`,
 * "replace" by `replace`, "pop" from the browser (Back/Forward, a link,
 * a hand-edited hash). Push and pop are the user's own moves; the screen
 * takes focus after those only (useScreenFocus).
 */
export type RouteChange = "initial" | "push" | "replace" | "pop";

/** A route's query string, its values URL-encoded: `?instance=…&deck=…`. */
export function hashParams(pairs: Record<string, string>): string {
  return `?${new URLSearchParams(pairs).toString()}`;
}

/** A page number beyond the first, or null for anything else. */
export function parsePage(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const page = Number(value);
  return page > 1 ? page : null;
}

/**
 * Where the entry shown is in the tab's history, as the routers number
 * the entries they see (`position` in each entry's state): one more for
 * each entry after it. An entry the app makes (`navigate`) is numbered as
 * it is made, and one the browser makes (a link followed, a hash typed
 * in) once the router hears of it; `replace` keeps its entry's number.
 * The page's, so that a guard heard of a move first (useUnsavedEdits in
 * the Studio) can tell how far Back or Forward went, and undo it.
 */
let shown = 0;

/** The number of the entry shown, as the router last heard of it: of the entry left, while a hashchange is heard. */
export function shownPosition(): number {
  return shown;
}

/** The number of the entry the browser is at, if a router has numbered it. */
export function historyPosition(): number | null {
  const state: unknown = window.history.state;
  const position =
    typeof state === "object" && state !== null
      ? (state as { position?: unknown }).position
      : undefined;
  return typeof position === "number" ? position : null;
}

/** Notes the entry the browser is at as shown, numbered after the one shown before if it is not yet. */
function arrived(): void {
  const position = historyPosition();
  if (position !== null) shown = position;
  else number(shown + 1);
}

/** Numbers the entry the browser is at, as the one shown. */
function number(position: number): void {
  shown = position;
  window.history.replaceState({ position }, "");
}

/**
 * The URL hash as route state. `navigate` pushes a history entry (so
 * Back walks the app's screens); `replace` swaps the current entry
 * (redirects and defaults, which should not be Back stops).
 * External changes — Back/Forward, a hand-edited hash — arrive via the
 * hashchange event.
 */
export function useHashRouter<Route>(
  parseHash: (hash: string) => Route | null,
  routeToHash: (route: Route) => string,
): {
  route: Route | null;
  change: RouteChange;
  navigate: (route: Route) => void;
  replace: (route: Route) => void;
} {
  // One state, so a route and how it came about never disagree.
  const [state, setState] = useState<{ route: Route | null; change: RouteChange }>(() => ({
    route: parseHash(window.location.hash),
    change: "initial",
  }));

  // Before any listener of the page's, which may ask where the entry is (shownPosition).
  useLayoutEffect(() => {
    const position = historyPosition();
    if (position === null) number(shown);
    else shown = position;
  }, []);

  useEffect(() => {
    const same = (a: Route | null, b: Route | null) =>
      a === null || b === null ? a === b : routeToHash(a) === routeToHash(b);
    // A hashchange to the route already shown is the app's own push or
    // replace echoed back (as some DOMs do), not a move of the user's.
    const onHashChange = () => {
      arrived();
      const route = parseHash(window.location.hash);
      setState((current) => (same(route, current.route) ? current : { route, change: "pop" }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(route: Route) {
    shown += 1;
    window.history.pushState({ position: shown }, "", routeToHash(route));
    setState({ route, change: "push" });
  }

  function replace(route: Route) {
    window.history.replaceState({ position: shown }, "", routeToHash(route));
    setState({ route, change: "replace" });
  }

  return { route: state.route, change: state.change, navigate, replace };
}
