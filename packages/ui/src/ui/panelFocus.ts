import { useLayoutEffect, useRef } from "preact/hooks";

/**
 * Focus for a panel shown in place: a confirmation, the next stage of a
 * flow, an operation's progress or how it ended. Such a panel usually
 * takes the place of the button that opened it, which would drop focus
 * to the page's top; instead, the panel (the element the returned ref
 * goes on, with tabIndex -1 unless it is a control) takes focus when it
 * mounts, unless `focus` is false — a panel already there when the
 * screen loads must not steal it.
 *
 * When the panel goes away holding focus (or after focus was already
 * lost, a busy button in it disabled), focus goes back to what the
 * panel took it from, if that is still on the page, else to the
 * screen's heading. A panel that comes back in its place (the step
 * before, on Cancel) takes it from there.
 */
export function usePanelFocus<T extends HTMLElement>(focus = true) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const panel = ref.current!;
    // What the panel took focus from; one that took none returns it to the screen.
    const before = (focus ? document.activeElement : document.body) as HTMLElement;
    if (focus) panel.focus();
    // Layout cleanups run while the panel is still on the page (Preact 11 runs the others a frame late).
    return () => {
      const active = document.activeElement;
      if (active !== document.body && !panel.contains(active)) return;
      if (before !== document.body && before.isConnected && !panel.contains(before)) {
        before.focus();
      } else {
        focusScreen();
      }
    };
  }, []);
  return ref;
}

/**
 * Focus the screen's heading, or failing that the page's main content:
 * where a keyboard picks up when what it was on is gone and nothing
 * nearer stands in for it.
 */
export function focusScreen() {
  const target = document.querySelector<HTMLElement>(".screen h2") ?? document.querySelector<HTMLElement>("main");
  if (target === null) return;
  // Focusable from script only: not a Tab stop of its own.
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus();
}
