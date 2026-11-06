// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { DOUBLE_TAP_MS, ZOOM_FALLBACK_MS, ZoomableImage } from "./ZoomableImage";

const FLAG = "https://flagcdn.com/af.svg";

/** A viewport of the given size, as the root's client area says. */
function setViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
}

/** A browser that does, or does not, ask for reduced motion. */
function setReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reduce } as MediaQueryList);
}

/** The picture laid out at a box in the page, 200 by 100 unless given. */
function placePicture(box: Partial<DOMRect> = {}) {
  const image = screen.getByRole("img") as HTMLImageElement;
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 50,
    width: 200,
    height: 100,
    ...box,
  } as DOMRect);
  return image;
}

const layer = () => document.querySelector<HTMLElement>(".picture-zoom-layer");
const copy = () => document.querySelector<HTMLImageElement>(".picture-zoom-image");

/** A tap on the enlarged picture that waits out a second one, a single tap. */
function tap() {
  fireEvent.click(layer()!);
  act(() => {
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
  });
}

/** Two taps on the enlarged picture at the same spot, a double tap. */
function doubleTap(clientX: number, clientY: number) {
  fireEvent.click(layer()!, { clientX, clientY });
  fireEvent.click(layer()!, { clientX, clientY });
}

/** A pointer on the enlarged picture: down, moved, and up or taken away. */
const down = (pointerId: number, clientX: number, clientY: number) =>
  fireEvent.pointerDown(layer()!, { pointerId, clientX, clientY });
const move = (pointerId: number, clientX: number, clientY: number) =>
  fireEvent.pointerMove(layer()!, { pointerId, clientX, clientY });
const up = (pointerId: number) => fireEvent.pointerUp(layer()!, { pointerId });
const cancel = (pointerId: number) => fireEvent.pointerCancel(layer()!, { pointerId });

function renderPicture() {
  render(<ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />);
  placePicture();
  return screen.getByRole("button");
}

