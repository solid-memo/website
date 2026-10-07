import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { choicesOf } from "@solid-memo/domain/course";
import { CourseQuestion, type CheckedAnswer } from "./CourseQuestion";
import { courseCards, noShuffle } from "../test/course";
import { statusTexts } from "../test/liveRegions";

const card = courseCards[0]!;
const choices = choicesOf(card, noShuffle);
const [right, explained, unexplained] = choices as [(typeof choices)[0], (typeof choices)[0], (typeof choices)[0]];

function renderQuestion(props: Partial<Parameters<typeof CourseQuestion>[0]> = {}) {
  const onCheck = vi.fn();
  const onNext = vi.fn();
  const view = render(
    <CourseQuestion
      card={card}
      choices={choices}
      answer={null}
      focusQuestion={false}
      busy={false}
      error={null}
      nextLabel="Next"
      onCheck={onCheck}
      onNext={onNext}
      {...props}
    />,
  );
  return { ...view, onCheck, onNext };
}

describe("CourseQuestion", () => {
  it("asks the card's front among its options, the back's note kept back", () => {
    const { onCheck } = renderQuestion();
    expect(screen.getByRole("radiogroup", { name: "Question: What names a thing?" })).toBeInTheDocument();
    expect(screen.queryByText("IRIs name anything.")).toBeNull();
    expect(statusTexts()).toEqual([]);
    fireEvent.click(screen.getByRole("radio", { name: "Not An IRI" }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(onCheck).toHaveBeenCalledWith(explained);
  });

  it("takes the focus to the question only when asked to", () => {
    renderQuestion();
    expect(document.body).toHaveFocus();
    renderQuestion({ focusQuestion: true });
    expect(screen.getAllByText("What names a thing?")[1]!.closest(".study-face")).toHaveFocus();
  });

  it("says a right answer that brought the card into the deck, and shows the answer with its note", () => {
    const { rerender, onNext } = renderQuestion();
    const answer: CheckedAnswer = { choice: right, effect: "introduce" };
    rerender(
      <CourseQuestion
        card={card}
        choices={choices}
        answer={answer}
        focusQuestion={false}
        busy={false}
        error={null}
        nextLabel="Next"
        onCheck={vi.fn()}
        onNext={onNext}
      />,
    );
    expect(statusTexts()).toEqual(["Right! Added to your deck."]);
    expect(screen.getByRole("status")).toHaveClass("right");
    expect(screen.getByText("IRIs name anything.")).toBeInTheDocument();
    expect(screen.queryByText(/^Why not:/)).toBeNull();
    const feedback = screen.getByText("IRIs name anything.").closest(".course-feedback")!;
    expect(feedback).toHaveFocus();
    // Enter goes on, as Next does; on Next itself, it is Next's own.
    fireEvent.keyDown(feedback, { key: "Enter" });
    expect(onNext).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("button", { name: "Next" }), { key: "Enter" });
    fireEvent.keyDown(feedback, { key: "x" });
    expect(onNext).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("says a wrong answer, and why the option chosen is wrong when its distractor says", () => {
    renderQuestion({ answer: { choice: explained, effect: "review" } });
    expect(statusTexts()).toEqual(["Not quite."]);
    expect(screen.getByRole("status")).toHaveClass("wrong");
    expect(document.querySelector(".course-why")).toHaveTextContent(/^Why not: Why not An IRI$/);
    expect(screen.getByText("Your answer")).toBeInTheDocument();
  });

  it("says nothing of why for a wrong option its distractor does not explain", () => {
    renderQuestion({ answer: { choice: unexplained, effect: "none" } });
    expect(statusTexts()).toEqual(["Not quite."]);
    expect(screen.queryByText(/^Why not:/)).toBeNull();
  });

  it("shows why an answer could not be saved", () => {
    renderQuestion({ error: "pod refused" });
    expect(screen.getByText("pod refused")).toHaveClass("error");
  });
});
