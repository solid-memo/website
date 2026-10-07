import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { CourseContainer } from "./CourseContainer";
import { routeToHash } from "./router";
import { CH1, CH2, courseDeck, courseInstance, makeCourse } from "../test/course";

const instanceUrl = courseInstance.url;
const deckUrl = courseDeck.url;
const chapter = (chapterUrl: string) => routeToHash({ screen: "courseChapter", instanceUrl, deckUrl, chapterUrl });
const review = (chapterUrl: string) => routeToHash({ screen: "courseReview", instanceUrl, deckUrl, chapterUrl });

function chapterItem(name: RegExp): HTMLElement {
  return screen.getByRole("heading", { name }).closest("li")!;
}

describe("CourseContainer", () => {
  it("shows the course and its chapters, the first open and the rest locked, and starts at the first", () => {
    render(<CourseContainer instanceUrl={instanceUrl} course={makeCourse()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Solid fundamentals" })).toBeInTheDocument();
    expect(screen.getByText("A course on Solid.")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 chapters done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start the course" })).toHaveAttribute("href", chapter(CH1));

    const first = chapterItem(/Linked data/);
    expect(within(first).getByRole("link", { name: "Linked data" })).toHaveAttribute("href", chapter(CH1));
    expect(within(first).getByText("Open")).toBeInTheDocument();
    expect(within(first).getByText("Names and links.")).toBeInTheDocument();
    expect(within(first).getByText("0 of 2 steps done")).toBeInTheDocument();

    const second = chapterItem(/Pods/);
    expect(within(second).queryByRole("link")).toBeNull();
    expect(within(second).getByText("Locked")).toBeInTheDocument();
    expect(within(second).getByText("0 of 1 step done")).toBeInTheDocument();
  });

  it("continues where the learner left off: at a chapter's steps, or its final review once they are done", () => {
    const { unmount } = render(<CourseContainer instanceUrl={instanceUrl} course={makeCourse(["q-1"])} />);
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", chapter(CH1));
    expect(screen.getByText("1 of 2 steps done")).toBeInTheDocument();
    unmount();

    render(<CourseContainer instanceUrl={instanceUrl} course={makeCourse(["q-1", "q-2", "q-3"])} />);
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", review(CH1));
    expect(within(chapterItem(/Linked data/)).getByRole("link")).toHaveAttribute("href", review(CH1));
  });

  it("opens the next chapter once one is completed, the one completed still open to practise", () => {
    render(<CourseContainer instanceUrl={instanceUrl} course={makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1])} />);
    expect(screen.getByText("1 of 2 chapters done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", chapter(CH2));
    const first = chapterItem(/Linked data/);
    expect(within(first).getByText("Done")).toBeInTheDocument();
    expect(within(first).getByRole("link")).toHaveAttribute("href", chapter(CH1));
    expect(within(chapterItem(/Pods/)).getByRole("link", { name: "Pods" })).toHaveAttribute("href", chapter(CH2));
  });

  it("says the course is finished once every chapter is", () => {
    const course = makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2]);
    render(<CourseContainer instanceUrl={instanceUrl} course={{ ...course, release: { ...course.release, description: undefined } }} />);
    expect(screen.getByText(/^You have finished this course/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue" })).toBeNull();
    expect(screen.queryByText("A course on Solid.")).toBeNull();
  });
});
