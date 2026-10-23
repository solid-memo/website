// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { CourseStrip, type CourseStripEntry } from "./CourseStrip";

const entry = (fields: Partial<CourseStripEntry> = {}): CourseStripEntry => ({
  key: "deck-1",
  title: { en: "Solid fundamentals" },
  href: "#/course",
  continueHref: "#/course/chapter",
  started: true,
  done: 1,
  count: 3,
  ...fields,
});

describe("CourseStrip", () => {
  it("shows each course's title, the chapters done, and a button to go on", () => {
    render(<CourseStrip entries={[entry()]} />);
    const strip = screen.getByRole("complementary", { name: "Your courses" });
    expect(within(strip).getByRole("heading", { level: 2, name: "Your courses" })).toBeVisible();
    expect(strip).toHaveTextContent(
      "The courses you have added and not finished yet. They run alongside your other decks: you don't need to finish one before adding more from the deck library.",
    );
    expect(strip).toHaveTextContent("1 of 3 chapters done");
    expect(screen.getByRole("link", { name: "Solid fundamentals" })).toHaveAttribute(
      "href",
      "#/course",
    );
    const button = screen.getByRole("link", { name: "Continue Solid fundamentals" });
    expect(button).toHaveTextContent("Continue");
    expect(button).toHaveAttribute("href", "#/course/chapter");
    const bar = screen.getByRole("progressbar", { name: "Chapters done" });
    expect(bar).toHaveAttribute("value", "1");
    expect(bar).toHaveAttribute("max", "3");
    // Without a library to point to, no line about it.
    expect(within(strip).queryByRole("link", { name: "Deck library" })).toBeNull();
    expect(strip).not.toHaveTextContent(/Looking for something to learn/);
  });

  it("points to the deck library under the courses, when given it", () => {
    render(<CourseStrip entries={[entry()]} libraryHref="#/library" />);
    const strip = screen.getByRole("complementary", { name: "Your courses" });
    const line = within(strip).getByText(/^Looking for something to learn\?/);
    expect(line).toHaveTextContent(
      "Looking for something to learn? The deck library has ready-made decks and courses on languages, geography, science, computing and more. Add one now and study it alongside your course.",
    );
    const button = within(strip).getByRole("link", { name: "Deck library" });
    expect(button).toHaveAttribute("href", "#/library");
    expect(button).not.toHaveClass("primary");
    // Under the courses, after their own buttons.
    expect(within(strip).getByRole("list").compareDocumentPosition(line)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("offers to start a course no question of which is answered yet", () => {
    render(<CourseStrip entries={[entry({ started: false, done: 0 })]} />);
    const button = screen.getByRole("link", { name: "Start the course Solid fundamentals" });
    expect(button).toHaveTextContent("Start the course");
    expect(screen.getByText("0 of 3 chapters done")).toBeInTheDocument();
  });

  it("shows nothing without a course to go on with", () => {
    const { container } = render(<CourseStrip entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
