// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { FramedPage, isFramed } from "./Framed";

/** A window as a frame's page sees it: itself, and the window at the top. */
function windowWith(top: object | null): Window {
  const win = {} as { self: unknown; top: unknown };
  win.self = win;
  win.top = top ?? win;
  return win as unknown as Window;
}

describe("isFramed", () => {
  it("is false for a page in a tab of its own", () => {
    expect(isFramed(windowWith(null))).toBe(false);
    expect(isFramed(window)).toBe(false);
  });

  it("is true for a page in another page's frame, whatever its origin", () => {
    expect(isFramed(windowWith({}))).toBe(true);
  });
});

describe("FramedPage", () => {
  it("says the page opens only on its own, with a link to it in a new tab and nothing else to press", () => {
    render(<FramedPage locale="en" appName="Memo Site" href="https://memo.example/#/studio" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Open this page in a tab of its own" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open it in a new tab" });
    expect(link).toHaveAttribute("href", "https://memo.example/#/studio");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.title).toBe("Open this page in a tab of its own – Memo Site");
  });

  it("speaks the learner's language", () => {
    render(<FramedPage locale="sv" href="https://memo.example/" />);
    expect(screen.getByRole("link", { name: "Öppna den i en ny flik" })).toBeInTheDocument();
  });
});
