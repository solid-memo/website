import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { alertTexts } from "../test/liveRegions";
import { courseLibraryDeck } from "../test/course";
import { NewcomerCourseOffer } from "./NewcomerCourseOffer";

const course = { ...courseLibraryDeck, forNewcomers: true as const };

function renderOffer(props: Partial<Parameters<typeof NewcomerCourseOffer>[0]> = {}) {
  const onStart = vi.fn();
  render(<NewcomerCourseOffer course={course} aboutHref="#/library-deck" busy={false} error={null} onStart={onStart} {...props} />);
  return { onStart };
}

describe("NewcomerCourseOffer", () => {
  it("offers the course in a landmark named by its title, saying what it is", () => {
    renderOffer();
    const offer = screen.getByRole("complementary", { name: "Solid fundamentals" });
    expect(offer).toHaveTextContent("New here?");
    expect(offer).toHaveTextContent("Every question you answer becomes a card in your deck.");
    expect(offer).toHaveTextContent("Course · 5 cards");
    expect(within(offer).getByRole("link", { name: "About this course" })).toHaveAttribute("href", "#/library-deck");
    expect(alertTexts()).toEqual([]);
  });

  it("marks the title's language when it is not the page's", () => {
    renderOffer({ course: { ...course, title: { sv: "Solids grunder" } } });
    expect(screen.getByText("Solids grunder")).toHaveAttribute("lang", "sv");
    expect(screen.getByRole("complementary", { name: "Solids grunder" })).toBeInTheDocument();
  });

  it("starts the course", () => {
    const { onStart } = renderOffer();
    fireEvent.click(screen.getByRole("button", { name: "Start the course" }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("says it is starting, and starts nothing more until it has", () => {
    const { onStart } = renderOffer({ busy: true });
    const button = screen.getByRole("button", { name: "Starting…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("says why the course could not be started", () => {
    renderOffer({ error: "pod refused" });
    expect(alertTexts()).toEqual(["pod refused"]);
  });
});
