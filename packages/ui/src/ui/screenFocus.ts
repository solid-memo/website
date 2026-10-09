import { useLayoutEffect, useRef } from "preact/hooks";
import type { RouteChange, RouteRef } from "./router";

/**
 * Focus for a new screen. After the user moves to another screen
 * (`navigate`, Back/Forward, a link) the control they used is often gone,
 * which would drop focus to the page's top; instead the new screen's
 * heading takes it, so a screen reader announces where the user is and
 * Tab goes on from there. A navigation also starts the screen at the top;
 * Back/Forward leaves the scroll to the browser. Redirects (`replace`)
 * and the first render move nothing.
 *
 * The heading may come long after the route (screens load their data
 * first), so focus waits for it: the returned ref goes on the element
 * holding the screen, and the first h2 to appear in it is focused. A
 * screen without one, once it shows something that is not loading, is focused itself.
 * A screen opened at one of its parts (a link to a section) marks that
 * part's heading `data-arrival`, and that heading is focused instead.
 */
export function useScreenFocus(route: RouteRef | null, change: RouteChange) {
  const screenRef = useRef<HTMLDivElement>(null);
  const pending = useRef(false);

  useLayoutEffect(() => {
    if (change === "push") window.scrollTo(0, 0);
    if (change === "push" || change === "pop") pending.current = true;
  }, [route]);

  // Every render: the screen's element itself may only now have appeared.
  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!pending.current || screen === null) return;
    const arrive = () => {
      const target =
        screen.querySelector<HTMLElement>("[data-arrival]") ??
        screen.querySelector<HTMLElement>("h2") ??
        (screen.firstElementChild !== null && screen.querySelector(".loading") === null
          ? screen
          : null);
      if (target === null) return false;
      // Focusable from script only: not a Tab stop of its own.
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus();
      pending.current = false;
      return true;
    };
    if (arrive()) return;
    const observer = new MutationObserver(() => {
      if (arrive()) observer.disconnect();
    });
    observer.observe(screen, { childList: true, subtree: true });
    return () => observer.disconnect();
  });

  return screenRef;
}
