// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseStatistics } from "@solid-memo/application/statistics";
import type { Deck } from "@solid-memo/domain/deck";
import { courseDeck, courseInstance, courseLibraryDeck, RELEASE } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";
import { LIST_LIMIT } from "./bounded";
import { CourseStatisticsContainer, CourseStatisticsView } from "./CourseStatistics";
import { courseHref } from "./router";

// A deck of its own: no copy of any release.
const { sourceUrl: _, ...own } = courseDeck;
const plain: Deck = {
  ...own,
  id: "deck-2",
  url: `${courseInstance.url}catalog.ttl#deck-2`,
  title: { en: "Capitals" },
};
const { isCourse: _course, ...notCourse } = courseLibraryDeck;
const results: CourseStatistics = {
  deck: courseDeck,
  done: 1,
  chapters: [
    {
      url: `${RELEASE}#ch-1`,
      title: { en: "Linked data" },
      state: "done",
      quiz: { answers: 4, right: 3 },
    },
    {
      url: `${RELEASE}#ch-2`,
      title: { en: "RDF" },
      state: "open",
      quiz: { answers: 1, right: 0 },
    },
    {
      url: `${RELEASE}#ch-3`,
      title: { en: "Pods" },
      state: "locked",
      quiz: { answers: 0, right: 0 },
    },
  ],
};

function withQueries(node: preact.ComponentChildren) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}

describe("CourseStatisticsView", () => {
  it("shows each course's chapters done, and where each chapter stands with its graded answers", () => {
    render(<CourseStatisticsView instanceUrl={courseInstance.url} courses={[results]} />);
    const section = screen.getByRole("region", { name: "Your courses" });
    expect(within(section).getByRole("link", { name: "Solid fundamentals" })).toHaveAttribute(
      "href",
      courseHref(courseInstance.url, courseDeck.url),
    );
    expect(section).toHaveTextContent("1 of 3 chapters done");
    const bar = within(section).getByRole("progressbar", { name: "Solid fundamentals" });
    expect(bar).toHaveAttribute("value", "1");
    expect(bar).toHaveAttribute("max", "3");
    const rows = within(section)
      .getAllByRole("row")
      .map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Chapter", "Status", "Graded course answers"],
      ["Linked data", "Done", "75% of 4 answers"],
      ["RDF", "Open", "0% of 1 answer"],
      ["Pods", "Locked", "–"],
    ]);
  });

  it("shows at most LIST_LIMIT chapters of a course, around the one to go on with, and how many more there are", () => {
    const count = 20_000;
    const many: CourseStatistics = {
      deck: courseDeck,
      done: 700,
      chapters: Array.from({ length: count }, (_, at) => ({
        url: `${RELEASE}#c${at}`,
        title: { en: `Title ${at}` },
        state: at < 700 ? "done" : at === 700 ? "open" : "locked",
        quiz: { answers: 0, right: 0 },
      })),
    };
    render(<CourseStatisticsView instanceUrl={courseInstance.url} courses={[many]} />);
    const section = screen.getByRole("region", { name: "Your courses" });
    expect(section).toHaveTextContent("700 of 20,000 chapters done");
    const rows = within(section).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(LIST_LIMIT);
    expect(rows[0]).toHaveTextContent("Title 695");
    expect(rows[5]).toHaveTextContent("Title 700Open");
    expect(section).toHaveTextContent("695 earlier chapters, not listed here.");
    expect(section).toHaveTextContent("And 19,255 more chapters, not listed here.");
  });

  it("shows nothing without a course", () => {
    const { container } = render(
      <CourseStatisticsView instanceUrl={courseInstance.url} courses={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CourseStatisticsContainer", () => {
  it("reads how the decks that are courses have gone, and shows them", async () => {
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [courseLibraryDeck]),
      getCourseStatistics: vi.fn(async () => [results]),
    });
    withQueries(
      <CourseStatisticsContainer
        useCases={useCases}
        instance={courseInstance}
        decks={[plain, courseDeck]}
      />,
    );
    expect(await screen.findByRole("region", { name: "Your courses" })).toBeInTheDocument();
    expect(useCases.getCourseStatistics).toHaveBeenCalledWith(
      courseInstance.url,
      expect.any(Date),
      [courseDeck],
    );
  });

  it("reads nothing, and shows nothing, without a course among the decks", async () => {
    // A copy of a release that is no course.
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [notCourse]),
    });
    const { container } = withQueries(
      <CourseStatisticsContainer
        useCases={useCases}
        instance={courseInstance}
        decks={[plain, courseDeck]}
      />,
    );
    await waitFor(() => expect(useCases.listLibraryDecks).toHaveBeenCalled());
    expect(useCases.getCourseStatistics).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
