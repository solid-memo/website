// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CoursePreviewContainer } from "./CoursePreviewContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import {
  courseLibraryDeck,
  makeCourse,
  makeSteplessCourse,
  noShuffle,
  RELEASE,
} from "../test/course";

function renderPreview({
  useCases = makeUseCasesFake({ getLibraryCourse: vi.fn(async () => makeCourse()) }),
  chapterId,
}: {
  useCases?: UseCases;
  chapterId?: string;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChapter = vi.fn();
  const onExit = vi.fn();
  const preview = (id?: string) => (
    <QueryClientProvider client={queryClient}>
      <CoursePreviewContainer
        useCases={useCases}
        deck={courseLibraryDeck}
        deckHref="#/library-deck?deck=solid"
        chapterId={id}
        chapterHref={(chapter) =>
          `#/library-preview?deck=solid${chapter ? `&chapter=${chapter}` : ""}`
        }
        onChapter={onChapter}
        onExit={onExit}
        random={noShuffle}
      />
    </QueryClientProvider>
  );
  const view = render(preview(chapterId));
  return { ...view, onChapter, onExit, open: (id?: string) => view.rerender(preview(id)) };
}

/** Leaves the step's theory for its questions. */
function toQuestions() {
  fireEvent.click(screen.getByRole("button", { name: /^On to the question/ }));
}

/** Chooses the option and checks it. */
function answer(option: string) {
  fireEvent.click(screen.getByRole("radio", { name: option }));
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
}

describe("CoursePreviewContainer", () => {
  it("reads the course, then lists its chapters, each linked to its preview", async () => {
    const getLibraryCourse = vi.fn(async () => makeCourse());
    const { onExit } = renderPreview({ useCases: makeUseCasesFake({ getLibraryCourse }) });

    expect(screen.getByText("Loading the course…")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Preview: Solid fundamentals" }),
    ).toBeInTheDocument();
    expect(getLibraryCourse).toHaveBeenCalledWith(courseLibraryDeck);
    expect(screen.getByRole("link", { name: "Solid fundamentals" })).toHaveAttribute(
      "href",
      "#/library-deck?deck=solid",
    );
    expect(screen.getByText(/Nothing is recorded/)).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Chapter 1: Linked data",
    );
    expect(within(first!).getByRole("link", { name: "Linked data" })).toHaveAttribute(
      "href",
      "#/library-preview?deck=solid&chapter=ch-1",
    );
    expect(within(first!).getByText("Names and links.")).toBeInTheDocument();
    expect(within(first!).getByText("2 steps")).toBeInTheDocument();
    expect(within(second!).getByRole("link", { name: "Pods" })).toHaveAttribute(
      "href",
      "#/library-preview?deck=solid&chapter=ch-2",
    );
    expect(within(second!).getByText("1 step")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "All chapters" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to library" }));
    expect(onExit).toHaveBeenCalled();
  });

  it("plays a chapter as the course does, each step's theory before its questions, recording nothing", async () => {
    const answerCourseQuestion = vi.fn<UseCases["answerCourseQuestion"]>();
    const { onChapter } = renderPreview({
      useCases: makeUseCasesFake({
        getLibraryCourse: vi.fn(async () => makeCourse()),
        answerCourseQuestion,
      }),
      chapterId: "ch-1",
    });

    expect(await screen.findByText("Things are named by IRIs.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Linked data" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Step 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All chapters" })).toHaveAttribute(
      "href",
      "#/library-preview?deck=solid",
    );
    expect(screen.queryByRole("list")).toBeNull();

    toQuestions();
    expect(screen.queryByText("Things are named by IRIs.")).toBeNull();
    answer("Not An IRI");
    expect(screen.getByRole("status")).toHaveTextContent(/^Not quite\.$/);
    expect(document.querySelector(".course-why")).toHaveTextContent(/^Why not: Why not An IRI$/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Step 2 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Turtle writes them down.")).toBeInTheDocument();
    toQuestions();
    answer("Three terms");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    answer("A syntax");
    // The chapter's final review is left out: its review question is never asked.
    fireEvent.click(screen.getByRole("button", { name: "On to the next chapter" }));
    expect(onChapter).toHaveBeenCalledWith("ch-2");
    expect(answerCourseQuestion).not.toHaveBeenCalled();
  });

  it("goes back to the chapters after the last chapter, and starts each chapter opened at its first step", async () => {
    const { onChapter, open } = renderPreview({ chapterId: "ch-2" });

    expect(await screen.findByText("A pod stores data.")).toBeInTheDocument();
    toQuestions();
    answer("A store");
    fireEvent.click(screen.getByRole("button", { name: "Back to the chapters" }));
    expect(onChapter).toHaveBeenCalledWith(undefined);

    open("ch-1");
    expect(screen.getByRole("heading", { name: "Step 1 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Things are named by IRIs.")).toBeInTheDocument();
  });

  it("reads a step's theory a chunk at a time", async () => {
    const course = makeCourse();
    const [chapter, ...rest] = course.outline.chapters;
    const [first, ...steps] = chapter!.steps;
    const chunked = {
      ...course,
      outline: {
        ...course.outline,
        chapters: [
          {
            ...chapter!,
            steps: [
              { ...first!, theory: { en: "One.\n\n---\n\nTwo." }, textFormat: SM.markdown },
              ...steps,
            ],
          },
          ...rest,
        ],
      },
    };
    renderPreview({
      useCases: makeUseCasesFake({ getLibraryCourse: vi.fn(async () => chunked) }),
      chapterId: "ch-1",
    });

    expect(await screen.findByText("Part 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("One.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Part 2 of 2")).toHaveFocus();
    expect(screen.getByText("Two.")).toBeInTheDocument();
  });

  it("leaves out a chapter with no step, and lists the chapters for one it doesn't have", async () => {
    renderPreview({
      useCases: makeUseCasesFake({ getLibraryCourse: vi.fn(async () => makeSteplessCourse()) }),
      chapterId: "ch-1",
    });

    expect(await screen.findByRole("link", { name: "Pods" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Chapter 1: Pods");
    expect(screen.queryByRole("link", { name: "Linked data" })).toBeNull();
  });

  it("says so when the course has no chapters", async () => {
    renderPreview({
      useCases: makeUseCasesFake({
        getLibraryCourse: vi.fn(async () => ({
          outline: { releaseUrl: RELEASE, chapters: [] },
          cards: new Map(),
        })),
      }),
    });

    expect(await screen.findByText("This course has no chapters.")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is recorded/)).toBeNull();
  });

  it("shows why the course could not be read", async () => {
    renderPreview({
      useCases: makeUseCasesFake({
        getLibraryCourse: vi.fn(async () => {
          throw new Error("library offline");
        }),
      }),
    });

    expect((await screen.findByText("library offline")).closest(".error")).toBeInTheDocument();
  });
});