describe("ZoomableImage", () => {
  beforeEach(() => {
    setViewport(1000, 800);
    setReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("lays a button named by what a tap does beside the picture, which stays an image in its own language", () => {
    render(<ZoomableImage class="card-image" src={FLAG} alt="Flagga" lang="sv" />);
    const button = screen.getByRole("button", { name: "Enlarge picture" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    const image = screen.getByRole("img", { name: "Flagga" });
    expect(image).toHaveClass("card-image");
    expect(image).toHaveAttribute("src", FLAG);
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(image).toHaveAttribute("lang", "sv");
    // Not inside the button, whose content would be read as one flat name.
    expect(button).not.toContainElement(image);
    expect(image.nextElementSibling).toBe(button);
    expect(layer()).toBeNull();
  });

  it("enlarges the picture to the viewport's width, keeping its shape, and grows it out of its place", () => {
    const button = renderPicture();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleName("Shrink picture");
    // The picture keeps its place, unseen; the copy over the page is hidden from screen readers.
    expect(screen.getByRole("img", { name: "Flag of Afghanistan" })).toHaveClass(
      "card-image",
      "zoomed-away",
    );
    expect(layer()).toHaveAttribute("aria-hidden", "true");
    expect(layer()!.parentElement).toBe(document.body);
    expect(copy()).toHaveAttribute("alt", "");
    expect(copy()).toHaveAttribute("src", FLAG);
    // 200 by 100 in a 1000 by 800 viewport: full width, centered.
    expect(copy()!.style.left).toBe("0px");
    expect(copy()!.style.top).toBe("150px");
    expect(copy()!.style.width).toBe("1000px");
    expect(copy()!.style.height).toBe("500px");
    // Set to full size once laid over the picture, so it grows.
    expect(copy()!.style.transform).toBe("none");
    expect(layer()).toHaveClass("entered");
  });

  it("starts the copy over the picture before it grows", () => {
    renderPicture();
    const transforms: string[] = [];
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("picture-zoom-image")) transforms.push(this.style.transform);
      return original.call(this);
    });
    fireEvent.click(screen.getByRole("button"));
    expect(transforms).toEqual(["translate(100px, -100px) scale(0.2)"]);
    expect(copy()!.style.transform).toBe("none");
  });

  it("fits the viewport's height when it reaches that first", () => {
    render(<ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />);
    placePicture({ width: 100, height: 200 });
    fireEvent.click(screen.getByRole("button"));
    expect(copy()!.style.left).toBe("300px");
    expect(copy()!.style.top).toBe("0px");
    expect(copy()!.style.width).toBe("400px");
    expect(copy()!.style.height).toBe("800px");
  });

  it("keeps the shape of the picture inside its border, landing on it exactly", () => {
    render(<ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />);
    // A 250 by 100 picture inside a 1px border, laid out at 252 by 102.
    const image = placePicture({ left: 99, top: 49, width: 252, height: 102 });
    Object.defineProperty(image, "clientLeft", { configurable: true, value: 1 });
    Object.defineProperty(image, "clientTop", { configurable: true, value: 1 });
    const transforms: string[] = [];
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains("picture-zoom-image")) transforms.push(this.style.transform);
      return original.call(this);
    });
    fireEvent.click(screen.getByRole("button"));
    // 5 by 2, as the picture is, not as its border's box is.
    expect(copy()!.style.top).toBe("200px");
    expect(copy()!.style.width).toBe("1000px");
    expect(copy()!.style.height).toBe("400px");
    expect(transforms).toEqual(["translate(100px, -150px) scale(0.25)"]);
  });

  it("does not enlarge a picture with no size, as before it loads", () => {
    render(<ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />);
    placePicture({ width: 0, height: 0 });
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(layer()).toBeNull();
    placePicture({ width: 10, height: 0 });
    fireEvent.click(button);
    expect(layer()).toBeNull();
  });

  it("shrinks back into its place on a tap, when its transition ends", () => {
    const button = renderPicture();
    fireEvent.click(button);
    // Scrolled meanwhile, the picture is measured again where it is now.
    placePicture({ top: 10 });
    tap();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAccessibleName("Enlarge picture");
    expect(layer()).not.toHaveClass("entered");
    expect(copy()!.style.transform).toBe("translate(100px, -140px) scale(0.2)");
    expect(screen.getByRole("img", { name: "Flag of Afghanistan" })).toHaveClass("zoomed-away");
    fireEvent.transitionEnd(copy()!);
    expect(layer()).toBeNull();
    expect(screen.getByRole("img", { name: "Flag of Afghanistan" })).not.toHaveClass("zoomed-away");
  });

  it("puts the picture back after a while if the transition never ends", () => {
    const button = renderPicture();
    fireEvent.click(button);
    tap();
    act(() => {
      vi.advanceTimersByTime(ZOOM_FALLBACK_MS - 1);
    });
    expect(layer()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(layer()).toBeNull();
  });

  it("ignores a transition ending while it is enlarged", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.transitionEnd(copy()!);
    expect(layer()).toHaveClass("entered");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("turns round on a tap while on its way back, at once and to the fit", () => {
    const button = renderPicture();
    fireEvent.click(button);
    doubleTap(500, 400);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(layer()!);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(layer()).toHaveClass("entered");
    expect(copy()!.style.transform).toBe("none");
    // The way back's fallback is called off.
    act(() => {
      vi.advanceTimersByTime(ZOOM_FALLBACK_MS);
    });
    expect(layer()).not.toBeNull();
  });

  it("keeps the focus on the picture's button, a tap on the enlarged picture taking it nowhere", () => {
    const button = renderPicture();
    button.focus();
    fireEvent.click(button);
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    layer()!.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    fireEvent.click(layer()!);
    expect(button).toHaveFocus();
  });

  it("shrinks on Escape, and Escape does nothing else while it is not enlarged", () => {
    const button = renderPicture();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(layer()).toBeNull();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Enter" });
    // An input method's Escape, in a field elsewhere on the page, is its own.
    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    fireEvent.keyDown(document, { key: "Escape", keyCode: 229 });
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    // A second Escape on the way back changes nothing.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(layer()).not.toBeNull();
  });

  it("puts the picture back at once when the page scrolls, on its way back too", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.scroll(window);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(layer()).toBeNull();
    expect(screen.getByRole("img")).not.toHaveClass("zoomed-away");
    fireEvent.click(button);
    tap();
    expect(layer()).not.toBeNull();
    // The page moving on under the copy shrinking back: it could not follow.
    placePicture({ top: -300 });
    fireEvent.scroll(window);
    expect(layer()).toBeNull();
  });

  it("takes the focus on a tap, as a browser that does not focus a tapped button leaves it elsewhere", () => {
    render(
      <>
        <div tabIndex={-1} data-testid="face" />
        <ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />
      </>,
    );
    placePicture();
    screen.getByTestId("face").focus();
    const button = screen.getByRole("button");
    const focus = vi.spyOn(button, "focus");
    fireEvent.click(button);
    expect(button).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("shrinks when the focus moves on, not when a tap takes it nowhere", () => {
    render(
      <>
        <ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />
        <button>Next</button>
      </>,
    );
    placePicture();
    const button = screen.getByRole("button", { name: "Enlarge picture" });
    const next = screen.getByRole("button", { name: "Next" });
    // Focus passing through while it is not enlarged changes nothing.
    button.focus();
    act(() => next.focus());
    expect(layer()).toBeNull();
    button.focus();
    fireEvent.click(button);
    fireEvent.blur(button, { relatedTarget: null });
    expect(button).toHaveAttribute("aria-expanded", "true");
    act(() => next.focus());
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("fits the new viewport on a resize, and stops listening once put back", () => {
    const button = renderPicture();
    fireEvent.click(button);
    setViewport(400, 900);
    fireEvent(window, new Event("resize"));
    expect(copy()!.style.left).toBe("0px");
    expect(copy()!.style.top).toBe("350px");
    expect(copy()!.style.width).toBe("400px");
    expect(copy()!.style.height).toBe("200px");
    tap();
    fireEvent.transitionEnd(copy()!);
    fireEvent(window, new Event("resize"));
    fireEvent.scroll(window);
    expect(layer()).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("changes at once, without waiting on a transition, when the reader asks for reduced motion", () => {
    setReducedMotion(true);
    const button = renderPicture();
    const measured = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    fireEvent.click(button);
    expect(layer()).toHaveClass("entered");
    expect(copy()!.style.transform).toBe("none");
    // Never laid over the picture first, as nothing grows.
    expect(measured).not.toHaveBeenCalled();
    tap();
    expect(layer()).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("says what a tap does in Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <ZoomableImage class="card-image" src={FLAG} alt="Afghanistans flagga" />
      </I18nProvider>,
    );
    placePicture();
    const button = screen.getByRole("button", { name: "Förstora bilden" });
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Förminska bilden");
  });

  it("takes the enlarged picture away with it when it goes", () => {
    const { unmount } = render(
      <ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />,
    );
    placePicture();
    fireEvent.click(screen.getByRole("button"));
    unmount();
    expect(layer()).toBeNull();
  });

  it("shrinks at once when its button is pressed again, as Enter or Space does", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("waits a moment on a tap, for a second one, before it puts the picture back", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!);
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("zooms in on the spot double tapped, and back out to the fit on another", () => {
    const button = renderPicture();
    fireEvent.click(button);
    // The fit is 1000 by 500 at (0, 150); its middle stays where it is.
    doubleTap(500, 400);
    expect(copy()!.style.transform).toBe("translate(-750px, -375px) scale(2.5)");
    expect(layer()).not.toHaveClass("moving");
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
    doubleTap(100, 200);
    expect(copy()!.style.transform).toBe("none");
  });

  it("zooms in near an edge without leaving a gap there", () => {
    renderPicture();
    fireEvent.click(screen.getByRole("button"));
    // Kept under the finger, the top would come down to 75px; it stays at the viewport's top.
    doubleTap(100, 200);
    expect(copy()!.style.transform).toBe("translate(-150px, -150px) scale(2.5)");
  });

  it("puts the picture back on a second tap far from the first", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!, { clientX: 100, clientY: 200 });
    fireEvent.click(layer()!, { clientX: 100, clientY: 233 });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(copy()!.style.transform).toBe("translate(100px, -100px) scale(0.2)");
  });

  it("zooms the picture about the fingers on a pinch, following them at once, and keeps it there", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 400, 400);
    down(2, 600, 400);
    // Twice as far apart, their middle 100px to the right.
    move(2, 800, 400);
    expect(copy()!.style.transform).toBe("translate(-400px, -250px) scale(2)");
    expect(layer()).toHaveClass("moving");
    up(1);
    up(2);
    expect(copy()!.style.transform).toBe("translate(-400px, -250px) scale(2)");
    expect(layer()).not.toHaveClass("moving");
    // The click the pinch may end with is no tap.
    tap();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("zooms in no further than four times the fit", () => {
    renderPicture();
    fireEvent.click(screen.getByRole("button"));
    down(1, 450, 400);
    down(2, 550, 400);
    move(2, 1450, 400);
    expect(copy()!.style.transform).toMatch(/ scale\(4\)$/);
  });

  it("springs back to the fit on a pinch out past it, and never puts the picture back", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 400, 400);
    down(2, 600, 400);
    move(2, 500, 400);
    expect(copy()!.style.transform).toMatch(/ scale\(0\.5\)$/);
    // No further out than half the fit.
    move(2, 410, 400);
    expect(copy()!.style.transform).toMatch(/ scale\(0\.5\)$/);
    up(2);
    up(1);
    expect(copy()!.style.transform).toBe("none");
    expect(layer()).not.toHaveClass("moving");
    tap();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the picture centered across a side it does not fill, zoomed in a little", () => {
    renderPicture();
    fireEvent.click(screen.getByRole("button"));
    // Pinched near the top, 1.2 times the fit.
    down(1, 400, 200);
    down(2, 600, 200);
    move(2, 640, 200);
    expect(copy()!.style.transform).toBe("translate(-80px, -10px) scale(1.2)");
    up(1);
    up(2);
    // 1200 by 600: across, as pinched; down, centered in the viewport's 800.
    expect(copy()!.style.transform).toBe("translate(-80px, -50px) scale(1.2)");
  });

  it("moves the picture with the finger left after a pinch, never throwing it", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 400, 400);
    down(2, 600, 400);
    move(2, 800, 400);
    up(1);
    move(2, 800, 700);
    expect(copy()!.style.transform).toBe("translate(-400px, 50px) scale(2)");
    up(2);
    // Let go past the edge, it settles back to the viewport's top.
    expect(copy()!.style.transform).toBe("translate(-400px, -150px) scale(2)");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("drags the picture about while zoomed in, settling with no gap at the edges", () => {
    const button = renderPicture();
    fireEvent.click(button);
    doubleTap(500, 400);
    down(1, 500, 400);
    move(1, 400, 350);
    expect(copy()!.style.transform).toBe("translate(-850px, -425px) scale(2.5)");
    expect(layer()).toHaveClass("moving");
    move(1, 2000, 400);
    up(1);
    expect(copy()!.style.transform).toBe("translate(0px, -375px) scale(2.5)");
    expect(layer()).not.toHaveClass("moving");
    tap();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("takes a press that hardly moves for a tap", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    move(1, 505, 403);
    up(1);
    expect(copy()!.style.transform).toBe("none");
    tap();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("puts the picture back when thrown far enough up or down, the page showing through as it goes", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Only up or down: across, it stays put.
    move(1, 600, 600);
    expect(copy()!.style.transform).toBe("translate(0px, 200px) scale(1)");
    expect(layer()!.style.getPropertyValue("--picture-zoom-dim")).toBe("0.5");
    expect(layer()).toHaveClass("moving");
    // 200px is past 15% of the viewport's 800.
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(layer()).not.toHaveClass("moving");
    expect(layer()!.style.getPropertyValue("--picture-zoom-dim")).toBe("1");
    expect(copy()!.style.transform).toBe("translate(100px, -100px) scale(0.2)");
  });

  it("puts the picture back when thrown fast, however short the throw", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    move(1, 500, 360);
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("springs back from a throw short and slow, or one the browser takes away", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    move(1, 500, 460);
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(copy()!.style.transform).toBe("none");
    expect(layer()!.style.getPropertyValue("--picture-zoom-dim")).toBe("1");
    down(1, 500, 400);
    move(1, 500, 700);
    cancel(1);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(copy()!.style.transform).toBe("none");
  });

  it("leaves alone the pointers it did not see go down, and any on the way back", () => {
    const button = renderPicture();
    fireEvent.click(button);
    move(1, 500, 600);
    up(1);
    expect(copy()!.style.transform).toBe("none");
    fireEvent.keyDown(document, { key: "Escape" });
    down(1, 500, 400);
    move(1, 500, 700);
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(copy()!.style.transform).toBe("translate(100px, -100px) scale(0.2)");
  });

  it("drops what was under way when the picture is put back meanwhile", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    fireEvent.click(layer()!, { clientX: 500, clientY: 400 });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.transitionEnd(copy()!);
    // Enlarged again, the old finger and the old tap are gone.
    fireEvent.click(button);
    up(1);
    fireEvent.click(layer()!, { clientX: 500, clientY: 400 });
    expect(copy()!.style.transform).toBe("none");
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("fits the new viewport on a resize, zoomed in or not", () => {
    renderPicture();
    fireEvent.click(screen.getByRole("button"));
    doubleTap(500, 400);
    fireEvent(window, new Event("resize"));
    expect(copy()!.style.transform).toBe("none");
  });

  it("holds a first tap while a finger is down, so a slow second tap still zooms in", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!, { clientX: 500, clientY: 400 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
    up(1);
    fireEvent.click(layer()!, { clientX: 500, clientY: 400 });
    expect(copy()!.style.transform).toBe("translate(-750px, -375px) scale(2.5)");
  });

  it("takes a second press held long for a tap of its own", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!, { clientX: 500, clientY: 400 });
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(2 * DOUBLE_TAP_MS + 1);
    });
    up(1);
    fireEvent.click(layer()!, { clientX: 500, clientY: 400 });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("forgets a tap that a pinch or a drag follows, never putting the picture back under it", () => {
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!);
    down(1, 400, 400);
    down(2, 600, 400);
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    up(1);
    up(2);
    expect(button).toHaveAttribute("aria-expanded", "true");
    // A tap, its press, its lift and its click; then a slow drag.
    down(1, 500, 400);
    up(1);
    fireEvent.click(layer()!);
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    move(1, 500, 420);
    up(1);
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
    // Nor is the drag's own click the second of two taps.
    fireEvent.click(layer()!);
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("springs back from a fast throw held still before it is let go", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    move(1, 500, 460);
    act(() => {
      vi.advanceTimersByTime(101);
    });
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(copy()!.style.transform).toBe("none");
  });

  it("springs back from a throw flicked back toward where it started", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    move(1, 500, 500);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    move(1, 500, 450);
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("turns round on a tap after a throw put it back, the throw's own touch no tap of it", () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    move(1, 500, 700);
    up(1);
    expect(button).toHaveAttribute("aria-expanded", "false");
    down(1, 500, 400);
    up(1);
    fireEvent.click(layer()!);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("drops a gesture whose picture is put back before its finger is up", async () => {
    const button = renderPicture();
    fireEvent.click(button);
    down(1, 500, 400);
    move(1, 500, 450);
    const errors = vi.fn();
    window.addEventListener("error", errors);
    // Outside act, so the finger is up after the picture is on its way back but before its effects run.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await Promise.resolve();
    layer()!.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
    window.removeEventListener("error", errors);
    expect(errors).not.toHaveBeenCalled();
    act(() => undefined);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
