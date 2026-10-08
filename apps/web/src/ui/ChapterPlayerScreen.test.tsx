import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { choicesOf, type CourseChapter } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ChapterPlayerScreen } from "./ChapterPlayerScreen";
import { courseCards, courseOutline, noShuffle } from "../test/course";

function renderStep(chapter: CourseChapter) {
  const card = courseCards[0]!;
  return render(
    <ChapterPlayerScreen
      chapter={chapter}
      stepIndex={0}
      questionIndex={0}
      card={card}
      choices={choicesOf(card, noShuffle)}
      answer={null}
      busy={false}
      error={null}
      onCheck={vi.fn()}
      onNext={vi.fn()}
    />,
  );
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
});
