import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { makeUseCasesFake } from "../test/useCasesFake";
import { alertTexts, unexpectedText } from "../test/liveRegions";
import { courseDeck, courseInstance, courseLibraryDeck } from "../test/course";
import { NewcomerCourseContainer } from "./NewcomerCourseContainer";
import { libraryDeckHref } from "./router";

const course = { ...courseLibraryDeck, forNewcomers: true as const };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onCourseStarted = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NewcomerCourseContainer useCases={useCases} instance={courseInstance} onCourseStarted={onCourseStarted} />
    </QueryClientProvider>,
  );
  return { ...view, onCourseStarted, queryClient };
}

/** Until the library's read is back and the container shown it: the query tells it on a timer of its own. */
async function librarySettled(queryClient: QueryClient) {
  await waitFor(() => expect(queryClient.getQueryState(["library"])?.status).not.toBe("pending"));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("NewcomerCourseContainer", () => {
  it("offers the course the library names for newcomers, not just any course, linking to its page", async () => {
    const other = { ...courseLibraryDeck, seriesUrl: "https://solid-memo.com/decks/index.ttl#other", title: { en: "Other" } };
    renderContainer(makeUseCasesFake({ listLibraryDecks: vi.fn(async () => [other, course]) }));
    expect(await screen.findByRole("complementary", { name: "Solid fundamentals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About this course" })).toHaveAttribute(
      "href",
      libraryDeckHref(courseInstance.url, course.seriesUrl),
    );
  });

  it("shows nothing while the library loads", () => {
    const { container } = renderContainer(
      makeUseCasesFake({ listLibraryDecks: vi.fn(() => new Promise<never>(() => undefined)) }),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the library cannot be read", async () => {
    const listLibraryDecks = vi.fn(async () => {
      throw new Error("library unreachable");
    });
    const { container, queryClient } = renderContainer(makeUseCasesFake({ listLibraryDecks }));
    await librarySettled(queryClient);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the library names no course for newcomers, though it has a course", async () => {
    const { container, queryClient } = renderContainer(
      makeUseCasesFake({ listLibraryDecks: vi.fn(async () => [courseLibraryDeck]) }),
    );
    await librarySettled(queryClient);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts the course, reads the instance's decks afresh and opens the course's deck", async () => {
    const startCourse = vi.fn(async () => courseDeck);
    const useCases = makeUseCasesFake({ listLibraryDecks: vi.fn(async () => [course]), startCourse });
    const { onCourseStarted } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Start the course" }));
    await waitFor(() => expect(onCourseStarted).toHaveBeenCalledWith(courseDeck));
    expect(startCourse).toHaveBeenCalledWith(courseInstance.url, course);
    expect(useCases.listDecks).toHaveBeenCalledWith(courseInstance.url);
  });

  it("opens the course once started, even when the instance's decks cannot be read afresh", async () => {
    const { onCourseStarted } = renderContainer(
      makeUseCasesFake({
        listLibraryDecks: vi.fn(async () => [course]),
        startCourse: vi.fn(async () => courseDeck),
        listDecks: vi.fn(async () => {
          throw new Error("pod unreachable");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Start the course" }));
    await waitFor(() => expect(onCourseStarted).toHaveBeenCalledWith(courseDeck));
  });

  it("says why the course could not be started", async () => {
    const { onCourseStarted } = renderContainer(
      makeUseCasesFake({
        listLibraryDecks: vi.fn(async () => [course]),
        startCourse: vi.fn(async () => {
          throw new Error("pod refused");
        }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Start the course" }));
    await waitFor(() => expect(alertTexts()).toEqual([unexpectedText("pod refused")]));
    expect(onCourseStarted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start the course" })).not.toHaveAttribute("aria-disabled", "true");
  });
});
