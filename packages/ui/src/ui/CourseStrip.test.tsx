// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseSummary } from "@solid-memo/application/courses";
import type { Deck } from "@solid-memo/domain/deck";
import { courseDeck, courseInstance, courseOutline } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CourseStrip, CourseStripContainer, type CourseStripEntry } from "./CourseStrip";

const progressCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@solid-memo/domain/course", async (original) => {
  const real = await original<typeof import("@solid-memo/domain/course")>();
  return {
    ...real,
    courseProgress: (...args: Parameters<typeof real.courseProgress>) => {
      progressCalls.count++;
      return real.courseProgress(...args);
    },
  };
});

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

describe("CourseStripContainer", () => {
  const chapterUrls = courseOutline.chapters.map((chapter) => chapter.url);
  const deckAt = (at: number, fields: Partial<Deck> = {}): Deck => ({
    ...courseDeck,
    id: `course-${at}`,
    url: `${courseInstance.url}catalog.ttl#course-${at}`,
    title: { en: `Course ${at}` },
    completedChapters: [],
    ...fields,
  });

  /** Mounts the strip with summaries that arrive when `arrive` says, and a way to give it other decks. */
  function mount(decks: readonly Deck[]) {
    const waiting = new Map<string, (summary: CourseSummary) => void>();
    const useCases = makeUseCasesFake({
      getCourseSummary: vi.fn(
        (deck: Deck) =>
          new Promise<CourseSummary>((resolve) => {
            waiting.set(deck.url, resolve);
          }),
      ),
      getCourse: vi.fn(() => new Promise<never>(() => undefined)),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const strip = (shown: readonly Deck[]) => (
      <QueryClientProvider client={queryClient}>
        <CourseStripContainer useCases={useCases} instance={courseInstance} decks={shown} />
      </QueryClientProvider>
    );
    const view = render(strip(decks));
    return {
      rerender: (shown: readonly Deck[]) => view.rerender(strip(shown)),
      arrive: async (deck: Deck) => {
        await waitFor(() => expect(waiting.has(deck.url)).toBe(true));
        await act(async () => {
          waiting.get(deck.url)!({ outline: courseOutline, answeredCardIds: [] });
        });
      },
    };
  }

  beforeEach(() => {
    progressCalls.count = 0;
  });

  it("works out each course's progress once as the summaries arrive one by one", async () => {
    const decks = Array.from({ length: 12 }, (_, at) => deckAt(at));
    const { arrive, rerender } = mount(decks);
    for (const [at, deck] of decks.entries()) {
      await arrive(deck);
      await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(at + 1));
    }
    expect(progressCalls.count).toBe(decks.length);
    // Nor does a render with nothing new work anything out again.
    rerender(decks);
    expect(progressCalls.count).toBe(decks.length);
  });

  it("works a course's progress out again when its completed chapters change", async () => {
    const first = deckAt(0);
    const other = deckAt(1);
    const { arrive, rerender } = mount([first, other]);
    await arrive(first);
    await arrive(other);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(progressCalls.count).toBe(2);
    rerender([deckAt(0, { completedChapters: [chapterUrls[0]!] }), other]);
    await screen.findByText("1 of 2 chapters done");
    expect(progressCalls.count).toBe(3);
  });

  it("leaves a finished course out, without working it out on each render", async () => {
    const finished = deckAt(0, { completedChapters: chapterUrls });
    const { arrive, rerender } = mount([finished]);
    await arrive(finished);
    await waitFor(() => expect(progressCalls.count).toBe(1));
    expect(screen.queryByRole("listitem")).toBeNull();
    rerender([finished]);
    expect(progressCalls.count).toBe(1);
  });

  it("takes a course's title and links from the deck, whatever its progress was worked out for", async () => {
    const before = deckAt(0);
    const { arrive, rerender } = mount([before]);
    await arrive(before);
    await screen.findByRole("link", { name: "Course 0" });
    rerender([{ ...before, title: { en: "Renamed" } }]);
    await screen.findByRole("link", { name: "Renamed" });
    expect(progressCalls.count).toBe(1);
  });
});
