// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/preact";
import { RowFlair } from "./RowFlair";

/** An IntersectionObserver whose callback the test calls, with what it was asked. */
function stubObserver() {
  const observed: Element[] = [];
  const disconnect = vi.fn();
  let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof report) {
        report = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect = disconnect;
    },
  );
  return {
    observed,
    disconnect,
    report: (isIntersecting: boolean) => act(() => report([{ isIntersecting }])),
  };
}

const flair = (container: Element) => container.querySelector<HTMLElement>(".row-flair")!;
const layout = (container: Element) =>
  [...container.querySelectorAll<HTMLElement>(".row-star")].map((one) => one.getAttribute("style"));

describe("RowFlair", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is decoration alone, seen at once where the browser cannot tell what is in view", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<RowFlair completion="deck" variant={0} />);
    expect(flair(container)).toHaveAttribute("aria-hidden", "true");
    expect(flair(container)).toHaveClass("seen");
    // One large star, and five small ones taking turns on the top and bottom lines, left to right.
    expect(container.querySelectorAll(".row-star.big")).toHaveLength(1);
    const small = [...container.querySelectorAll(".row-star:not(.big)")];
    expect(small.map((star) => star.classList[1])).toEqual([
      "top",
      "bottom",
      "top",
      "bottom",
      "top",
    ]);
    expect(small[0]!.getAttribute("style")).toMatch(
      /^--x: 0\.05; --size: 1\.5rem; --tilt: -12deg; --delay: 0\.15s;?$/,
    );
    expect(small[4]!.getAttribute("style")).toMatch(/--delay: 0\.47s/);
    // The room the large star takes: its distance from the row's end, and its width with its corners.
    expect(flair(container).getAttribute("style")).toMatch(/^--reserve: 10\.25rem; --fit: 0\.2;?$/);
  });

  it("waits to be seen until the row comes into view, then stays seen", () => {
    const observer = stubObserver();
    const { container, unmount } = render(<RowFlair completion="deck" variant={0} />);
    expect(flair(container)).not.toHaveClass("seen");
    expect(observer.observed).toEqual([flair(container)]);
    observer.report(false);
    expect(flair(container)).not.toHaveClass("seen");
    observer.report(true);
    expect(flair(container)).toHaveClass("seen");
    expect(observer.disconnect).toHaveBeenCalled();
    unmount();
  });

  it("stops watching a row gone before it was seen", async () => {
    const observer = stubObserver();
    const { unmount } = render(<RowFlair completion="course" variant={0} />);
    unmount();
    await waitFor(() => expect(observer.disconnect).toHaveBeenCalledOnce());
  });

  it("lays neighboring rows out differently, a finished course with more stars, the layouts going round", () => {
    const of = (completion: "deck" | "course", variant: number) =>
      layout(render(<RowFlair completion={completion} variant={variant} />).container);
    const decks = [0, 1, 2, 3].map((variant) => of("deck", variant).join());
    expect(new Set(decks).size).toBe(4);
    expect(of("deck", 4)).toEqual(of("deck", 0));
    const courses = [0, 1, 2].map((variant) => of("course", variant).join());
    expect(new Set(courses).size).toBe(3);
    expect(of("course", 3)).toEqual(of("course", 0));
    expect(of("course", 0).length).toBeGreaterThan(of("deck", 0).length);
  });
});
