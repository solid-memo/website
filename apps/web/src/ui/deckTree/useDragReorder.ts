import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  COMBINE_DWELL_MS,
  LONG_PRESS_MS,
  dragReducer,
  dropTarget,
  type DragInput,
  type DragState,
  type DropTarget,
  type Point,
} from "./dragMachine";
import { scrollStep, type GapLabel, type MeasuredRow } from "./dropZones";
import type { VisibleRow } from "./rows";

/** How long after a drag a click is taken for the drag's own, and stopped. */
export const CLICK_GUARD_MS = 500;

/** What the list shows of a drag, rendered: the rest moves through refs, without rendering. */
export interface DragFeedback {
  /** "pending" only while a finger or pen holds a row, before it lifts. */
  phase: "idle" | "pending" | "dragging";
  /** The row pressed or lifted. */
  source: string | null;
  /** The row a drop would make a new group with. */
  combine: string | null;
  /** The group whose header a drop would go into. */
  into: string | null;
}

const IDLE_FEEDBACK: DragFeedback = { phase: "idle", source: null, combine: null, into: null };

/** A press, from its pointerdown to the drag's end: what the DOM side keeps of it. */
interface Session {
  /** Adds a listener that the session's end takes away. */
  listen: <E extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: E) => void,
    options?: AddEventListenerOptions,
  ) => void;
  detach: () => void;
  hold: ReturnType<typeof setTimeout> | undefined;
  /** The row a timer is waiting to arm a new group with. */
  dwellFor: string | null;
  dwellTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where in the lifted row it was taken, and how wide the row is, for the copy that follows the pointer. */
  grab: Point;
  width: number;
  scrolling: boolean;
  /** One frame of scrolling near the viewport's edge. */
  scroll: () => void;
}

/** What a press on these starts no drag: they do something of their own (the fold button is a handle). */
const NOT_A_HANDLE = "button:not([data-drag-handle]), input, form, [data-no-drag]";

function rowElements(container: HTMLElement): Map<string, HTMLElement> {
  return new Map(
    [...container.querySelectorAll<HTMLElement>("[data-row-key]")].map((element) => [element.dataset.rowKey!, element]),
  );
}

/**
 * Drag and drop for the deck list's rows (data-row-key), in the list
 * `containerRef` holds: the DOM side of dragMachine.ts. It listens from
 * the press on (on the window, at once, so even a quick tap's end is
 * heard) to the drop, then lets go of everything.
 *
 * While a row is lifted the page does not scroll under the finger (a
 * touchmove is cancelled), it scrolls by itself near the viewport's top
 * and bottom (a frame at a time through `schedule`), a copy of the row
 * (`ghostRef`, which the list renders while dragging) follows the
 * pointer, and a line (`lineRef`, always in the list, hidden between
 * drags) marks where a drop would land, its label from `describe`. A
 * drop calls `onDrop`; Escape, the pointer's cancel or its capture lost,
 * the window losing focus or the page being hidden give the drag up and
 * call `onCancel`. Either way the click a drag ends in does not open the
 * row it ends on. Nothing starts while `enabled` is false.
 *
 * `rows` is read when it is needed, not at each render, so the list can
 * show the rows it measured while the drag lasts.
 */
