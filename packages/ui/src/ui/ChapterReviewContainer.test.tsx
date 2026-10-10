import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { ChapterReviewContainer } from "./ChapterReviewContainer";
import { APP_COURSE_LINKS, CourseLinksContext, type CourseLinks } from "./courseLinks";
import { courseHref } from "./router";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CH1, CH2, courseInstance, makeCourse, noShuffle } from "../test/course";

const course = makeCourse(["q-1", "q-2", "q-3"]);

function renderReview(useCases: UseCases, chapterIndex = 0, reviewed = course, links: CourseLinks = APP_COURSE_LINKS) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onCompleted = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <CourseLinksContext.Provider value={links}>
        <ChapterReviewContainer
          useCases={useCases}
          instance={courseInstance}
          course={reviewed}
          chapter={reviewed.outline.chapters[chapterIndex]!}
          onCompleted={onCompleted}
          random={noShuffle}
        />
      </CourseLinksContext.Provider>
    </QueryClientProvider>,
  );
  return { invalidate, onCompleted, unmount };
}

/** Starts the review, past the word before it. */
function start() {
  fireEvent.click(screen.getByRole("button", { name: "Start the final review" }));
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
  it("opens on a word before the review, with the way on to it and back to the chapters", () => {
    const useCases = makeUseCasesFake();
    renderReview(useCases);
    expect(screen.getByRole("heading", { level: 2, name: "Final review: Linked data" })).toBeInTheDocument();
    expect(screen.getByText("Well done: you have worked through every step of this chapter!")).toBeInTheDocument();
    expect(screen.getByText(/^Now the final review: every question of the chapter once more, shuffled/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the chapters" })).toHaveAttribute(
      "href",
      courseHref(courseInstance.url, course.deck.url),
    );
    // No question yet, nor how many there are.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/^Question/)).toBeNull();

    start();
    expect(screen.queryByRole("link", { name: "Back to the chapters" })).toBeNull();
    expect(screen.getByText("Question 1 of 4")).toBeInTheDocument();
    // The button is gone: the first question takes the focus, as each after it does.
    expect(screen.getByText("What names a thing?").closest(".study-face")).toHaveFocus();
  });

  it("asks every question of the chapter, again until answered right, then completes it", async () => {
    let complete!: (deck: Deck) => void;
    const completeChapter = vi.fn(() => new Promise<Deck>((resolve) => (complete = resolve)));
    const useCases = makeUseCasesFake({ completeChapter });
    rightAnswers(useCases);
    const { invalidate, onCompleted } = renderReview(useCases);
    start();

    expect(screen.getByText("Question 1 of 4")).toBeInTheDocument();
    // Like a step's questions, the review's are asked without the theory.
    expect(document.querySelector(".course-theory")).toBeNull();
    expect(screen.queryByText("Things are named by IRIs.")).toBeNull();
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
    expect(screen.getByText("Completing the chapter…").closest(".course-review-end")).toHaveFocus();
    expect(screen.queryByText(/^Question/)).toBeNull();
    expect(onCompleted).not.toHaveBeenCalled();
    complete({ ...course.deck, completedChapters: [CH1] });
    // The course is read afresh first, so the course's page shows the chapter done.
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(false));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["course", course.deck.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks", courseInstance.url] });
  });

  it("links back to the course's page where the course links say", () => {
    renderReview(makeUseCasesFake(), 0, course, { ...APP_COURSE_LINKS, courseHref: (_instance, deckUrl) => `#/trial/${deckUrl}` });
    expect(screen.getByRole("link", { name: "Back to the chapters" })).toHaveAttribute("href", `#/trial/${course.deck.url}`);
  });

  it("leaves a learner who goes elsewhere while the chapter is completed where they went", async () => {
    let complete!: (deck: Deck) => void;
    const completeChapter = vi.fn(() => new Promise<Deck>((resolve) => (complete = resolve)));
    const useCases = makeUseCasesFake({ completeChapter });
    rightAnswers(useCases);
    const { invalidate, onCompleted, unmount } = renderReview(useCases, 1);
    start();
    await answer("A store");
    expect(screen.getByText("Completing the chapter…")).toBeInTheDocument();

    // The learner leaves the review, as for the deck list.
    act(() => {
      unmount();
    });
    complete({ ...course.deck, completedChapters: [CH2] });
    // The course is still read afresh, but nothing takes the learner anywhere.
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks", courseInstance.url] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["course", course.deck.url] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("says the course is finished by its last chapter left, and not by one retaken", async () => {
    const useCases = makeUseCasesFake();
    rightAnswers(useCases);
    const { onCompleted } = renderReview(useCases, 1, makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1]));
    start();
    await answer("A store");
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(true));
    expect(useCases.completeChapter).toHaveBeenCalledWith(expect.anything(), CH2);
    cleanup();

    const retaken = renderReview(useCases, 1, makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2]));
    start();
    await answer("A store");
    await waitFor(() => expect(retaken.onCompleted).toHaveBeenCalledWith(false));
  });

  it("says why the chapter could not be completed, and tries again", async () => {
    const completeChapter = vi
      .fn<UseCases["completeChapter"]>()
      .mockRejectedValueOnce(new Error("pod refused"))
      .mockImplementation(async (deck) => deck);
    const useCases = makeUseCasesFake({ completeChapter });
    rightAnswers(useCases);
    const { onCompleted } = renderReview(useCases, 1);
    start();
    await answer("A store");
    expect((await screen.findByText("pod refused")).closest(".course-review-end")).toHaveFocus();
    expect(onCompleted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(completeChapter).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
  });
});
