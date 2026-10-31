// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import type { CourseChapter } from "@solid-memo/domain/course";
import { isMarkdown } from "@solid-memo/domain/deck";
import { DataText } from "./DataText";
import { useI18n } from "./i18n";
import { CourseText } from "./ReaderText";

/**
 * A try of a library course before adding it: its chapters, each title
 * a link to that chapter, with its description and how many steps it
 * has; or, once one is opened, that chapter (`children`, the chapter
 * player) under a link back to the chapters. Nothing is recorded, as
 * the hint above says.
 */
export function CoursePreviewScreen({
  courseName,
  courseLang,
  courseHref,
  chapters,
  chapterHref,
  children,
  onExit,
}: {
  courseName: string;
  /** The language the course's name is in, when not the page's (readerLang). */
  courseLang?: string;
  /** URL of the course's page; its name links there. */
  courseHref: string;
  /** The chapters, in order. */
  chapters: readonly CourseChapter[];
  /** URL of a chapter's preview, or of the chapters for none. */
  chapterHref: (chapter?: CourseChapter) => string;
  /** The chapter opened, played; none to list the chapters. */
  children?: ComponentChildren;
  onExit: () => void;
}) {
  const { t, tx } = useI18n();
  return (
    <section class="course-preview">
      <header>
        <h2>
          {tx("libraryPreview.heading", {
            deck: (
              <a href={courseHref} lang={courseLang}>
                {courseName}
              </a>
            ),
          })}
        </h2>
        <button onClick={onExit}>{t("libraryPreview.back")}</button>
      </header>
      {chapters.length === 0 ? (
        <p>{t("coursePreview.empty")}</p>
      ) : (
        <>
          <p class="hint">{t("coursePreview.hint")}</p>
          {children === undefined ? (
            <ol class="course-chapters">
              {chapters.map((chapter, index) => (
                <li key={chapter.url} class="course-chapter">
                  <h3>
                    <span class="course-chapter-number">
                      {t("course.chapterNumber", { number: index + 1 })}
                    </span>{" "}
                    <a href={chapterHref(chapter)}>
                      <CourseText text={chapter.title} />
                    </a>
                  </h3>
                  {chapter.description !== undefined && (
                    <DataText
                      text={chapter.description}
                      markdown={isMarkdown(chapter.textFormat)}
                    />
                  )}
                  <p class="hint">{t("coursePreview.steps", { count: chapter.steps.length })}</p>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <p>
                <a href={chapterHref()}>{t("coursePreview.allChapters")}</a>
              </p>
              {children}
            </>
          )}
        </>
      )}
    </section>
  );
}
