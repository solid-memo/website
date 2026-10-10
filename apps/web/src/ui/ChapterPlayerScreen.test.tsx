import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { choicesOf, type CourseChapter } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ChapterPlayerScreen, type StepPhase } from "./ChapterPlayerScreen";
import { courseCards, courseOutline, noShuffle } from "../test/course";

function screenOf(
  chapter: CourseChapter,
  phase: StepPhase,
  chunkIndex: number,
  onAnswerPhase: () => void,
  onChunk: (index: number) => void,
  stepIndex = 0,
) {
  const card = courseCards[0]!;
  return (
    <ChapterPlayerScreen
      chapter={chapter}
      stepIndex={stepIndex}
      phase={phase}
      questionIndex={0}
      chunkIndex={chunkIndex}
      card={card}
      choices={choicesOf(card, noShuffle)}
      answer={null}
      busy={false}
      error={null}
      onAnswerPhase={onAnswerPhase}
      onChunk={onChunk}
      onCheck={vi.fn()}
      onNext={vi.fn()}
    />
  );
}

function renderStep(chapter: CourseChapter, phase: StepPhase = "read", chunkIndex = 0) {
  const onAnswerPhase = vi.fn();
  const onChunk = vi.fn();
  const view = render(screenOf(chapter, phase, chunkIndex, onAnswerPhase, onChunk));
  return {
    ...view,
    onAnswerPhase,
    onChunk,
    rerenderAt: (chunk: number, stepIndex = 0) => view.rerender(screenOf(chapter, phase, chunk, onAnswerPhase, onChunk, stepIndex)),
  };
}

const THEORY = "A **triple**:\n\n```turtle\n<#a> <#b> <#c> .\n```\n\n| Term | Is |\n|-|-|\n| `<#a>` | the subject |";

