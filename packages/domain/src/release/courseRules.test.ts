// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import {
  asked,
  at,
  card,
  chapter,
  course,
  distractor,
  iri,
  model,
  RELEASE,
  step,
  text,
} from "../testing/releaseModel";
import { EDUCATION_THEME } from "../dcat";
import { growth } from "../testing/growth";
import { courseProblems, lacking, readinessProblems } from "./courseRules";
import type { ReleaseProblem } from "./problems";

/** Two chapters: the first with a step and a review question, the second with a step. */
function outline() {
  const [q1, q2, q3] = [asked("q-1"), asked("q-2"), asked("q-3")];
  return {
    cards: [q1.card, q2.card, q3.card],
    chapters: [chapter("ch-1", 0, { reviewQuestions: [at("q-2")] }), chapter("ch-2", 1)],
    steps: [step("s-1", "ch-1", 0, ["q-1"]), step("s-2", "ch-2", 0, ["q-3"])],
    distractors: [...q1.distractors, ...q2.distractors, ...q3.distractors],
  };
}

/** Each problem's code, subject and params, for a short comparison. */
const brief = (problems: readonly ReleaseProblem[]) =>
  problems.map(({ code, subject, params }) => ({ code, subject, params }));

describe("courseProblems", () => {
  it("accepts a course whose outline holds together, and a deck that is no course", () => {
    expect(courseProblems(course(outline()))).toEqual([]);
    expect(courseProblems(model({ cards: [card("se")] }))).toEqual([]);
  });

  it("names chapters or steps in a release that is no schema:Course", () => {
    expect(brief(courseProblems({ ...course(outline()), types: [] }))).toEqual([
      { code: "outlineWithoutCourse", subject: RELEASE, params: {} },
    ]);
    expect(brief(courseProblems(model({ steps: [step("s-1", "ch-1", 0, [])] })))[0].code).toBe(
      "outlineWithoutCourse",
    );
  });

  it("names every card, chapter, step or distractor that is no part of the release, in a course or not", () => {
    const strays = ["https://elsewhere.example/x#q-1", at("q-odd")];
    expect(courseProblems(model({ cards: [card("se")], strays }))).toEqual([
      {
        severity: "error",
        subject: RELEASE,
        related: strays,
        code: "strayParts",
        params: { parts: strays },
      },
    ]);
    expect(brief(courseProblems({ ...course(outline()), strays: strays.slice(0, 1) }))).toEqual([
      { code: "strayParts", subject: RELEASE, params: { parts: strays.slice(0, 1) } },
    ]);
  });

  it("names a course without a chapter", () => {
    expect(brief(courseProblems(course({})))).toEqual([
      { code: "courseWithoutChapter", subject: RELEASE, params: {} },
    ]);
  });

  it("names a course that does not study front to back, or states it more than once", () => {
    const backwards = [iri(SM.backToFront)];
    expect(courseProblems({ ...course(outline()), studyDirection: backwards })).toEqual([
      {
        severity: "error",
        subject: RELEASE,
        field: SM.studyDirection,
        code: "courseDirection",
        params: { stated: backwards },
      },
    ]);
    expect(courseProblems({ ...course(outline()), studyDirection: [] })[0].code).toBe(
      "courseDirection",
    );
    const twice = [iri(SM.frontToBack), iri(SM.frontToBack)];
    expect(courseProblems({ ...course(outline()), studyDirection: twice })[0].code).toBe(
      "courseDirection",
    );
  });

  it("names a chapter that is part of something else than its release, and a step that is part of no chapter of it", () => {
    const o = outline();
    o.chapters[1].isPartOf = [RELEASE, "https://example.com/other"];
    o.steps[1].isPartOf = [at("ch-2"), at("q-1")];
    expect(brief(courseProblems(course(o)))).toEqual([
      {
        code: "chapterPartOf",
        subject: at("ch-2"),
        params: { parts: [RELEASE, "https://example.com/other"] },
      },
      { code: "stepPartOf", subject: at("s-2"), params: { part: at("q-1") } },
    ]);
  });

  it("names a card a step checks or a chapter reviews that is no card of the release, or retired, but not one a retired one names", () => {
    const [q1, q2, q3] = [asked("q-1"), asked("q-2"), asked("q-3")];
    const problems = courseProblems(
      course({
        cards: [q1.card, q2.card, q3.card, card("q-4", { retired: true })],
        chapters: [
          chapter("ch-1", 0, { reviewQuestions: [at("q-2"), "https://example.com/card"] }),
          chapter("ch-2", 1, { reviewQuestions: [at("q-4")] }),
          chapter("ch-3", 2, { reviewQuestions: [at("q-4")], retired: true }),
        ],
        steps: [
          step("s-1", "ch-1", 0, ["q-1", "nothing"]),
          step("s-2", "ch-2", 0, ["q-3"]),
          step("s-3", "ch-2", 1, ["q-4"], { retired: true }),
        ],
        distractors: [...q1.distractors, ...q2.distractors, ...q3.distractors],
      }),
    );
    expect(
      problems.map(({ code, subject, field, params }) => ({ code, subject, field, params })),
    ).toEqual([
      {
        code: "askedNotACard",
        subject: at("s-1"),
        field: SM.checkedBy,
        params: { card: at("nothing") },
      },
      {
        code: "askedNotACard",
        subject: at("ch-1"),
        field: SM.reviewQuestion,
        params: { card: "https://example.com/card" },
      },
      {
        code: "askedRetired",
        subject: at("ch-2"),
        field: SM.reviewQuestion,
        params: { card: at("q-4") },
      },
    ]);
  });

  it("names a distractor of any subject that is no distractor of the release, and one more than one subject names", () => {
    const release = course(outline());
    release.distractorLinks.push(
      { subject: at("se"), object: iri(at("q-1")) },
      { subject: at("q-2"), object: iri(at("q-1-a")) },
      { subject: at("se"), object: iri(at("q-1-a")) },
    );
    expect(brief(courseProblems(release))).toEqual([
      { code: "notADistractor", subject: at("se"), params: { distractor: at("q-1") } },
      {
        code: "distractorShared",
        subject: at("q-1-a"),
        params: { cards: [at("q-1"), at("q-2"), at("se")] },
      },
    ]);
  });

  it("names a card checked by two steps, or both checked by a step and reviewed by a chapter", () => {
    const o = outline();
    o.steps[1].checkedBy.push(at("q-1"), at("q-2"));
    expect(brief(courseProblems(course(o)))).toEqual([
      { code: "checkedTwice", subject: at("q-1"), params: { steps: [at("s-1"), at("s-2")] } },
      {
        code: "checkedAndReviewed",
        subject: at("q-2"),
        params: { steps: [at("s-2")], chapters: [at("ch-1")] },
      },
    ]);
  });

  it("names a card a course asks without text on its back, or with too few distractors in use", () => {
    const problems = courseProblems(
      course({
        cards: [
          card("q-1", {
            back: [],
            distractors: [iri(at("q-1-a")), iri(at("q-1-b")), iri(at("q-1-c")), text("q-1-d")],
          }),
          card("q-2"),
        ],
        chapters: [chapter("ch-1", 0, { reviewQuestions: [at("q-2")] })],
        steps: [step("s-1", "ch-1", 0, ["q-1"])],
        distractors: [
          distractor("q-1-a"),
          distractor("q-1-b", { retired: true }),
          distractor("q-1-c", { typed: false }),
        ],
      }),
    );
    expect(brief(problems)).toEqual([
      { code: "notADistractor", subject: at("q-1"), params: { distractor: at("q-1-c") } },
      { code: "notADistractor", subject: at("q-1"), params: { distractor: "q-1-d" } },
      { code: "noBack", subject: at("q-1"), params: {} },
      { code: "fewDistractors", subject: at("q-1"), params: { count: 1, least: 2 } },
      { code: "fewDistractors", subject: at("q-2"), params: { count: 0, least: 2 } },
    ]);
  });

  it("names a distractor without text in a language of its card's back, untagged text included", () => {
    const problems = courseProblems(
      course({
        cards: [
          card("q-1", {
            back: [text("Answer"), text("Svar", "sv")],
            distractors: [iri(at("q-1-a")), iri(at("q-1-b"))],
          }),
          card("q-2", {
            back: [text("42", "")],
            distractors: [iri(at("q-2-a")), iri(at("q-2-b"))],
          }),
        ],
        chapters: [chapter("ch-1", 0)],
        steps: [step("s-1", "ch-1", 0, ["q-1", "q-2"])],
        distractors: [
          distractor("q-1-a", { text: [text("Wrong"), text("Fel", "sv")] }),
          distractor("q-1-b"),
          distractor("q-2-a", { text: [text("41", "")] }),
          distractor("q-2-b"),
        ],
      }),
    );
    expect(brief(problems)).toEqual([
      {
        code: "distractorLanguages",
        subject: at("q-1-b"),
        params: { card: at("q-1"), missing: ["sv"], more: 0 },
      },
      {
        code: "distractorLanguages",
        subject: at("q-2-b"),
        params: { card: at("q-2"), missing: [""], more: 0 },
      },
    ]);
  });

  /** A course asking one card with `count` back languages and `count` distractors, each in English alone. */
  function manyLanguages(count: number) {
    return course({
      cards: [
        card("q-1", {
          back: Array.from({ length: count }, (_, i) => text("b", `x-b${i}`)),
          distractors: Array.from({ length: count }, (_, i) => iri(at(`q-1-${i}`))),
        }),
      ],
      chapters: [chapter("ch-1", 0)],
      steps: [step("s-1", "ch-1", 0, ["q-1"])],
      distractors: Array.from({ length: count }, (_, i) => distractor(`q-1-${i}`)),
    });
  }

  it("lists a problem of each distractor of a card with more of them than one call takes as arguments", () => {
    const count = 130_000;
    const problems = courseProblems(
      course({
        cards: [
          card("q-1", {
            back: [text("Svar", "sv")],
            distractors: Array.from({ length: count }, (_, i) => iri(at(`q-1-${i}`))),
          }),
        ],
        chapters: [chapter("ch-1", 0)],
        steps: [step("s-1", "ch-1", 0, ["q-1"])],
        distractors: Array.from({ length: count }, (_, i) => distractor(`q-1-${i}`)),
      }),
    );
    expect(problems.filter((one) => one.code === "distractorLanguages")).toHaveLength(count);
  });

  it("names a few of the languages a distractor lacks and counts the rest", () => {
    const problems = courseProblems(manyLanguages(400));
    expect(problems).toHaveLength(400);
    expect(brief(problems)[0]).toEqual({
      code: "distractorLanguages",
      subject: at("q-1-0"),
      params: { card: at("q-1"), missing: ["x-b0", "x-b1", "x-b2"], more: 397 },
    });
    expect(
      problems.every(
        (one) => one.code === "distractorLanguages" && one.params.missing.length === 3,
      ),
    ).toBe(true);
  });

  it("checks a card's distractors in time that grows with them and its back, not with their product", () => {
    // Eight times the back languages and distractors take about as long
    // as an eighth of them eight times over; listing each back language
    // a distractor lacks would take eight times as long.
    const ratio = growth(
      (count) => {
        const many = manyLanguages(count);
        return () => courseProblems(many);
      },
      250,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  /** A course asking `count` cards, in English, that all name one distractor in `count` other languages. */
  function sharedDistractor(count: number) {
    const ids = Array.from({ length: count }, (_, i) => `q-${i}`);
    return course({
      cards: ids.map((id) => card(id, { distractors: [iri(at("d"))] })),
      chapters: [chapter("ch-1", 0)],
      steps: [step("s-1", "ch-1", 0, ids)],
      distractors: [
        distractor("d", { text: Array.from({ length: count }, (_, i) => text("o", `x-l${i}`)) }),
      ],
    });
  }

  it("names what a distractor many cards share lacks, for each card", () => {
    const problems = brief(courseProblems(sharedDistractor(3))).filter(
      (one) => one.code === "distractorLanguages",
    );
    expect(problems).toEqual(
      ["q-0", "q-1", "q-2"].map((id) => ({
        code: "distractorLanguages",
        subject: at("d"),
        params: { card: at(id), missing: ["en"], more: 0 },
      })),
    );
  });

  it("checks a distractor many cards share, in many languages, in time that grows with them, not with their product", () => {
    // Eight times the cards and the distractor's languages take about as
    // long as an eighth of them eight times over; working out the
    // distractor's languages again for each card would take eight times
    // as long.
    const ratio = growth(
      (count) => {
        const many = sharedDistractor(count);
        return () => courseProblems(many);
      },
      250,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("names chapters, and a chapter's steps, in use that share a position, but not retired ones", () => {
    const [q1, q2, q3] = [asked("q-1"), asked("q-2"), asked("q-3")];
    const problems = courseProblems(
      course({
        cards: [q1.card, q2.card, q3.card],
        chapters: [chapter("ch-1", 0), chapter("ch-2", 0), chapter("ch-3", 0, { retired: true })],
        steps: [
          step("s-1", "ch-1", 0, ["q-1"]),
          step("s-2", "ch-1", 0, ["q-2"]),
          step("s-3", "ch-1", 0, ["q-3"], { retired: true }),
          step("s-4", "ch-2", 0, ["q-3"], { retired: true }),
          step("s-5", "ch-2", 1, ["q-3"]),
        ],
        distractors: [...q1.distractors, ...q2.distractors, ...q3.distractors],
      }),
    );
    expect(brief(problems)).toEqual([
      {
        code: "chapterPositions",
        subject: RELEASE,
        params: { chapters: [at("ch-1"), at("ch-2")], position: "0" },
      },
      {
        code: "stepPositions",
        subject: at("ch-1"),
        params: { steps: [at("s-1"), at("s-2")], chapter: at("ch-1"), position: "0" },
      },
    ]);
  });

  it("names a chapter in use without a step in use, but not a retired one", () => {
    const problems = courseProblems(
      course({
        cards: [card("q-1", { retired: true })],
        chapters: [chapter("ch-1", 0), chapter("ch-2", 1, { retired: true })],
        steps: [step("s-1", "ch-1", 0, ["q-1"], { retired: true })],
      }),
    );
    expect(brief(problems)).toEqual([
      { code: "chapterWithoutStep", subject: at("ch-1"), params: {} },
    ]);
  });

  it("checks a course in time that grows with its chapters and steps, not with their product", () => {
    // Eight times the chapters and steps take about as long as an eighth of
    // them eight times over; looking through every step for each chapter
    // would take eight times as long.
    const ratio = growth(
      (count) => {
        const many = course({
          chapters: Array.from({ length: count }, (_, i) => chapter(`ch-${i}`, i)),
          steps: Array.from({ length: count }, (_, i) =>
            step(`st-${i}`, `ch-${count - 1 - i}`, 0, []),
          ),
        });
        return () => courseProblems(many);
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("lacking", () => {
  it("lists the first few languages one set lacks of another, in its order, and counts the rest", () => {
    const wanted = new Set(["en", "sv", "de", "fr", "es", "ko"]);
    expect(lacking(wanted, new Set(["sv", "x"]))).toEqual({ listed: ["en", "de", "fr"], more: 2 });
    expect(lacking(new Set(["sv", "x"]), wanted)).toEqual({ listed: ["x"], more: 0 });
    expect(lacking(wanted, wanted)).toEqual({ listed: [], more: 0 });
  });
});

describe("readinessProblems", () => {
  const DCAT = "http://www.w3.org/ns/dcat#";
  const DCTERMS = "http://purl.org/dc/terms/";
  const SCHEMA = "https://schema.org/";
  /** A course with everything a release states. */
  function ready() {
    const o = outline();
    return course({
      ...o,
      chapters: o.chapters.map((c) => ({ ...c, title: [text("Chapter")] })),
      steps: o.steps.map((s) => ({ ...s, theory: [text("Theory", "en-gb")] })),
    });
  }
  const stated = {
    title: [text("Title"), text("Titel", "sv")],
    description: [text("About")],
    publisher: [iri(at("me"))],
    version: [text("1", "")],
    inSeries: [iri(at("series"))],
    isVersionOf: [iri(at("series"))],
    distribution: [iri(at("turtle"))],
    themes: [iri(EDUCATION_THEME)],
  };
  const brief = (problems: readonly ReleaseProblem[]) =>
    problems.map(({ code, subject, field, params }) => ({ code, subject, field, params }));

  it("accepts a release with what a release states", () => {
    expect(readinessProblems({ ...ready(), ...stated })).toEqual([]);
  });

  it("names what the release lacks: a field, an English text, the theme EDUC", () => {
    const required = (subject: string, field: string) => ({
      code: "required",
      subject,
      field,
      params: {},
    });
    expect(
      brief(
        readinessProblems({
          ...ready(),
          ...stated,
          title: [],
          description: [text("Om", "sv")],
          publisher: [],
          version: [],
          inSeries: [],
          isVersionOf: [],
          distribution: [],
          themes: [],
        }),
      ),
    ).toEqual([
      required(RELEASE, `${DCTERMS}title`),
      {
        code: "missingLanguage",
        subject: RELEASE,
        field: `${DCTERMS}description`,
        params: { language: "en" },
      },
      required(RELEASE, `${DCTERMS}publisher`),
      required(RELEASE, `${DCAT}version`),
      required(RELEASE, `${DCAT}inSeries`),
      required(RELEASE, `${DCAT}isVersionOf`),
      required(RELEASE, `${DCAT}distribution`),
      {
        code: "missingTheme",
        subject: RELEASE,
        field: `${DCAT}theme`,
        params: { theme: EDUCATION_THEME },
      },
    ]);
  });

  it("names what a chapter or a step lacks, retired or not", () => {
    const release = { ...ready(), ...stated };
    release.chapters[1] = {
      ...release.chapters[1],
      retired: true,
      title: [text("Kapitel", "sv")],
      isPartOf: [],
      positions: [],
    };
    release.steps[1] = {
      ...release.steps[1],
      theory: [],
      checkedBy: [],
      isPartOf: [],
      positions: [],
    };
    expect(brief(readinessProblems(release))).toEqual([
      {
        code: "missingLanguage",
        subject: at("ch-2"),
        field: `${DCTERMS}title`,
        params: { language: "en" },
      },
      { code: "required", subject: at("ch-2"), field: `${SCHEMA}isPartOf`, params: {} },
      { code: "required", subject: at("ch-2"), field: `${SCHEMA}position`, params: {} },
      { code: "required", subject: at("s-2"), field: SM.theory, params: {} },
      { code: "required", subject: at("s-2"), field: SM.checkedBy, params: {} },
      { code: "required", subject: at("s-2"), field: `${SCHEMA}isPartOf`, params: {} },
      { code: "required", subject: at("s-2"), field: `${SCHEMA}position`, params: {} },
    ]);
  });
});