export function useDragReorder({
  containerRef,
  rows,
  enabled,
  onDrop,
  onCancel,
  describe,
  schedule = (step) => requestAnimationFrame(step),
}: {
  containerRef: RefObject<HTMLElement | null>;
  rows: () => readonly VisibleRow[];
  enabled: boolean;
  onDrop: (source: string, target: DropTarget) => void;
  onCancel: () => void;
  describe: (label: GapLabel) => string;
  schedule?: (step: () => void) => void;
}) {
  const [feedback, setFeedback] = useState<DragFeedback>(IDLE_FEEDBACK);
  const machine = useRef<DragState>({ phase: "idle" });
  const session = useRef<Session | null>(null);
  const guard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  // The listeners outlive a render, so they read these from here.
  const latest = useRef({ rows, onDrop, onCancel, describe });
  latest.current = { rows, onDrop, onCancel, describe };

  function containerTop() {
    return containerRef.current!.getBoundingClientRect().top;
  }

  function dispatch(event: DragInput) {
    const before = machine.current;
    const after = dragReducer(before, event);
    if (after === before) return;
    // The row pressed went from the list while it was held: there is nothing to lift.
    if (before.phase === "pending" && after.phase === "dragging" && !shows(after.source.key)) {
      dispatch({ type: "cancel" });
      return;
    }
    machine.current = after;
    if (after.phase === "idle") {
      finish(before.phase === "dragging");
      return;
    }
    if (before.phase === "pending" && after.phase === "dragging") lift(after);
    if (after.phase === "dragging") follow(after);
    mirror(after);
  }

  function shows(key: string) {
    return latest.current.rows().some((row) => row.key === key);
  }

  /** Renders what changed of the drag, and nothing when nothing did. */
  function mirror(state: DragState) {
    const shown = state.phase === "idle" || (state.phase === "pending" && !state.touch) ? null : state;
    const target = dropTarget(state);
    const next: DragFeedback = {
      phase: shown?.phase ?? "idle",
      source: shown?.source.key ?? null,
      combine: target?.kind === "combine" ? target.target : null,
      into: target?.kind === "into" ? target.group : null,
    };
    setFeedback((current) =>
      current.phase === next.phase &&
      current.source === next.source &&
      current.combine === next.combine &&
      current.into === next.into
        ? current
        : next,
    );
  }

  function lift(state: Extract<DragState, { phase: "dragging" }>) {
    const current = session.current!;
    clearTimeout(current.hold);
    navigator.vibrate?.(10);
    const container = containerRef.current!;
    // The list, which stays while rows come and go under the drag, gets the pointer's events.
    try {
      container.setPointerCapture(state.pointerId);
    } catch {
      // A pointer already gone: its pointerup or pointercancel ends the drag.
    }
    // The list's own capture only: a row's, which a touch has from its press, goes as the list takes it.
    current.listen(container, "lostpointercapture", (lost) => {
      if (lost.target === container) cancel();
    });
    current.listen(window, "scroll", rehit, { capture: true });
    current.listen(window, "resize", measure);
    document.documentElement.classList.add("drag-active");
    const rect = rowElements(container).get(state.source.key)!.getBoundingClientRect();
    current.grab = { x: state.pointer.x - rect.left, y: state.pointer.y - rect.top };
    current.width = rect.width;
  }

  /** Moves the copy, the line and the timers to where the pointer is now. */
  function follow(state: Extract<DragState, { phase: "dragging" }>) {
    const current = session.current!;
    placeGhost(state.pointer);
    const target = dropTarget(state);
    const line = lineRef.current!;
    line.hidden = target?.kind !== "gap";
    if (target?.kind === "gap") {
      line.style.transform = `translateY(${target.y}px)`;
      line.style.setProperty("--line-depth", String(target.depth));
      if (target.label === null) delete line.dataset.label;
      else line.dataset.label = latest.current.describe(target.label);
    }
    const waiting = state.dwell !== null && !state.dwell.armed ? state.dwell.target : null;
    if (waiting !== current.dwellFor) {
      clearTimeout(current.dwellTimer);
      current.dwellFor = waiting;
      if (waiting !== null) {
        current.dwellTimer = setTimeout(() => dispatch({ type: "dwell", target: waiting }), COMBINE_DWELL_MS);
      }
    }
    if (!current.scrolling && scrollStep(state.pointer.y, window.innerHeight) !== 0) {
      current.scrolling = true;
      schedule(current.scroll);
    }
  }

  function placeGhost(pointer: Point) {
    const ghost = ghostRef.current;
    if (ghost === null) return;
    const { grab } = session.current!;
    ghost.style.transform = `translate3d(${pointer.x - grab.x}px, ${pointer.y - grab.y}px, 0)`;
  }

  /** The drop target again, for the pointer where it is, the list having moved under it. */
  function rehit() {
    const state = machine.current as Extract<DragState, { phase: "dragging" }>;
    dispatch({ type: "move", pointerId: state.pointerId, point: state.pointer, y: state.pointer.y - containerTop() });
  }

  /** Where each row is, the lifted one and what it holds set apart as the hole it leaves. */
  function measure() {
    const { source } = machine.current as Extract<DragState, { phase: "dragging" }>;
    const container = containerRef.current!;
    const top = containerTop();
    const elements = rowElements(container);
    const measured: MeasuredRow[] = latest.current.rows().map((row) => {
      const rect = elements.get(row.key)!.getBoundingClientRect();
      return { ...row, top: rect.top - top, bottom: rect.bottom - top };
    });
    const lifted = (row: MeasuredRow) => row.key === source.key || row.ancestors.includes(source.key);
    const hole = measured.filter(lifted);
    dispatch({
      type: "measured",
      layout: {
        rows: measured.filter((row) => !lifted(row)),
        hole: { top: hole[0]!.top, bottom: hole.at(-1)!.bottom },
      },
    });
  }

  function teardown(current: Session) {
    session.current = null;
    current.detach();
    clearTimeout(current.hold);
    clearTimeout(current.dwellTimer);
    document.documentElement.classList.remove("drag-active");
  }

  function finish(dragged: boolean) {
    teardown(session.current!);
    lineRef.current!.hidden = true;
    if (dragged) guard.current = setTimeout(clearGuard, CLICK_GUARD_MS);
    mirror(machine.current);
  }

  function clearGuard() {
    clearTimeout(guard.current ?? undefined);
    guard.current = null;
  }

  function cancel() {
    const dragging = machine.current.phase === "dragging";
    dispatch({ type: "cancel" });
    if (dragging) latest.current.onCancel();
  }

  function drop() {
    const state = machine.current as Exclude<DragState, { phase: "idle" }>;
    const target = dropTarget(state);
    dispatch({ type: "release", pointerId: state.pointerId });
    if (target !== null) latest.current.onDrop(state.source.key, target);
  }

  function start(event: PointerEvent, source: VisibleRow) {
    const id = event.pointerId;
    const removers: (() => void)[] = [];
    const current: Session = {
      listen: (target, type, listener, options) => {
        target.addEventListener(type, listener as EventListener, options);
        removers.push(() => target.removeEventListener(type, listener as EventListener, options));
      },
      detach: () => removers.forEach((remove) => remove()),
      hold: undefined,
      dwellFor: null,
      dwellTimer: undefined,
      grab: { x: 0, y: 0 },
      width: 0,
      scrolling: false,
      scroll: () => {
        // A frame asked for by a drag since ended does nothing.
        if (session.current !== current) return;
        const { pointer } = machine.current as Extract<DragState, { phase: "dragging" }>;
        const step = scrollStep(pointer.y, window.innerHeight);
        current.scrolling = step !== 0;
        if (step === 0) return;
        window.scrollBy(0, step);
        rehit();
        schedule(current.scroll);
      },
    };
    session.current = current;
    current.listen<PointerEvent>(window, "pointermove", (move) =>
      dispatch({
        type: "move",
        pointerId: move.pointerId,
        point: { x: move.clientX, y: move.clientY },
        y: move.clientY - containerTop(),
      }),
    );
    current.listen<PointerEvent>(window, "pointerup", (up) => {
      if (up.pointerId === id) drop();
    });
    current.listen<PointerEvent>(window, "pointercancel", (gone) => {
      if (gone.pointerId === id) cancel();
    });
    // A second finger while the first is still held: a pinch, not a drag.
    current.listen<PointerEvent>(window, "pointerdown", (other) => {
      if (other.pointerId !== id && machine.current.phase === "pending") cancel();
    });
    current.listen<KeyboardEvent>(
      window,
      "keydown",
      (key) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        cancel();
      },
      { capture: true },
    );
    current.listen(window, "blur", cancel);
    current.listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") cancel();
    });
    dispatch({
      type: "press",
      source,
      pointerId: id,
      pointerType: event.pointerType,
      point: { x: event.clientX, y: event.clientY },
    });
    if (event.pointerType !== "mouse") current.hold = setTimeout(() => dispatch({ type: "hold" }), LONG_PRESS_MS);
  }

  function onPointerDown(event: PointerEvent) {
    clearGuard();
    if (!enabled || machine.current.phase !== "idle" || event.button !== 0 || !event.isPrimary) return;
    const element = event.target as Element;
    if (element.closest(NOT_A_HANDLE) !== null) return;
    const key = element.closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
    const source = latest.current.rows().find((row) => row.key === key);
    if (source === undefined || source.kind === "slot") return;
    start(event, source);
  }

  // Lifted, the list shows the drag (and makes room at the groups' ends): measured as it is now.
  useLayoutEffect(() => {
    if (feedback.phase !== "dragging") return;
    ghostRef.current!.style.width = `${session.current!.width}px`;
    measure();
    placeGhost((machine.current as Extract<DragState, { phase: "dragging" }>).pointer);
  }, [feedback.phase]);

  // A layout effect, so that it lets go at once as the list goes, before a pointer's next event.
  useLayoutEffect(() => {
    const container = containerRef.current!;
    // Not passive, so that it can keep the page from scrolling under a lifted row.
    const onTouchMove = (event: TouchEvent) => {
      if (machine.current.phase === "dragging") event.preventDefault();
    };
    // A long press's menu, and a link or picture dragged the browser's way (which would end the pointer's events).
    const onContextMenu = (event: Event) => {
      if (machine.current.phase !== "idle") event.preventDefault();
    };
    const onDragStart = (event: Event) => event.preventDefault();
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("dragstart", onDragStart);
    return () => {
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("dragstart", onDragStart);
      clearGuard();
      const current = session.current;
      if (current !== null) teardown(current);
    };
  }, []);

  return {
    feedback,
    ghostRef,
    lineRef,
    containerProps: {
      onPointerDown,
      onClickCapture: (event: MouseEvent) => {
        if (guard.current === null) return;
        event.preventDefault();
        event.stopPropagation();
        clearGuard();
      },
    },
  };
}
