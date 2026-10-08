import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { ChapterReviewContainer } from "./ChapterReviewContainer";
import { routeToHash } from "./router";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CH1, CH2, courseInstance, makeCourse, noShuffle } from "../test/course";

const course = makeCourse(["q-1", "q-2", "q-3"]);

function renderReview(useCases: UseCases, chapterIndex = 0) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ChapterReviewContainer
        useCases={useCases}
        instance={courseInstance}
        course={course}
        chapter={course.outline.chapters[chapterIndex]!}
        random={noShuffle}
      />
    </QueryClientProvider>,
  );
  return { invalidate };
}

/** Answers the question shown, then goes on. */
async function answer(option: string) {
  fireEvent.click(screen.getByRole("radio", { name: option }));
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
}

const rightAnswers = (useCases: UseCases) =>
  vi.mocked(useCases.answerCourseQuestion).mockImplementation(async () => ({ effect: "review", state: null }));

describe("ChapterReviewContainer", () => {
  it("asks every question of the chapter, again until answered right, then completes it", async () => {
    let complete!: (deck: Deck) => void;
    const completeChapter = vi.fn(() => new Promise<Deck>((resolve) => (complete = resolve)));
    const useCases = makeUseCasesFake({ completeChapter });
    rightAnswers(useCases);
    const { invalidate } = renderReview(useCases);

    expect(screen.getByRole("heading", { level: 2, name: "Final review: Linked data" })).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 4")).toBeInTheDocument();
    // Like a step's questions, the review's are asked without the theory.
    expect(document.querySelector(".course-theory")).toBeNull();
    expect(screen.queryByText("Things are named by IRIs.")).toBeNull();
    expect(screen.getByText("What names a thing?").closest(".study-face")).not.toHaveFocus();
    await answer("Hardly An IRI");
    expect(screen.getByText("Question 2 of 5")).toBeInTheDocument();
    expect(screen.getByText("What is a triple?").closest(".study-face")).toHaveFocus();
    await answer("Three terms");
    await answer("A syntax");
    await answer("Data with links");
    expect(completeChapter).not.toHaveBeenCalled();
    expect(screen.getByText("Question 5 of 5")).toBeInTheDocument();
    await answer("An IRI");

    expect(completeChapter).toHaveBeenCalledWith(course.deck, CH1);
    expect(screen.getByText("Completing the chapter…")).toBeInTheDocument();
    complete({ ...course.deck, completedChapters: [CH1] });
    expect(await screen.findByText("Chapter complete. The next one is open.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["course", course.deck.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks", courseInstance.url] });
    expect(screen.getByText("Chapter complete. The next one is open.").closest(".course-review-end")).toHaveFocus();
    expect(screen.getByRole("link", { name: "Next chapter: Pods" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "courseChapter", instanceUrl: courseInstance.url, deckUrl: course.deck.url, chapterUrl: CH2 }),
    );
    // The way back to the course is its breadcrumb: no "Back to …" link.
    expect(screen.queryByRole("link", { name: /^Back/ })).toBeNull();
    expect(screen.queryByText(/^Question/)).toBeNull();
  });

  it("says the course is finished after its last chapter", async () => {
    const useCases = makeUseCasesFake();
    rightAnswers(useCases);
    renderReview(useCases, 1);
    await answer("A store");
    expect(await screen.findByText("Chapter complete. You have finished the course.")).toBeInTheDocument();
    expect(useCases.completeChapter).toHaveBeenCalledWith(course.deck, CH2);
    expect(screen.queryByRole("link", { name: /^Next chapter/ })).toBeNull();
  });

  it("says why the chapter could not be completed, and tries again", async () => {
    const completeChapter = vi
      .fn<UseCases["completeChapter"]>()
      .mockRejectedValueOnce(new Error("pod refused"))
      .mockImplementation(async (deck) => deck);
    const useCases = makeUseCasesFake({ completeChapter });
    rightAnswers(useCases);
    renderReview(useCases, 1);
    await answer("A store");
    expect((await screen.findByText("pod refused")).closest(".error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(completeChapter).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Chapter complete. You have finished the course.")).toBeInTheDocument();
  });
});
