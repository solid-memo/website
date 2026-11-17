// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { courseProgress, type CourseOutline } from "@solid-memo/domain/course";
import { parseMarkdown } from "@solid-memo/markdown/parse";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CourseLanguage } from "./cardLanguage";
import { LIST_LIMIT } from "./bounded";
import type { CompletedChapter } from "./CourseContainer";
import { CourseScreen } from "./CourseScreen";
import { CACHE_SIZE } from "./markdownCache";
import { CH1, courseOutline } from "../test/course";

vi.mock("@solid-memo/markdown/parse", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/markdown/parse")>();
  return { ...original, parseMarkdown: vi.fn(original.parseMarkdown) };
});

describe("CourseScreen", () => {
  it("parses each chapter's description it shows once, however many chapters the course has", () => {
    const [first] = courseOutline.chapters;
    const outline = {
      ...courseOutline,
      chapters: Array.from({ length: CACHE_SIZE + 1 }, (_, index) => ({
        ...first!,
        id: `many-${index}`,
        url: `${first!.url}-many-${index}`,
        position: index,
        description: { en: `Chapter *${index}* of many.` },
        textFormat: SM.markdown,
      })),
    };
    const screen = (
      <CourseScreen
        title={{ en: "Solid" }}
        outline={outline}
        progress={courseProgress(outline, [], [])}
        started={false}
        chapterHref={(chapter) => `#/${chapter.id}`}
        continueHref="#/go"
      />
    );
    const { container, rerender } = render(screen);
    expect(container.querySelectorAll(".course-chapter em")).toHaveLength(LIST_LIMIT);
    vi.mocked(parseMarkdown).mockClear();
    rerender(<CourseScreen {...screen.props} started />);
    expect(parseMarkdown).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".course-chapter em")).toHaveLength(LIST_LIMIT);
  });

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

  describe("a course of many chapters", () => {
    /** A course of `count` chapters with no step, all sharing one review question. */
    function outlineOf(count: number): CourseOutline {
      return {
        releaseUrl: `${courseOutline.releaseUrl}?many=${count}`,
        chapters: Array.from({ length: count }, (_, at) => ({
          id: `c${at}`,
          url: `${courseOutline.releaseUrl}#c${at}`,
          position: at,
          title: { en: `Title ${at}` },
          description: { en: `About ${at}` },
          steps: [],
          reviewQuestionIds: ["r-1"],
        })),
      };
    }

    function renderCourse(
      outline: CourseOutline,
      completed: readonly string[],
      justCompleted?: CompletedChapter,
    ) {
      const progress = courseProgress(outline, [], completed);
      const chapterHref = vi.fn(
        (chapter: { id: string }, at: { state: string }) => `#/${chapter.id}/${at.state}`,
      );
      const rendered = render(
        <CourseScreen
          title={{ en: "Many" }}
          outline={outline}
          progress={progress}
          started
          chapterHref={chapterHref}
          continueHref="#/go"
          justCompleted={justCompleted}
        />,
      );
      return { ...rendered, chapterHref };
    }

    it("shows at most LIST_LIMIT chapters around the one to go on with, and how many more there are", () => {
      const outline = outlineOf(20_000);
      // The first 600 completed, and the last 1,000, as a deck file imported with progress may say.
      const completed = [...outline.chapters.slice(0, 600), ...outline.chapters.slice(-1000)].map(
        (chapter) => chapter.url,
      );
      const { container, chapterHref } = renderCourse(outline, completed);
      const items = container.querySelectorAll("li.course-chapter");
      expect(items).toHaveLength(LIST_LIMIT);
      expect(items[0]).toHaveTextContent("Title 595");
      expect(screen.getByText("595 earlier chapters, not listed here.")).toBeInTheDocument();
      expect(screen.getByText("And 19,355 more chapters, not listed here.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Title 600" })).toHaveAttribute(
        "href",
        "#/c600/open",
      );
      expect(screen.getByRole("link", { name: "Title 599" })).toHaveAttribute(
        "href",
        "#/c599/done",
      );
      expect(screen.queryByRole("link", { name: "Title 601" })).toBeNull();
      // A link for each chapter shown that is not locked, and no more.
      expect(chapterHref).toHaveBeenCalledTimes(6);
      expect(screen.getByText("1,600 of 20,000 chapters done")).toBeInTheDocument();
    });

    it("numbers the chapters shown from where they start in the course", () => {
      const outline = outlineOf(LIST_LIMIT * 3);
      const completed = outline.chapters.slice(0, 100).map((chapter) => chapter.url);
      const { container } = renderCourse(outline, completed);
      // A screen reader announces each chapter by its number in the whole course.
      expect(container.querySelector("ol.course-chapters")).toHaveAttribute("start", "96");
    });

    it("cheers for a chapter just completed outside the chapters shown, without its sparkles", () => {
      const outline = outlineOf(LIST_LIMIT * 3);
      const completed = outline.chapters.slice(0, 100).map((chapter) => chapter.url);
      const { container } = renderCourse(outline, completed, {
        chapterUrl: outline.chapters[0]!.url,
        finishedCourse: false,
      });
      expect(container.querySelector(".course-cheer")).toHaveTextContent(
        "Well done! You have completed Title 0.",
      );
      expect(container.querySelector(".course-sparkles")).toBeNull();
      expect(container.querySelector(".just-completed")).toBeNull();
    });

    it("shows the last chapters once the one to go on with is near the end, with no line after them", () => {
      const outline = outlineOf(LIST_LIMIT * 3);
      const completed = outline.chapters.slice(0, -2).map((chapter) => chapter.url);
      const { container } = renderCourse(outline, completed);
      const items = container.querySelectorAll("li.course-chapter");
      expect(items).toHaveLength(LIST_LIMIT);
      expect(items[LIST_LIMIT - 1]).toHaveTextContent(`Title ${LIST_LIMIT * 3 - 1}`);
      expect(
        screen.getByText(`${LIST_LIMIT * 2} earlier chapters, not listed here.`),
      ).toBeInTheDocument();
      expect(screen.queryByText(/more chapters?, not listed here/)).toBeNull();
    });

    it("shows the first chapters of a finished course", () => {
      const outline = outlineOf(LIST_LIMIT + 1);
      const { container } = renderCourse(
        outline,
        outline.chapters.map((chapter) => chapter.url),
      );
      expect(container.querySelectorAll("li.course-chapter")[0]).toHaveTextContent("Title 0");
      expect(screen.queryByText(/earlier chapters?, not listed here/)).toBeNull();
      expect(screen.getByText("And 1 more chapter, not listed here.")).toBeInTheDocument();
    });
  });
});
