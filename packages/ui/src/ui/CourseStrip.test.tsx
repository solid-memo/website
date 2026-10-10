import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
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
    expect(strip).toHaveTextContent("1 of 3 chapters done");
    expect(screen.getByRole("link", { name: "Solid fundamentals" })).toHaveAttribute("href", "#/course");
    const button = screen.getByRole("link", { name: "Continue Solid fundamentals" });
    expect(button).toHaveTextContent("Continue");
    expect(button).toHaveAttribute("href", "#/course/chapter");
    const bar = screen.getByRole("progressbar", { name: "Chapters done" });
    expect(bar).toHaveAttribute("value", "1");
    expect(bar).toHaveAttribute("max", "3");
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
