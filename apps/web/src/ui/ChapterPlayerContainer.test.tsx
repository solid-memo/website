import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Course, UseCases } from "@solid-memo/application/useCases";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ChapterPlayerContainer } from "./ChapterPlayerContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseCards, courseInstance, makeCourse, noShuffle } from "../test/course";
import { statusTexts } from "../test/liveRegions";

function renderPlayer(useCases: UseCases, course: Course = makeCourse()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onReview = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ChapterPlayerContainer
        useCases={useCases}
        instance={courseInstance}
        course={course}
        chapter={course.outline.chapters[0]!}
        onReview={onReview}
        random={noShuffle}
      />
    </QueryClientProvider>,
  );
  return { ...view, onReview, invalidate };
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

describe("ChapterPlayerContainer", () => {
  it("takes the chapter a step at a time: the theory, then its questions without it, and on to the final review", async () => {
    const answerCourseQuestion = vi.fn<UseCases["answerCourseQuestion"]>(async (_instance, _deck, _card, choice) => ({
      effect: choice.correct ? "introduce" : "review",
      state: null,
    }));
    const useCases = makeUseCasesFake({ answerCourseQuestion });
    const course = makeCourse();
    const { onReview, invalidate, unmount } = renderPlayer(useCases, course);

    // A step opens on its theory, no question shown.
    expect(screen.getByRole("heading", { level: 2, name: "Linked data" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Step 1 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Things are named by IRIs.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Check your understanding" })).toBeNull();

    // Its questions are asked without it, the check's heading taking the focus.
    fireEvent.click(screen.getByRole("button", { name: "On to the question" }));
    expect(screen.queryByText("Things are named by IRIs.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Check your understanding" })).toHaveFocus();
    expect(screen.getByText("What names a thing?")).toBeInTheDocument();
    answer("An IRI");
    expect(await screen.findByText("Right! Added to your deck.")).toBeInTheDocument();
    expect(answerCourseQuestion).toHaveBeenCalledWith(
      courseInstance.url,
      course.deck,
      courseCards[0],
      { correct: true },
      expect.any(Date),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["course", course.deck.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", course.deck.cardsDocumentUrl] });

    // The next step's heading takes the focus, so its theory is read first.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Step 2 of 2" })).toHaveFocus();
    expect(statusTexts()).toEqual([]);
    expect(screen.getByText("A triple has three terms.")).toBeInTheDocument();
    expect(screen.getByText("Turtle writes them down.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "On to the questions" }));
    expect(screen.queryByText("A triple has three terms.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Check your understanding: question 1 of 2" })).toBeInTheDocument();
    answer("Not Three terms");
    expect(await screen.findByText("Not quite.")).toBeInTheDocument();
    expect(answerCourseQuestion).toHaveBeenLastCalledWith(
      courseInstance.url,
      course.deck,
      courseCards[1],
      { correct: false, distractorId: "q-2-d1" },
      expect.any(Date),
    );

    // A second question of the step follows, still without the theory.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByText("A triple has three terms.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Check your understanding: question 2 of 2" })).toHaveFocus();
    expect(screen.getByText("What is Turtle?")).toBeInTheDocument();
    answer("A syntax");
    fireEvent.click(await screen.findByRole("button", { name: "On to the final review" }));
    expect(onReview).toHaveBeenCalledOnce();

    // The answers graded are kept in the digest as the chapter is left.
    expect(useCases.refreshStudyDigest).not.toHaveBeenCalled();
    unmount();
    expect(useCases.refreshStudyDigest).toHaveBeenCalledWith(courseInstance.url, course.deck);
  });

  it("opens at the step to resume at, on its theory", () => {
    renderPlayer(makeUseCasesFake(), makeCourse(["q-1"]));
    expect(screen.getByRole("heading", { name: "Step 2 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Step 2 of 2" })).not.toHaveFocus();
    expect(screen.getByText("A triple has three terms.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();

    // Its questions follow, the resumed step's first.
    toQuestions();
    expect(screen.queryByText("A triple has three terms.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Check your understanding: question 1 of 2" })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Step 2 of 2" })).not.toHaveFocus();
    expect(screen.getByText("What is a triple?")).toBeInTheDocument();
  });

  it("reads theory in chunks a chunk at a time, and starts every step at its first", async () => {
    const course = makeCourse();
    const [chapter] = course.outline.chapters;
    const chunked = {
      ...course,
      outline: {
        ...course.outline,
        chapters: [
          {
            ...chapter!,
            steps: chapter!.steps.map((step) => ({
              ...step,
              theory: { en: `${step.id} one.\n\n---\n\n${step.id} two.` },
              textFormat: SM.markdown,
            })),
          },
        ],
      },
    };
    renderPlayer(makeUseCasesFake(), chunked);
    expect(screen.getByText("Part 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("s-1 one.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Part 2 of 2")).toHaveFocus();
    expect(screen.getByText("s-1 two.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Part 1 of 2")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    toQuestions();
    answer("An IRI");
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Step 2 of 2" })).toHaveFocus();
    expect(screen.getByText("Part 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("s-2 one.")).toBeInTheDocument();
  });

  it("opens at the first step when every step is done, and writes nothing for practice", async () => {
    const useCases = makeUseCasesFake();
    const { invalidate, unmount } = renderPlayer(useCases, makeCourse(["q-1", "q-2", "q-3"]));
    expect(screen.getByRole("heading", { name: "Step 1 of 2" })).toBeInTheDocument();
    toQuestions();
    answer("An IRI");
    expect(await screen.findByText("Right!")).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["cards", makeCourse().deck.cardsDocumentUrl] });
    unmount();
    expect(useCases.refreshStudyDigest).not.toHaveBeenCalled();
  });

  it("keeps the schedule when the page is hidden, and says why an answer could not be saved", async () => {
    const answerCourseQuestion = vi
      .fn<UseCases["answerCourseQuestion"]>()
      .mockRejectedValueOnce(new Error("pod refused"))
      .mockResolvedValue({ effect: "review", state: null });
    const useCases = makeUseCasesFake({ answerCourseQuestion });
    renderPlayer(useCases);
    toQuestions();
    answer("An IRI");
    expect((await screen.findByText("pod refused")).closest(".error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Right!")).toBeInTheDocument();

    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(useCases.refreshStudyDigest).not.toHaveBeenCalled();
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(useCases.refreshStudyDigest).toHaveBeenCalledOnce());
    // Kept once, until more is graded.
    document.dispatchEvent(new Event("visibilitychange"));
    expect(useCases.refreshStudyDigest).toHaveBeenCalledOnce();
    visibility.mockRestore();
  });

  it("keeps the schedule even when keeping it fails", async () => {
    const useCases = makeUseCasesFake({
      answerCourseQuestion: vi.fn(async () => ({ effect: "introduce" as const, state: null })),
      refreshStudyDigest: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { unmount } = renderPlayer(useCases);
    toQuestions();
    answer("An IRI");
    await screen.findByText("Right! Added to your deck.");
    unmount();
    expect(useCases.refreshStudyDigest).toHaveBeenCalledOnce();
  });
});
