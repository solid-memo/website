import type { RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { EASE, reducedMotion } from "../motion";

/** How long a row takes to slide to its new place. */
export const FLIP_MS = 220;

/**
 * How long a slide or a row's coming in is waited for, should its end
 * never be heard; and how long rows are held where they were, should
 * the edit never show.
 */
export const FLIP_FALLBACK_MS = 300;

/** Where each row was (data-row-key) as an edit was made, before the list showed it. */
interface Snapshot {
  rects: Map<string, DOMRect>;
  /** What the edit was made to: till that changes, the edit has not come. */
  from: unknown;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Rows that slide from where they were to where an edit puts them (the
 * FLIP technique: first, last, invert, play), in the list `containerRef`
 * holds, `edited` being what edits are made to (not what a drag holds
 * the list at, which a drop lets go of before the edit shows).
 * `capture` notes where each row is just before an edit is made,
 * `source` standing in for the row a drop moves, so that it settles from
 * where the pointer let it go. Until `edited` is something else (the
 * edit comes after a render or two, through the container) the rows are
 * held where they were;
 * then each slides to its new place, and a row new to the list (a new
 * group's header, say) comes in with `.row-enter` (style.css).
 *
 * Under reduced motion nothing is captured: rows go to their places at
 * once, and nothing waits for a transition to end.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, edited: unknown) {
  const snapshot = useRef<Snapshot | null>(null);
  /** The ends of slides and entries still under way, run as the list goes. */
  const settling = useRef(new Set<() => void>());

  function rows() {
    return [...containerRef.current!.querySelectorAll<HTMLElement>("[data-row-key]")];
  }

  /**
   * Each row on screen, and how far it is from where it was (null for one
   * that was not there). Whatever offset it is held at, or slide it is
   * in, is taken off first, so that it is measured where it now belongs.
   */
  function offsets(rects: Map<string, DOMRect>) {
    const all = rows();
    for (const element of all) {
      element.style.transition = "";
      element.style.transform = "";
    }
    return all.flatMap<{ element: HTMLElement; offset: { x: number; y: number } | null }>((element) => {
      const now = element.getBoundingClientRect();
      // Not on screen (in a group folded shut, say): nowhere to slide to.
      if (now.height === 0) return [];
      const before = rects.get(element.dataset.rowKey!);
      if (before === undefined || before.height === 0) return [{ element, offset: null }];
      return [{ element, offset: { x: before.left - now.left, y: before.top - now.top } }];
    });
  }

  function capture(source?: { key: string; rect: DOMRect }) {
    // Gone from the page (an edit it left to make, see DeckListScreen's delete): nothing to move.
    if (reducedMotion() || containerRef.current === null) return;
    const rects = new Map(rows().map((element) => [element.dataset.rowKey!, element.getBoundingClientRect()]));
    if (source !== undefined) rects.set(source.key, source.rect);
    clearTimeout(snapshot.current?.timer);
    const next: Snapshot = { rects, from: edited, timer: setTimeout(() => play(next), FLIP_FALLBACK_MS) };
    snapshot.current = next;
  }

  /** The rows kept where they were, while the edit is on its way. */
  function hold({ rects }: Snapshot) {
    for (const { element, offset } of offsets(rects)) {
      if (offset === null || (offset.x === 0 && offset.y === 0)) continue;
      element.style.transition = "none";
      element.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    }
  }

  function play(pending: Snapshot) {
    snapshot.current = null;
    clearTimeout(pending.timer);
    const moving: HTMLElement[] = [];
    for (const { element, offset } of offsets(pending.rects)) {
      if (offset === null) {
        element.classList.add("row-enter");
        until(element, "animationend", () => element.classList.remove("row-enter"));
      } else if (offset.x !== 0 || offset.y !== 0) {
        element.style.transition = "none";
        element.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
        moving.push(element);
      }
    }
    // Settled where they were before they are let go: a slide, not a jump.
    containerRef.current!.getBoundingClientRect();
    for (const element of moving) {
      element.style.transition = `transform ${FLIP_MS}ms ${EASE}`;
      element.style.transform = "";
      until(element, "transitionend", () => {
        element.style.transition = "";
      });
    }
  }

  /** Runs `end` once the element's own `type` event comes, or the fallback's time is up. */
  function until(element: HTMLElement, type: "animationend" | "transitionend", end: () => void) {
    const onEvent = (event: Event) => {
      // A control in the row ending a movement of its own.
      if (event.target === element) settle();
    };
    const timer = setTimeout(settle, FLIP_FALLBACK_MS);
    function settle() {
      settling.current.delete(settle);
      element.removeEventListener(type, onEvent);
      clearTimeout(timer);
      end();
    }
    element.addEventListener(type, onEvent);
    settling.current.add(settle);
  }

  useLayoutEffect(() => {
    const pending = snapshot.current;
    if (pending === null) return;
    if (pending.from === edited) hold(pending);
    else play(pending);
  });

  useLayoutEffect(
    () => () => {
      clearTimeout(snapshot.current?.timer);
      for (const settle of [...settling.current]) settle();
    },
    [],
  );

  return { capture };
}
