// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createPortal } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { composing } from "./composing";
import { useI18n } from "./i18n";
import { reducedMotion } from "./motion";

/** A box on the screen, in CSS pixels from the viewport's top left. */
type Box = { left: number; top: number; width: number; height: number };

/** A point on the screen, in CSS pixels from the viewport's top left. */
type Point = { x: number; y: number };

/**
 * How the enlarged picture is zoomed in on its fit: scaled about its top
 * left, then shifted, in CSS pixels.
 */
type View = { scale: number; x: number; y: number };

/** The picture as it fits the viewport, not zoomed in. */
const FIT: View = { scale: 1, x: 0, y: 0 };

/**
 * The enlarged picture while it is on screen: where the picture is in
 * the page (`origin`), where it fits the viewport (`fitted`), and how far
 * it has got — just put over the picture ("entering"), at full size
 * ("entered"), or on its way back ("leaving"). At full size it may be
 * zoomed in (`view`), follow a finger or the mouse at once rather than
 * glide (`moving`), and be thrown, the page showing through as it goes
 * (`dim`, from 1 down to 0).
 */
type Zoom = {
  origin: Box;
  fitted: Box;
  phase: "entering" | "entered" | "leaving";
  view: View;
  moving: boolean;
  dim: number;
};

/**
 * The pointers on the enlarged picture, from the first one down until
 * the last one is up: a press that may still be a tap, a drag (`pan`
 * when zoomed in, `throw` at full size), or a pinch. `from` is where the
 * pointer, or the pinch's middle, was when it started and `view` the
 * view then; `span` is how far apart a pinch's fingers were. A throw
 * keeps its last move, for how fast it was going when let go.
 */
type Gesture = {
  pointers: Map<number, Point>;
  kind: "press" | "pan" | "throw" | "pinch";
  from: Point;
  view: View;
  span: number;
  last: { y: number; time: number };
  speed: number;
};

/**
 * How long a tap on the enlarged picture waits for a second one, to
 * zoom in, before it puts the picture back.
 */
export const DOUBLE_TAP_MS = 250;

/** How far apart the two taps of a double tap may be, in CSS pixels. */
const DOUBLE_TAP_DISTANCE = 32;

/** How far a double tap zooms in. */
const DOUBLE_TAP_SCALE = 2.5;

/** How far a pinch zooms in at most. */
const MAX_SCALE = 4;

/** How far a pinch zooms out at most, before it springs back to the fit. */
const MIN_SCALE = 0.5;

/** How far a pointer moves before it drags rather than taps, in CSS pixels. */
const SLOP = 8;

/** How far a throw goes, as a share of the viewport's height, to put the picture back. */
const THROW_DISTANCE = 0.15;

/** How fast a throw goes when let go, in CSS pixels a millisecond, to put the picture back. */
const THROW_SPEED = 0.5;

/** How long a throw may be held still before it is let go and still count as going that fast. */
const THROW_HOLD_MS = 100;

/**
 * How long the way back may take before the picture is put back
 * regardless, in case its transition never ends (a tab in the
 * background, a stylesheet without it). Longer than the transition.
 */
export const ZOOM_FALLBACK_MS = 300;

/**
 * Where the picture itself is drawn: its box inside its border, so the
 * enlarged copy, which has no border, keeps the picture's own shape and
 * lands exactly on it.
 */
function pictureBox(image: HTMLImageElement): Box {
  const { left, top, width, height } = image.getBoundingClientRect();
  const { clientLeft, clientTop } = image;
  return {
    left: left + clientLeft,
    top: top + clientTop,
    width: width - 2 * clientLeft,
    height: height - 2 * clientTop,
  };
}

/**
 * A box of the given box's shape as large as the viewport allows, centered
 * in it: the viewport's full width or full height, whichever it reaches
 * first. The viewport is the root's client area, so a scrollbar is not
 * covered. No margin is kept: the page sets no `viewport-fit=cover`, so
 * the viewport is clear of notches and rounded corners already.
 */
