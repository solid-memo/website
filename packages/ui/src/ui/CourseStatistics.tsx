// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { CourseStatistics, UseCases } from "@solid-memo/application/useCases";
import type { ChapterState } from "@solid-memo/domain/course";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { Quiz } from "@solid-memo/domain/statistics";
import { useCopies } from "./deckTreeEditor";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";
import { courseHref } from "./router";
import { STATISTICS_STALE_MS } from "./studyFigures";

/**
 * How the learner's courses have gone: each course, a link to its page,
 * with its chapters completed out of all, and a table of its chapters,
 * where each stands and its graded course answers of the last twelve
 * study months, the share right with the count it is of. Nothing without
 * a course.
 */
export function CourseStatisticsView({
  instanceUrl,
  courses,
}: {
  instanceUrl: string;
  courses: readonly CourseStatistics[];
}) {
  const { t } = useI18n();
  const headingId = useId();
  if (courses.length === 0) return null;
  return (
    <section class="statistics course-statistics" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("statistics.courses")}</h3>
      <p class="hint">{t("statistics.coursesHint")}</p>
      {courses.map((course) => (
        <CourseResults
          key={course.deck.url}
          course={course}
          href={courseHref(instanceUrl, course.deck.url)}
        />
      ))}
    </section>
  );
}

/** One course: its title, a link to its page, its chapters done, and how each chapter has gone. */
function CourseResults({ course, href }: { course: CourseStatistics; href: string }) {
  const { t, formatPercent } = useI18n();
  const headingId = useId();
  const { deck, done, chapters } = course;
  const stateText = (state: ChapterState) =>
    state === "done" ? t("course.done") : state === "open" ? t("course.open") : t("course.locked");
  const quizCell = ({ answers, right }: Quiz) =>
    answers === 0
      ? "–"
      : t("statistics.quizShare", { percent: formatPercent(right / answers), count: answers });
  return (
    <>
      <h4 id={headingId}>
        <a href={href}>
          <ReaderText text={deck.title} />
        </a>
      </h4>
      <p class="hint">{t("course.chaptersDone", { done, count: chapters.length })}</p>
      <progress value={done} max={chapters.length} aria-labelledby={headingId} />
      {/* A chapter's title can be long: the table scrolls on a phone, the titles kept in view. */}
      <div class="table-scroll" role="region" aria-labelledby={headingId} tabIndex={0}>
        <table class="deck-statistics">
          <thead>
            <tr>
              <th scope="col">{t("statistics.chapter")}</th>
              <th scope="col">{t("statistics.chapterState")}</th>
              <th scope="col">{t("statistics.quizAccuracy")}</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((chapter) => (
              <tr key={chapter.url}>
                <th scope="row">
                  <ReaderText text={chapter.title} />
                </th>
                <td>{stateText(chapter.state)}</td>
                <td>{quizCell(chapter.quiz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The courses of `decks` (useCopies says which are copies of a course),
 * as they have gone (UseCases.getCourseStatistics), read as the rest of
 * the statistics are: again when the page opens and what was read is
 * over half a minute old, and at once after any change made, which
 * clears it; the decks' chapters completed are in the key, so a chapter
 * completed reads it again too. Nothing while it is read or when it
 * cannot be: the statistics above say so of the log.
 */
export function CourseStatisticsContainer({
  useCases,
  instance,
  decks,
}: {
  useCases: UseCases;
  instance: Instance;
  decks: readonly Deck[];
}) {
  const { isCourse } = useCopies(useCases, decks);
  const courses = decks.filter(isCourse);
  const query = useQuery({
    queryKey: [
      "statistics",
      instance.url,
      "courses",
      courses.map((deck) => [deck.url, deck.sourceUrl, deck.completedChapters ?? []]),
    ],
    queryFn: () => useCases.getCourseStatistics(instance.url, new Date(), courses),
    enabled: courses.length > 0,
    staleTime: STATISTICS_STALE_MS,
  });
  if (query.data === undefined) return null;
  return <CourseStatisticsView instanceUrl={instance.url} courses={query.data} />;
}
