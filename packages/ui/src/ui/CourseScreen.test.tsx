import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { courseProgress } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CourseScreen } from "./CourseScreen";
import { courseOutline } from "../test/course";

describe("CourseScreen", () => {
  it("shows a chapter's description in Markdown as Markdown, and a plain one as written", () => {
    const [first, second] = courseOutline.chapters;
    const outline = {
      ...courseOutline,
      chapters: [
        { ...first!, description: { en: "Names *and* links." }, textFormat: SM.markdown },
        { ...second!, description: { en: "Pods *store* data." } },
      ],
    };
    const { container } = render(
      <CourseScreen
        title={{ en: "Solid" }}
        outline={outline}
        progress={courseProgress(outline, [], [])}
        started={false}
        chapterHref={(chapter) => `#/${chapter.id}`}
        continueHref="#/go"
        decksHref="#/decks"
      />,
    );
    const [marked, plain] = container.querySelectorAll(".course-chapter");
    expect(marked!.querySelector("em")).toHaveTextContent("and");
    expect(plain!.querySelector("em")).toBeNull();
    expect(plain).toHaveTextContent("Pods *store* data.");
  });
});