function fitted({ width, height }: Box): Box {
  const { clientWidth: viewportWidth, clientHeight: viewportHeight } = document.documentElement;
  const scale = Math.min(viewportWidth / width, viewportHeight / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  return {
    left: (viewportWidth - fittedWidth) / 2,
    top: (viewportHeight - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

/** The transform that puts a picture laid out at `to` over `from` instead. */
function transformFrom(from: Box, to: Box): string {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
}

/**
 * The shift along one axis that keeps a picture `size` long, laid out
 * from `start`, in a viewport `room` long: centered when it is shorter,
 * otherwise with no gap at either end.
 */
function shiftWithin(shift: number, start: number, size: number, room: number): number {
  if (size <= room) return (room - size) / 2 - start;
  return Math.min(-start, Math.max(room - start - size, shift));
}

/**
 * Where a view comes to rest: back at the fit when zoomed out past it,
 * otherwise moved to cover as much of the viewport as it can.
 */
function settled(box: Box, view: View): View {
  if (view.scale <= 1) return FIT;
  const { clientWidth, clientHeight } = document.documentElement;
  return {
    scale: view.scale,
    x: shiftWithin(view.x, box.left, box.width * view.scale, clientWidth),
    y: shiftWithin(view.y, box.top, box.height * view.scale, clientHeight),
  };
}

/** The view scaled to `scale`, the spot of the picture at `at` staying where it is. */
function zoomedAbout(box: Box, view: View, at: Point, scale: number): View {
  const ratio = scale / view.scale;
  return {
    scale,
    x: at.x - box.left - (at.x - box.left - view.x) * ratio,
    y: at.y - box.top - (at.y - box.top - view.y) * ratio,
  };
}

/** How the copy is moved and scaled from where it is laid out, the fit. */
function viewTransform({ scale, x, y }: View): string {
  return scale === 1 && x === 0 && y === 0 ? "none" : `translate(${x}px, ${y}px) scale(${scale})`;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * A picture that a tap enlarges to fill the viewport's width or height,
 * whichever it reaches first, keeping its shape, over a dimmed page; a
 * tap anywhere, Escape, throwing it up or down, or moving on (the focus
 * leaving it, the page scrolling) puts it back. It grows out of its place
 * in the page and shrinks back into it, unless the reader asks for
 * reduced motion, when it changes at once.
 *
 * Enlarged, it zooms on its own rather than the page with it: a pinch
 * zooms it about the fingers, a double tap zooms in on the spot tapped
 * and another goes back to the fit, and a drag moves it while zoomed in.
 * Let go, it settles where it covers the most of the viewport, and a
 * pinch out past the fit springs back to it rather than putting it back,
 * which only a tap, Escape or a throw does. So a tap waits a moment
 * (`DOUBLE_TAP_MS`) to be sure it is not the first of two. The layer
 * takes every touch (`touch-action: none`), so the browser neither zooms
 * nor scrolls the page under it.
 *
 * A button laid over the picture does the enlarging, so a keyboard opens
 * it too. The picture stays outside the button, as a button's content is
 * read as one flat name: beside it, the picture is still an image of its
 * own, read by its alt text in that text's language. The button is named
 * by what a tap does ("Enlarge picture") and `aria-expanded` says which
 * way it is. A tap focuses it, as Safari does not, so the keys pressed
 * while the picture is enlarged go to it rather than to what had the
 * focus before (in study, Space would reveal the answer underneath).
 *
 * The enlarged picture is a copy laid over the page, hidden from screen
 * readers, while the picture itself keeps its place, transparent rather
 * than hidden so it is still read, and nothing around it moves. A scroll
 * puts it back at once rather than being stopped: stopping it would take
 * the scrollbar away and shift the page under the picture, a reader
 * scrolling is done looking, and a copy shrinking back could not follow
 * a page still moving. A resize, such as turning a phone, fits it to the
 * new viewport.
 */
export function ZoomableImage({
  class: className,
  src,
  alt,
  lang,
  takeFocus = false,
}: {
  /** The picture's class, as it is laid out in the page. */
  class: string;
  src: string;
  alt: string;
  /** The language of `alt`, when not the page's. */
  lang?: string;
  /** Focus its button as it appears: it takes the place of what had the focus. */
  takeFocus?: boolean;
}) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLImageElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // Set once pointers drag or pinch, so the click that may end it is no tap.
  const tapless = useRef(false);
  // A first tap waiting for a second one; held while a pointer is down,
  // so the second tap's press does not see the picture put back under it.
  const firstTap = useRef<{
    at: Point;
    time: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  // The listeners below outlive a render, so they read the zoom from here.
  const current = useRef(zoom);
  current.current = zoom;
  const onScreen = zoom !== null;
  const expanded = onScreen && zoom.phase !== "leaving";

  function enlarge() {
    buttonRef.current!.focus({ preventScroll: true });
    const shown = current.current;
    if (shown !== null) {
      // On its way back: turned round where it is, to the fit.
      setZoom({ ...shown, phase: "entered", view: FIT });
      return;
    }
    const origin = pictureBox(imageRef.current!);
    // A picture not loaded (or broken) has no shape to fit.
    if (origin.width === 0 || origin.height === 0) return;
    setZoom({
      origin,
      fitted: fitted(origin),
      phase: reducedMotion() ? "entered" : "entering",
      view: FIT,
      moving: false,
      dim: 1,
    });
  }

  function shrink() {
    const shown = current.current;
    if (shown === null || shown.phase === "leaving") return;
    // Measured again: the page may have moved under the enlarged picture.
    setZoom(
      reducedMotion()
        ? null
        : {
            ...shown,
            origin: pictureBox(imageRef.current!),
            phase: "leaving",
            moving: false,
            dim: 1,
          },
    );
  }

  function toggle() {
    if (expanded) shrink();
    else enlarge();
  }

  function putBack() {
    if (current.current?.phase === "leaving") setZoom(null);
  }

  /** Drops the first tap: what follows it is no double tap, and it is no single tap. */
  function forgetTap() {
    clearTimeout(firstTap.current?.timer);
    firstTap.current = null;
  }

  /** Marks the pointers down as a drag or a pinch, neither of them a tap. */
  function gestured() {
    tapless.current = true;
    forgetTap();
  }

  /** The zoom at full size, or null when it is not there. */
  function entered(): Zoom | null {
    const shown = current.current;
    return shown?.phase === "entered" ? shown : null;
  }

  /**
   * Starts the gesture over from where the pointers are now: a pinch of
   * the first two, or a drag of the one left, which after a pinch only
   * moves the picture, never throws it.
   */
  function restart(state: Gesture, view: View) {
    const [a, b] = [...state.pointers.values()];
    state.view = view;
    if (b === undefined) {
      state.from = a!;
      if (state.kind === "pinch") state.kind = "pan";
      return;
    }
    gestured();
    state.kind = "pinch";
    state.from = middle(a!, b);
    state.span = distance(a!, b);
  }

  function onPointerDown(event: PointerEvent) {
    // A press starts over what may be a tap, on the way back too, where it turns the picture round.
    if (gesture.current === null) tapless.current = false;
    const shown = entered();
    if (shown === null) return;
    clearTimeout(firstTap.current?.timer);
    let state = gesture.current;
    if (state === null) {
      const at = { x: event.clientX, y: event.clientY };
      state = {
        pointers: new Map(),
        kind: "press",
        from: at,
        view: shown.view,
        span: 0,
        last: { y: at.y, time: Date.now() },
        speed: 0,
      };
      gesture.current = state;
    }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    restart(state, shown.view);
  }

  function onPointerMove(event: PointerEvent) {
    const state = gesture.current;
    const shown = entered();
    if (state === null || shown === null || !state.pointers.has(event.pointerId)) return;
    const at = { x: event.clientX, y: event.clientY };
    state.pointers.set(event.pointerId, at);
    if (state.kind === "pinch") {
      const [a, b] = [...state.pointers.values()] as [Point, Point];
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, (state.view.scale * distance(a, b)) / state.span),
      );
      const view = zoomedAbout(shown.fitted, state.view, state.from, scale);
      const now = middle(a, b);
      view.x += now.x - state.from.x;
      view.y += now.y - state.from.y;
      setZoom({ ...shown, view, moving: true });
      return;
    }
    const dx = at.x - state.from.x;
    const dy = at.y - state.from.y;
    if (state.kind === "press") {
      if (Math.hypot(dx, dy) < SLOP) return;
      gestured();
      state.kind = state.view.scale > 1 ? "pan" : "throw";
    }
    const view = { ...state.view, x: state.view.x + dx, y: state.view.y + dy };
    if (state.kind === "pan") {
      setZoom({ ...shown, view, moving: true });
      return;
    }
    const time = Date.now();
    state.speed = (at.y - state.last.y) / Math.max(1, time - state.last.time);
    state.last = { y: at.y, time };
    const half = document.documentElement.clientHeight / 2;
    setZoom({
      ...shown,
      view: { ...view, x: state.view.x },
      moving: true,
      dim: 1 - Math.min(1, Math.abs(dy) / half),
    });
  }

  /**
   * A pointer up, or taken away by the browser (`let go` false): the
   * gesture goes on with the pointers left, or ends, a throw far or fast
   * enough putting the picture back and anything else settling.
   */
  function onPointerEnd(event: PointerEvent, letGo: boolean) {
    const state = gesture.current;
    if (state === null || !state.pointers.delete(event.pointerId)) return;
    const shown = entered();
    // Put back meanwhile, by Escape say, before the gesture was dropped.
    if (shown === null) {
      gesture.current = null;
      return;
    }
    if (state.pointers.size > 0) {
      restart(state, shown.view);
      return;
    }
    gesture.current = null;
    if (state.kind === "press") return;
    const thrown = shown.view.y - state.view.y;
    // Fast only when still going, and away from where it started rather than back.
    const fast =
      Date.now() - state.last.time <= THROW_HOLD_MS &&
      state.speed * Math.sign(thrown) >= THROW_SPEED;
    if (
      letGo &&
      state.kind === "throw" &&
      (Math.abs(thrown) >= document.documentElement.clientHeight * THROW_DISTANCE || fast)
    ) {
      shrink();
      return;
    }
    setZoom({ ...shown, view: settled(shown.fitted, shown.view), moving: false, dim: 1 });
  }

  /**
   * A click on the layer: on the way back, it turns the picture round; at
   * full size, a tap that waits for a second one, two of them zooming in
   * on the spot tapped or back out to the fit. A drag or a pinch is no
   * tap.
   */
  function onLayerClick(event: MouseEvent) {
    if (tapless.current) {
      tapless.current = false;
      return;
    }
    const shown = entered();
    if (shown === null) {
      enlarge();
      return;
    }
    const at = { x: event.clientX, y: event.clientY };
    const first = firstTap.current;
    if (first === null) {
      firstTap.current = {
        at,
        time: Date.now(),
        timer: setTimeout(() => {
          firstTap.current = null;
          shrink();
        }, DOUBLE_TAP_MS),
      };
      return;
    }
    forgetTap();
    // Two taps far apart, or a second press held long, are two taps, the first putting it back.
    if (
      distance(first.at, at) > DOUBLE_TAP_DISTANCE ||
      Date.now() - first.time > 2 * DOUBLE_TAP_MS
    ) {
      shrink();
      return;
    }
    const view =
      shown.view.scale > 1
        ? FIT
        : settled(shown.fitted, zoomedAbout(shown.fitted, shown.view, at, DOUBLE_TAP_SCALE));
    setZoom({ ...shown, view });
  }

  // Laid over the picture, its style is settled there before it is set to
  // full size, so the change is a transition rather than a jump.
  useLayoutEffect(() => {
    if (zoom?.phase !== "entering") return;
    copyRef.current!.getBoundingClientRect();
    setZoom({ ...zoom, phase: "entered" });
  }, [zoom?.phase]);

  useEffect(() => {
    if (zoom?.phase !== "leaving") return;
    const timer = setTimeout(putBack, ZOOM_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [zoom?.phase]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !composing(event)) shrink();
    };
    const onResize = () => {
      const shown = current.current!;
      setZoom({ ...shown, fitted: fitted(shown.origin), view: FIT });
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      // What was under way on the enlarged picture goes with it.
      forgetTap();
      gesture.current = null;
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (takeFocus) buttonRef.current!.focus();
  }, []);

  // On its way back too, as the page under it may still be moving.
  useEffect(() => {
    if (!onScreen) return;
    const onScroll = () => setZoom(null);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScreen]);

  return (
    <div class="picture-zoom">
      <img
        ref={imageRef}
        class={`${className}${onScreen ? " zoomed-away" : ""}`}
        src={src}
        alt={alt}
        lang={lang}
        referrerpolicy="no-referrer"
      />
      <button
        ref={buttonRef}
        type="button"
        class="picture-zoom-button"
        aria-expanded={expanded}
        onClick={toggle}
        onBlur={(event) => {
          // The focus moved on, by Tab say; a tap on the page takes it nowhere.
          if (event.relatedTarget !== null) shrink();
        }}
      >
        <span class="visually-hidden">
          {expanded ? t("zoomableImage.shrink") : t("zoomableImage.enlarge")}
        </span>
      </button>
      {zoom !== null &&
        createPortal(
          <div
            class={`picture-zoom-layer${zoom.phase === "entered" ? " entered" : ""}${zoom.moving ? " moving" : ""}`}
            aria-hidden="true"
            style={{ "--picture-zoom-dim": String(zoom.dim) }}
            // The focus stays on the picture's button, and the copy is not dragged away.
            onMouseDown={(event) => event.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => onPointerEnd(event, true)}
            onPointerCancel={(event) => onPointerEnd(event, false)}
            onClick={onLayerClick}
          >
            <img
              ref={copyRef}
              class="picture-zoom-image"
              src={src}
              referrerpolicy="no-referrer"
              alt=""
              style={{
                left: `${zoom.fitted.left}px`,
                top: `${zoom.fitted.top}px`,
                width: `${zoom.fitted.width}px`,
                height: `${zoom.fitted.height}px`,
                transform:
                  zoom.phase === "entered"
                    ? viewTransform(zoom.view)
                    : transformFrom(zoom.origin, zoom.fitted),
              }}
              onTransitionEnd={putBack}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
