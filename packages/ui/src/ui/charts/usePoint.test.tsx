// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { usePoint } from "./usePoint";

function Points({ points, across }: { points: readonly string[]; across?: number }) {
  const { pointed, keyed, point, keyDown } = usePoint<string>();
  return (
    <div tabIndex={0} role="img" aria-label="Points" onKeyDown={keyDown(points, across)}>
      {points.map((one) => (
        <span key={one} onClick={() => point(one)}>
          {one}
        </span>
      ))}
      <p data-testid="pointed">{`${pointed ?? "none"}${keyed ? " keyed" : ""}`}</p>
    </div>
  );
}

const press = (key: string, modifiers: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(screen.getByRole("img"), { key, ...modifiers });
const pointed = () => screen.getByTestId("pointed").textContent;

describe("usePoint", () => {
  it("steps along a row of points with Left and Right, and stays put past either end", () => {
    render(<Points points={["a", "b", "c"]} />);
    press("ArrowRight");
    expect(pointed()).toBe("a keyed");
    press("ArrowLeft");
    expect(pointed()).toBe("a keyed");
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight");
    expect(pointed()).toBe("c keyed");
    press("Home");
    expect(pointed()).toBe("a keyed");
    press("End");
    expect(pointed()).toBe("c keyed");
  });

  it("starts at the last point on Left, and leaves Up, Down and other keys to the page", () => {
    render(<Points points={["a", "b", "c"]} />);
    press("ArrowLeft");
    expect(pointed()).toBe("c keyed");
    expect(press("ArrowUp")).toBe(true);
    expect(press("ArrowDown")).toBe(true);
    expect(press("Tab")).toBe(true);
    expect(pointed()).toBe("c keyed");
    expect(press("ArrowLeft")).toBe(false);
    expect(pointed()).toBe("b keyed");
  });

  it("lets go on Escape, and leaves Escape to the page with nothing pointed", () => {
    render(<Points points={["a", "b"]} />);
    expect(press("Escape")).toBe(true);
    press("End");
    expect(press("Escape")).toBe(false);
    expect(pointed()).toBe("none");
  });

  it("steps a column with Left and Right and a point with Up and Down in a grid", () => {
    render(<Points points={["1", "2", "3", "4", "5", "6"]} across={3} />);
    press("ArrowUp");
    expect(pointed()).toBe("6 keyed");
    press("ArrowLeft");
    expect(pointed()).toBe("3 keyed");
    press("ArrowLeft");
    expect(pointed()).toBe("3 keyed");
    press("ArrowDown");
    expect(pointed()).toBe("4 keyed");
    press("ArrowUp");
    press("ArrowRight");
    expect(pointed()).toBe("6 keyed");
  });

  it("leaves a key pressed with Alt, Control or Meta to the browser", () => {
    render(<Points points={["a", "b"]} />);
    press("Home");
    expect(press("ArrowRight", { altKey: true })).toBe(true);
    expect(press("End", { ctrlKey: true })).toBe(true);
    expect(press("Escape", { metaKey: true })).toBe(true);
    expect(pointed()).toBe("a keyed");
  });

  it("starts afresh when the point pointed at is no longer among the points", () => {
    const { rerender } = render(<Points points={["a", "b", "c"]} />);
    press("End");
    rerender(<Points points={["a", "b"]} />);
    press("ArrowLeft");
    expect(pointed()).toBe("b keyed");
  });

  it("forgets the keyboard once a point is pointed at or tapped", () => {
    render(<Points points={["a", "b"]} />);
    press("ArrowDown");
    expect(pointed()).toBe("none");
    press("Home");
    fireEvent.click(screen.getByText("b"));
    expect(pointed()).toBe("b");
  });
});
