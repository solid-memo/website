import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { CourseContainer } from "./CourseContainer";
import { decksHref, routeToHash } from "./router";
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

  it("says the course is finished once every chapter is, with the way back to the decks", () => {
    const course = makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2]);
    render(<CourseContainer instanceUrl={instanceUrl} course={{ ...course, release: { ...course.release, description: undefined } }} />);
    expect(screen.getByText(/^You have finished this course/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to decks" })).toHaveAttribute("href", decksHref(instanceUrl));
    expect(screen.queryByRole("link", { name: "Continue" })).toBeNull();
    expect(screen.queryByText("A course on Solid.")).toBeNull();
    // Nothing to cheer about: no chapter was just completed.
    expect(document.querySelector(".course-cheer, .course-sparkles, .confetti")).toBeNull();
  });

  it("cheers a chapter just completed, with sparkles on it, above the way on to the next", () => {
    render(
      <CourseContainer
        instanceUrl={instanceUrl}
        course={makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1])}
        justCompleted={{ chapterUrl: CH1, finishedCourse: false }}
      />,
    );
    const cheer = screen.getByText("Well done! You have completed Linked data.").closest(".course-cheer")!;
    // The page focuses it as the learner arrives, so it is read first, and Tab goes on to Continue.
    expect(cheer).toHaveAttribute("data-arrival");
    expect(cheer).toHaveTextContent(/Go on with the next chapter when you are ready, or stop here/);
    expect(cheer.compareDocumentPosition(screen.getByRole("link", { name: "Continue" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", chapter(CH2));

    const first = chapterItem(/Linked data/);
    expect(first).toHaveClass("just-completed");
    const sparkles = first.querySelector(".course-sparkles")!;
    expect(sparkles).toHaveAttribute("aria-hidden", "true");
    // Placed by their index, the same every time.
    expect([...sparkles.children].map((sparkle) => (sparkle as HTMLElement).style.getPropertyValue("--angle"))).toEqual(
      ["0deg", "45deg", "90deg", "135deg", "180deg", "225deg", "270deg", "315deg"],
    );
    expect(within(first).getByText("Done")).toBeInTheDocument();
    expect(chapterItem(/Pods/)).not.toHaveClass("just-completed");
    expect(document.querySelector(".confetti")).toBeNull();
  });

  it("throws confetti when the chapter just completed finished the course", () => {
    render(
      <CourseContainer
        instanceUrl={instanceUrl}
        course={makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2])}
        justCompleted={{ chapterUrl: CH2, finishedCourse: true }}
      />,
    );
    const cheer = screen.getByText(/^Congratulations! That was the last chapter/).closest(".course-cheer")!;
    expect(cheer).toHaveAttribute("data-arrival");
    // No next chapter to go on to: the finished course's way back to the decks follows instead.
    expect(cheer.querySelectorAll("p")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Back to decks" })).toBeInTheDocument();
    expect(chapterItem(/Pods/).querySelector(".course-sparkles")).not.toBeNull();

    const confetti = document.querySelector(".confetti")!;
    expect(confetti).toHaveAttribute("aria-hidden", "true");
    expect(confetti.children).toHaveLength(40);
    const piece = (index: number) => confetti.children[index] as HTMLElement;
    expect(piece(1).style.getPropertyValue("--x")).toBe("37%");
    expect(piece(1).style.getPropertyValue("--drift")).toBe("0rem");
    expect(piece(3).style.getPropertyValue("--delay")).toBe("0.27s");
    expect(piece(3).style.getPropertyValue("--spin")).toBe("900deg");
    // Outside the page's section, whose entrance would otherwise carry it along.
    expect(confetti.closest("section")).toBeNull();
  });
});
