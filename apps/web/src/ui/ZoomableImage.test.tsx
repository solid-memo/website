import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { ZOOM_FALLBACK_MS, ZoomableImage } from "./ZoomableImage";

const FLAG = "https://flagcdn.com/af.svg";

/** A viewport of the given size, as the root's client area says. */
function setViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
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

function renderPicture() {
  render(<ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />);
  placePicture();
  return screen.getByRole("button");
}

describe("ZoomableImage", () => {
  beforeEach(() => {
    setViewport(1000, 800);
    setReducedMotion(false);
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
    expect(screen.getByRole("img", { name: "Flag of Afghanistan" })).toHaveClass("card-image", "zoomed-away");
    expect(layer()).toHaveAttribute("aria-hidden", "true");
    expect(layer()!.parentElement).toBe(document.body);
    expect(copy()).toHaveAttribute("alt", "");
    expect(copy()).toHaveAttribute("src", FLAG);
    // 200 by 100 in a 1000 by 800 viewport: full width, centred.
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
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
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
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
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
    fireEvent.click(layer()!);
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
    vi.useFakeTimers();
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!);
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

  it("turns round on a tap while on its way back", () => {
    vi.useFakeTimers();
    const button = renderPicture();
    fireEvent.click(button);
    fireEvent.click(layer()!);
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
    fireEvent.click(layer()!);
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
    fireEvent.click(layer()!);
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
    fireEvent.click(layer()!);
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
    const { unmount } = render(<ZoomableImage class="card-image" src={FLAG} alt="Flag of Afghanistan" />);
    placePicture();
    fireEvent.click(screen.getByRole("button"));
    unmount();
    expect(layer()).toBeNull();
  });
});
