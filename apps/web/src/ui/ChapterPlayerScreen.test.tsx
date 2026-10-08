import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { choicesOf, type CourseChapter } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ChapterPlayerScreen, type StepPhase } from "./ChapterPlayerScreen";
import { courseCards, courseOutline, noShuffle } from "../test/course";

function renderStep(chapter: CourseChapter, phase: StepPhase = "read") {
  const card = courseCards[0]!;
  const onAnswerPhase = vi.fn();
  const view = render(
    <ChapterPlayerScreen
      chapter={chapter}
      stepIndex={0}
      phase={phase}
      questionIndex={0}
      card={card}
      choices={choicesOf(card, noShuffle)}
      answer={null}
      busy={false}
      error={null}
      onAnswerPhase={onAnswerPhase}
      onCheck={vi.fn()}
      onNext={vi.fn()}
    />,
  );
  return { ...view, onAnswerPhase };
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

  it("names the way on by how many questions the step has", () => {
    const chapter = courseOutline.chapters[0]!;
    renderStep({ ...chapter, steps: [chapter.steps[1]!] });
    expect(screen.getByRole("button", { name: "On to the questions" })).toBeInTheDocument();
  });
});
