import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/preact";
import { useRef } from "preact/hooks";
import { FLIP_FALLBACK_MS, FLIP_MS, useFlip } from "./useFlip";

/** Rows of no height, by key: on the page, but not on screen. */
let hidden = new Set<string>();
/** Called as the list itself is measured (which settles the rows' styles). */
let onReflow = () => {};

/** A list of rows, one under the other, 40px each; `flip` gets its hook. */
function List({ rows, flip }: { rows: readonly string[]; flip: { current: ReturnType<typeof useFlip> | null } }) {
  const ref = useRef<HTMLUListElement>(null);
  flip.current = useFlip(ref, rows);
  return (
    <ul ref={ref}>
      {rows.map((key) => (
        <li key={key} data-row-key={key}>
          <button type="button">{key}</button>
        </li>
      ))}
    </ul>
  );
}

function renderList(rows: readonly string[]) {
  const flip: { current: ReturnType<typeof useFlip> | null } = { current: null };
  const view = render(<List rows={rows} flip={flip} />);
  return {
    ...view,
    capture: (source?: { key: string; rect: DOMRect }) => flip.current!.capture(source),
    show: (next: readonly string[]) => view.rerender(<List rows={next} flip={flip} />),
  };
}

const row = (key: string) => document.querySelector<HTMLElement>(`[data-row-key="${key}"]`)!;

function setReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reduce } as MediaQueryList);
}

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const SLIDE = `transform ${FLIP_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1)`;

describe("useFlip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hidden = new Set();
    onReflow = () => {};
    setReducedMotion(false);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.dataset.rowKey;
      if (key === undefined) {
        onReflow();
        return new DOMRect();
      }
      const index = [...document.querySelectorAll("[data-row-key]")].indexOf(this);
      return new DOMRect(0, index * 40, 300, hidden.has(key) ? 0 : 40);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("slides each row that moved from where it was, and leaves the rest be", () => {
    const list = renderList(["a", "b", "c"]);
    list.capture();
    list.show(["b", "a", "c"]);
    expect(row("a").style.transition).toBe(SLIDE);
    expect(row("a").style.transform).toBe("");
    expect(row("b").style.transition).toBe(SLIDE);
    expect(row("c").style.transition).toBe("");
    // The slide's end, not that of a control in the row.
    fireEvent.transitionEnd(row("a").querySelector("button")!);
    expect(row("a").style.transition).toBe(SLIDE);
    fireEvent.transitionEnd(row("a"));
    expect(row("a").style.transition).toBe("");
    // Its end never heard: let go all the same.
    wait(FLIP_FALLBACK_MS);
    expect(row("b").style.transition).toBe("");
  });

  it("starts each row from where it was, then lets it go", () => {
    const list = renderList(["a", "b"]);
    const styles: string[] = [];
    onReflow = () => {
      // As the rows are settled where they were, before they are let go.
      styles.push(`${row("a").style.transform} / ${row("a").style.transition}`);
    };
    list.capture();
    list.show(["b", "a"]);
    expect(styles).toEqual(["translate(0px, -40px) / none"]);
  });

  it("settles a dropped row from where it was let go", () => {
    const list = renderList(["a", "b"]);
    const styles: string[] = [];
    onReflow = () => styles.push(row("a").style.transform);
    list.capture({ key: "a", rect: new DOMRect(25, 100, 300, 40) });
    list.show(["b", "a"]);
    expect(styles).toEqual(["translate(25px, 60px)"]);
  });

  it("holds the rows where they were until the edit shows", () => {
    const rows = ["a", "b"];
    const list = renderList(rows);
    list.capture();
    // Shown again, with the edit still on its way.
    list.show(rows);
    list.capture({ key: "a", rect: new DOMRect(0, 200, 300, 40) });
    list.show(rows);
    expect(row("a").style.transform).toBe("translate(0px, 200px)");
    expect(row("a").style.transition).toBe("none");
    expect(row("b").style.transform).toBe("");
    list.show(["b", "a"]);
    expect(row("a").style.transition).toBe(SLIDE);
    expect(row("a").style.transform).toBe("");
  });

  it("lets the rows go should the edit never show", () => {
    const rows = ["a", "b"];
    const list = renderList(rows);
    list.capture({ key: "a", rect: new DOMRect(0, 200, 300, 40) });
    list.show(rows);
    expect(row("a").style.transform).toBe("translate(0px, 200px)");
    wait(FLIP_FALLBACK_MS);
    expect(row("a").style.transform).toBe("");
    expect(row("a").style.transition).toBe(SLIDE);
    // Shown again later: nothing left to play.
    list.show(["a", "b"]);
    expect(row("a").style.transition).toBe(SLIDE);
  });

  it("brings in a row new to the list, or one that was not on screen", () => {
    hidden = new Set(["b"]);
    const list = renderList(["a", "b"]);
    list.capture();
    hidden = new Set(["a"]);
    list.show(["c", "b", "a"]);
    expect(row("c")).toHaveClass("row-enter");
    expect(row("b")).toHaveClass("row-enter");
    // Not on screen now: it neither comes in nor slides.
    expect(row("a")).not.toHaveClass("row-enter");
    expect(row("a").style.transition).toBe("");
    fireEvent.animationEnd(row("c").querySelector("button")!);
    expect(row("c")).toHaveClass("row-enter");
    fireEvent.animationEnd(row("c"));
    expect(row("c")).not.toHaveClass("row-enter");
    wait(FLIP_FALLBACK_MS);
    expect(row("b")).not.toHaveClass("row-enter");
  });

  it("moves nothing under reduced motion, and waits for nothing", () => {
    setReducedMotion(true);
    const list = renderList(["a", "b"]);
    list.capture({ key: "a", rect: new DOMRect(0, 200, 300, 40) });
    list.show(["c", "b", "a"]);
    expect(row("a").style.transform).toBe("");
    expect(row("a").style.transition).toBe("");
    expect(row("c")).not.toHaveClass("row-enter");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends what is under way as the list goes", () => {
    const list = renderList(["a", "b"]);
    list.capture();
    list.show(["b", "a"]);
    const a = row("a");
    list.capture();
    list.unmount();
    expect(a.style.transition).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
});