describe("ChapterPlayerScreen", () => {
  it("shows theory in Markdown as its blocks", () => {
    const chapter = courseOutline.chapters[0]!;
    const { container } = renderStep({
      ...chapter,
      steps: [{ ...chapter.steps[0]!, theory: { en: THEORY, sv: "Svenska" }, textFormat: SM.markdown }],
    });
    const theory = container.querySelector(".course-theory")!;
    expect(theory).toHaveClass("md");
    expect(theory.querySelector("strong")).toHaveTextContent("triple");
    expect(screen.getByRole("region", { name: "Code" })).toHaveTextContent("<#a> <#b> <#c> .");
    expect(screen.getByRole("region", { name: "Table" })).toHaveTextContent("the subject");
  });

  it("shows plain theory, and theory in a format it does not know, as paragraphs split at blank lines", () => {
    const chapter = courseOutline.chapters[0]!;
    const { container } = renderStep({
      ...chapter,
      steps: [{ ...chapter.steps[0]!, theory: { en: THEORY }, textFormat: "https://example.org/formats#other" }],
    });
    const theory = container.querySelector(".course-theory")!;
    expect(theory).not.toHaveClass("md");
    expect([...theory.querySelectorAll("p")].map((p) => p.textContent)).toEqual(THEORY.split("\n\n"));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("reads a step's theory with no question shown, then asks its questions with no theory rendered", () => {
    const chapter = courseOutline.chapters[0]!;
    const { container, onAnswerPhase } = renderStep(chapter);
    expect(screen.getByText("Things are named by IRIs.")).toBeInTheDocument();
    // The hint is read with the button, before the theory goes away.
    expect(screen.getByRole("button", { name: "On to the question" })).toHaveAccessibleDescription(
      "The theory is not shown while you answer the questions.",
    );
    expect(container.querySelector(".course-question")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Check your understanding" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "On to the question" }));
    expect(onAnswerPhase).toHaveBeenCalledOnce();

    const answering = renderStep(chapter, "answer");
    expect(answering.container.querySelector(".course-theory")).toBeNull();
    expect(answering.container.querySelector(".course-question")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Check your understanding" })).toHaveFocus();
    expect(answering.container).not.toHaveTextContent("Things are named by IRIs.");
    expect(answering.container).not.toHaveTextContent("The theory is not shown");
  });

  describe("theory in chunks", () => {
    const CHUNKED = "First *part*.\n\n---\n\n- a list\n\n  ---\n\n  still the list\n\n***\n\nLast part.";
    const chunked = (theory: Record<string, string> = { en: CHUNKED }): CourseChapter => {
      const chapter = courseOutline.chapters[0]!;
      return { ...chapter, steps: chapter.steps.map((step) => ({ ...step, theory, textFormat: SM.markdown })) };
    };
    const theoryOf = (container: Element) => container.querySelector(".course-theory")!;

    it("shows the first chunk with which part of how many, and Continue to the next, the questions not yet offered", () => {
      const { container, onChunk } = renderStep(chunked());
      expect(screen.getByText("Part 1 of 3")).toBeInTheDocument();
      expect(theoryOf(container)).toHaveTextContent(/^First part\.$/);
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
      expect(screen.queryByRole("button", { name: "On to the question" })).toBeNull();
      expect(container).not.toHaveTextContent("The theory is not shown");
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(onChunk).toHaveBeenCalledWith(1);
    });

    it("splits only at top-level rules, and offers Back from the second chunk on", () => {
      const { container, onChunk } = renderStep(chunked(), "read", 1);
      expect(screen.getByText("Part 2 of 3")).toBeInTheDocument();
      expect(theoryOf(container).querySelector("li")).toHaveTextContent("a liststill the list");
      expect(theoryOf(container).querySelector("hr")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(onChunk).toHaveBeenCalledWith(0);
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(onChunk).toHaveBeenCalledWith(2);
    });

    it("ends with the hint and the way on to the questions, Back still there", () => {
      const { container, onAnswerPhase, onChunk } = renderStep(chunked(), "read", 2);
      expect(screen.getByText("Part 3 of 3")).toBeInTheDocument();
      expect(theoryOf(container)).toHaveTextContent(/^Last part\.$/);
      expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
      const on = screen.getByRole("button", { name: "On to the question" });
      expect(on).toHaveAccessibleDescription("The theory is not shown while you answer the questions.");
      fireEvent.click(on);
      expect(onAnswerPhase).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(onChunk).toHaveBeenCalledWith(1);
    });

    it("shows the last chunk for one past it, as when the reader's language has fewer", () => {
      const { container, onChunk } = renderStep(chunked({ en: "a\n\n---\n\nb" }), "read", 2);
      expect(screen.getByText("Part 2 of 2")).toBeInTheDocument();
      expect(theoryOf(container)).toHaveTextContent(/^b$/);
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(onChunk).toHaveBeenCalledWith(0);
    });

    it("puts the focus on which part it is as the learner moves within a step, and on the heading as a step comes up", () => {
      const { rerenderAt } = renderStep(chunked());
      const part = () => screen.getByText(/^Part \d of 3$/);
      expect(part()).not.toHaveFocus();
      rerenderAt(1);
      expect(part()).toHaveFocus();
      expect(part()).toHaveTextContent("Part 2 of 3");
      rerenderAt(0);
      expect(part()).toHaveFocus();
      rerenderAt(0, 1);
      expect(screen.getByRole("heading", { name: "Step 2 of 2" })).toHaveFocus();
    });

    it("shows theory in one chunk as always: no part, no Back", () => {
      const { container } = renderStep(chunked({ en: "Just *one*." }));
      expect(container.querySelector(".course-part")).toBeNull();
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
      expect(screen.getByRole("button", { name: "On to the question" })).toBeInTheDocument();
    });

    it("shows plain theory whole, its rules as text", () => {
      const chapter = courseOutline.chapters[0]!;
      const { container } = renderStep({ ...chapter, steps: [{ ...chapter.steps[0]!, theory: { en: "a\n\n---\n\nb" } }] });
      expect(container.querySelector(".course-part")).toBeNull();
      expect(theoryOf(container)).toHaveTextContent("a---b");
    });
  });

  it("names the way on by how many questions the step has", () => {
    const chapter = courseOutline.chapters[0]!;
    renderStep({ ...chapter, steps: [chapter.steps[1]!] });
    expect(screen.getByRole("button", { name: "On to the questions" })).toBeInTheDocument();
  });
});
