// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { courseProgress } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CourseLanguage } from "./cardLanguage";
import { CourseScreen } from "./CourseScreen";
import { CH1, courseOutline } from "../test/course";

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

  it("shows the course's own text in its course language first, the app's own text as before", () => {
    const [first, second] = courseOutline.chapters;
    const outline = {
      ...courseOutline,
      chapters: [{ ...first!, description: { en: "Names.", sv: "Namn." } }, second!],
    };
    render(
      <CourseLanguage language="sv">
        <CourseScreen
          title={{ en: "Solid", sv: "Solid på svenska" }}
          description={{ en: "A course.", sv: "En kurs." }}
          outline={outline}
          progress={courseProgress(outline, [], [CH1])}
          started
          justCompleted={{ chapterUrl: CH1, finishedCourse: false }}
          chapterHref={(chapter) => `#/${chapter.id}`}
          continueHref="#/go"
        />
      </CourseLanguage>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Solid på svenska");
    expect(screen.getByText("Solid på svenska")).toHaveAttribute("lang", "sv");
    expect(screen.getByText("En kurs.")).toHaveAttribute("lang", "sv");
    expect(screen.getByText("Namn.")).toHaveAttribute("lang", "sv");
    for (const title of screen.getAllByText("Länkade data")) {
      expect(title).toHaveAttribute("lang", "sv");
    }
    expect(screen.getAllByText("Länkade data")).toHaveLength(2);
    expect(screen.getByText("Pods")).not.toHaveAttribute("lang");
    expect(screen.getByRole("link", { name: "Continue" })).not.toHaveAttribute("lang");
  });
});
