import { createPortal } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useI18n } from "./i18n";
import { reducedMotion } from "./motion";

/** A box on the screen, in CSS pixels from the viewport's top left. */
type Box = { left: number; top: number; width: number; height: number };

/**
 * The enlarged picture while it is on screen: where the picture is in
 * the page (`origin`), where it fits the viewport (`fitted`), and how far
 * it has got — just put over the picture ("entering"), at full size
 * ("entered"), or on its way back ("leaving").
 */
type Zoom = { origin: Box; fitted: Box; phase: "entering" | "entered" | "leaving" };

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
 * A box of the given box's shape as large as the viewport allows, centred
 * in it: the viewport's full width or full height, whichever it reaches
 * first. The viewport is the root's client area, so a scrollbar is not
 * covered. No margin is kept: the page sets no `viewport-fit=cover`, so
 * the viewport is clear of notches and rounded corners already.
 */
function fitted({ width, height }: Box): Box {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
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
 * A picture that a tap enlarges to fill the viewport's width or height,
 * whichever it reaches first, keeping its shape, over a dimmed page; a
 * tap anywhere, Escape, or moving on (the focus leaving it, the page
 * scrolling) puts it back. It grows out of its place in the page and
 * shrinks back into it, unless the reader asks for reduced motion, when
 * it changes at once.
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
}: {
  /** The picture's class, as it is laid out in the page. */
  class: string;
  src: string;
  alt: string;
  /** The language of `alt`, when not the page's. */
  lang?: string;
}) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLImageElement>(null);
  // The listeners below outlive a render, so they read the zoom from here.
  const current = useRef(zoom);
  current.current = zoom;
  const onScreen = zoom !== null;
  const expanded = onScreen && zoom.phase !== "leaving";

  function enlarge() {
    buttonRef.current!.focus({ preventScroll: true });
    const shown = current.current;
    if (shown !== null) {
      // On its way back: turned round where it is.
      setZoom({ ...shown, phase: "entered" });
      return;
    }
    const origin = pictureBox(imageRef.current!);
    // A picture not loaded (or broken) has no shape to fit.
    if (origin.width === 0 || origin.height === 0) return;
    setZoom({ origin, fitted: fitted(origin), phase: reducedMotion() ? "entered" : "entering" });
  }

  function shrink() {
    const shown = current.current;
    if (shown === null || shown.phase === "leaving") return;
    // Measured again: the page may have moved under the enlarged picture.
    setZoom(reducedMotion() ? null : { ...shown, origin: pictureBox(imageRef.current!), phase: "leaving" });
  }

  function toggle() {
    if (expanded) shrink();
    else enlarge();
  }

  function putBack() {
    if (current.current?.phase === "leaving") setZoom(null);
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
      if (event.key === "Escape") shrink();
    };
    const onResize = () => {
      const shown = current.current!;
      setZoom({ ...shown, fitted: fitted(shown.origin) });
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [expanded]);

  // On its way back too, as the page under it may still be moving.
  useEffect(() => {
    if (!onScreen) return;
    const onScroll = () => setZoom(null);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScreen]);

  return (
    <div class="picture-zoom">
      <img ref={imageRef} class={`${className}${onScreen ? " zoomed-away" : ""}`} src={src} alt={alt} lang={lang} />
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
        <span class="visually-hidden">{expanded ? t("zoomableImage.shrink") : t("zoomableImage.enlarge")}</span>
      </button>
      {zoom !== null &&
        createPortal(
          <div
            class={`picture-zoom-layer${zoom.phase === "entered" ? " entered" : ""}`}
            aria-hidden="true"
            // The focus stays on the picture's button.
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggle}
          >
            <img
              ref={copyRef}
              class="picture-zoom-image"
              src={src}
              alt=""
              style={{
                left: `${zoom.fitted.left}px`,
                top: `${zoom.fitted.top}px`,
                width: `${zoom.fitted.width}px`,
                height: `${zoom.fitted.height}px`,
                transform: zoom.phase === "entered" ? "none" : transformFrom(zoom.origin, zoom.fitted),
              }}
              onTransitionEnd={putBack}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
