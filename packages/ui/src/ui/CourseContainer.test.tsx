import type { ComponentChild, ComponentProps } from "preact";
import { describe, expect, it, vi } from "vitest";
import { render as renderView, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { CourseContainer } from "./CourseContainer";
import { CourseLinksContext, type CourseLinks } from "./courseLinks";
import { decksHref, routeToHash } from "./router";
import { CH1, CH2, courseDeck, courseInstance, makeCourse } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";

const instanceUrl = courseInstance.url;
const deckUrl = courseDeck.url;
const chapter = (chapterUrl: string) => routeToHash({ screen: "courseChapter", instanceUrl, deckUrl, chapterUrl });
const review = (chapterUrl: string) => routeToHash({ screen: "courseReview", instanceUrl, deckUrl, chapterUrl });

/** The page, as Workspace gives it the course: the use cases offer no newer release unless told to. */
function Page({
  useCases = makeUseCasesFake(),
  ...props
}: Omit<ComponentProps<typeof CourseContainer>, "useCases" | "instance"> & { useCases?: UseCases }) {
  return <CourseContainer useCases={useCases} instance={courseInstance} {...props} />;
}

function render(page: ComponentChild) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderView(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function chapterItem(name: RegExp): HTMLElement {
  return screen.getByRole("heading", { name }).closest("li")!;
}

describe("CourseContainer", () => {
  it("offers a newer release of the course, as the deck's page does", async () => {
    const plan: LibraryUpgradePlan = {
      fromVersion: "1",
      toVersion: "2",
      releaseUrl: "https://solid-memo.com/decks/solid/v2.ttl",
      notes: [{ version: "2", notes: "The theory in chunks." }],
      add: [],
      change: [],
      retire: [],
      restore: [],
      remove: [],
      kept: [],
      applied: [],
      gone: [],
      appliedAbout: [],
      outline: true,
    };
    const useCases = makeUseCasesFake({ planLibraryUpgrade: vi.fn(async () => plan) });
    const course = makeCourse();
    render(<Page useCases={useCases} course={course} />);
    const offer = await screen.findByRole("region", { name: "Newer library release" });
    expect(offer).toHaveTextContent(/Updating updates the course's chapters, steps or theory\./);
    expect(within(offer).getByRole("button", { name: "Update to release 2" })).toBeInTheDocument();
    expect(useCases.planLibraryUpgrade).toHaveBeenCalledWith(course.deck);
    // Under the blurb, above the way on.
    expect(screen.getByText("A course on Solid.").compareDocumentPosition(offer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(offer.compareDocumentPosition(screen.getByRole("link", { name: "Start the course" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows the course and its chapters, the first open and the rest locked, and starts at the first", () => {
    render(<Page course={makeCourse()} />);
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
    const { unmount } = render(<Page course={makeCourse(["q-1"])} />);
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", chapter(CH1));
    expect(screen.getByText("1 of 2 steps done")).toBeInTheDocument();
    unmount();

    render(<Page course={makeCourse(["q-1", "q-2", "q-3"])} />);
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", review(CH1));
    expect(within(chapterItem(/Linked data/)).getByRole("link")).toHaveAttribute("href", review(CH1));
  });

  it("opens the next chapter once one is completed, the one completed still open to practise", () => {
    render(<Page course={makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1])} />);
    expect(screen.getByText("1 of 2 chapters done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", chapter(CH2));
    const first = chapterItem(/Linked data/);
    expect(within(first).getByText("Done")).toBeInTheDocument();
    expect(within(first).getByRole("link")).toHaveAttribute("href", chapter(CH1));
    expect(within(chapterItem(/Pods/)).getByRole("link", { name: "Pods" })).toHaveAttribute("href", chapter(CH2));
  });

  it("links its chapters where the course links say, and no way back to the decks where they say none", () => {
    const links: CourseLinks = {
      courseHref: (_instance, deckUrl) => `#/trial/${deckUrl}`,
      chapterHref: (_instance, _deck, chapterUrl) => `#/trial/${chapterUrl}`,
      reviewHref: (_instance, _deck, chapterUrl) => `#/trial/review/${chapterUrl}`,
    };
    const { unmount } = render(
      <CourseLinksContext.Provider value={links}>
        <Page course={makeCourse()} />
      </CourseLinksContext.Provider>,
    );
    expect(screen.getByRole("link", { name: "Start the course" })).toHaveAttribute("href", `#/trial/${CH1}`);
    unmount();
    const second = render(
      <CourseLinksContext.Provider value={links}>
        <Page course={makeCourse(["q-1", "q-2", "q-3"])} />
      </CourseLinksContext.Provider>,
    );
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", `#/trial/review/${CH1}`);
    second.unmount();
    render(
      <CourseLinksContext.Provider value={links}>
        <Page course={makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2])} />
      </CourseLinksContext.Provider>,
    );
    expect(screen.getByText(/^You have finished this course/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to decks" })).toBeNull();
  });

  it("says the course is finished once every chapter is, with the way back to the decks", () => {
    const course = makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2]);
    render(<Page course={{ ...course, release: { ...course.release, description: undefined } }} />);
    expect(screen.getByText(/^You have finished this course/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to decks" })).toHaveAttribute("href", decksHref(instanceUrl));
    expect(screen.queryByRole("link", { name: "Continue" })).toBeNull();
    expect(screen.queryByText("A course on Solid.")).toBeNull();
    // Nothing to cheer about: no chapter was just completed.
    expect(document.querySelector(".course-cheer, .course-sparkles, .confetti")).toBeNull();
  });

  it("cheers a chapter just completed, with sparkles on it, above the way on to the next", () => {
    render(
      <Page
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
      <Page
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
    // Three shooters along the bottom pop one after the other: left, right, then the middle.
    const shooters = [...confetti.children] as HTMLElement[];
    expect(shooters.map((shooter) => shooter.className)).toEqual(Array(3).fill("confetti-shooter"));
    expect(shooters.map((shooter) => shooter.style.getPropertyValue("--x"))).toEqual(["15%", "85%", "50%"]);
    expect(shooters.map((shooter) => shooter.style.getPropertyValue("--delay"))).toEqual(["0s", "0.28s", "0.56s"]);
    for (const shooter of shooters) expect(shooter.children).toHaveLength(24);
    const flight = (shooter: number, index: number) =>
      ["--dx", "--rise", "--sway", "--spin", "--flip", "--time", "--jitter"].map((name) =>
        (shooters[shooter]!.children[index] as HTMLElement).style.getPropertyValue(name),
      );
    // The left shooter leans right, the right one left, each piece at its own angle, height and pace.
    expect(flight(0, 0)).toEqual(["15.72vw", "47.68vh", "-1.84vw", "-540deg", "1080deg", "3.99s", "0.01s"]);
    expect(flight(1, 0)).toEqual(["-25.03vw", "70.98vh", "-1.2vw", "-540deg", "1080deg", "3.53s", "0.07s"]);
    expect(flight(2, 3)).toEqual(["-5.5vw", "65.13vh", "2.2vw", "360deg", "1080deg", "3.04s", "0.06s"]);
    // Every piece has landed within five seconds (WCAG 2.2.2): its shooter's pop, its own jitter, its flight.
    const seconds = (element: HTMLElement, name: string) => parseFloat(element.style.getPropertyValue(name));
    for (const shooter of shooters) {
      for (const piece of shooter.children as HTMLCollectionOf<HTMLElement>) {
        expect(seconds(shooter, "--delay") + seconds(piece, "--jitter") + seconds(piece, "--time")).toBeLessThan(5);
      }
    }
    // Outside the page's section, whose entrance would otherwise carry it along.
    expect(confetti.closest("section")).toBeNull();
  });
});
