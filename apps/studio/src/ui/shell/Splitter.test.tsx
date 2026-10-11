// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { Splitter } from "./Splitter";

const size = { min: 100, max: 300, initial: 200 };

/** A splitter over a pane whose size it keeps, as the shell does. */
function Sized({
  orientation,
  onChange,
}: {
  orientation: "vertical" | "horizontal";
  onChange: (value: number) => void;
}) {
  const [value, setValue] = useState(size.initial);
  return (
    <Splitter
      label="Width of the pane"
      controls="pane"
      orientation={orientation}
      value={value}
      size={size}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const splitter = () => screen.getByRole("separator", { name: "Width of the pane" });

describe("Splitter", () => {
  it("is a focusable separator whose value is the pane's size, within its bounds", () => {
    render(<Sized orientation="vertical" onChange={vi.fn()} />);
    expect(splitter()).toHaveAttribute("tabindex", "0");
    expect(splitter()).toHaveAttribute("aria-controls", "pane");
    expect(splitter()).toHaveAttribute("aria-orientation", "vertical");
    expect(splitter()).toHaveAttribute("aria-valuenow", "200");
    expect(splitter()).toHaveAttribute("aria-valuemin", "100");
    expect(splitter()).toHaveAttribute("aria-valuemax", "300");
  });

  it("sizes the pane from the keyboard, and leaves other keys alone", () => {
    const onChange = vi.fn();
    render(<Sized orientation="vertical" onChange={onChange} />);
    expect(fireEvent.keyDown(splitter(), { key: "ArrowLeft" })).toBe(false);
    expect(splitter()).toHaveAttribute("aria-valuenow", "216");
    fireEvent.keyDown(splitter(), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(300);
    fireEvent.keyDown(splitter(), { key: "Home" });
    expect(splitter()).toHaveAttribute("aria-valuenow", "100");
    expect(fireEvent.keyDown(splitter(), { key: "ArrowUp" })).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("sizes the pane as the pointer drags it, along its axis, until it is let go", () => {
    const onChange = vi.fn();
    render(<Sized orientation="horizontal" onChange={onChange} />);
    // Not dragged yet: a move does nothing.
    fireEvent.pointerMove(splitter(), { clientY: 0 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(splitter(), { pointerId: 1, clientX: 900, clientY: 500 });
    fireEvent.pointerMove(splitter(), { clientX: 0, clientY: 460 });
    expect(onChange).toHaveBeenLastCalledWith(240);
    fireEvent.pointerMove(splitter(), { clientY: 0 });
    expect(splitter()).toHaveAttribute("aria-valuenow", "300");
    fireEvent.pointerUp(splitter());
    fireEvent.pointerMove(splitter(), { clientY: 900 });
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(splitter(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerCancel(splitter());
    fireEvent.pointerMove(splitter(), { clientY: 900 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("drags a vertical one sideways", () => {
    const onChange = vi.fn();
    render(<Sized orientation="vertical" onChange={onChange} />);
    fireEvent.pointerDown(splitter(), { pointerId: 1, clientX: 500, clientY: 0 });
    fireEvent.pointerMove(splitter(), { clientX: 530, clientY: 400 });
    expect(onChange).toHaveBeenLastCalledWith(170);
  });
});
