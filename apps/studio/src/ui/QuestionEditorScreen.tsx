// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId, useMemo, useState } from "preact/hooks";
import { choicesOf, type Choice } from "@solid-memo/domain/course";
import type { CardContent } from "@solid-memo/domain/deck";
import { isPublished } from "@solid-memo/domain/release/courseIds";
import {
  cardTextOf,
  distractorChanges,
  draftCardOf,
  draftOutline,
} from "@solid-memo/domain/release/draftOutline";
import type { QuestionField } from "@solid-memo/domain/release/releaseCheck";
import {
  placeOf,
  type QuestionPlace,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import type { CardTextPart } from "@solid-memo/domain/deck";
import {
  CardContentFields,
  CardFieldsErrorMessage,
  checkDraft,
  draftOf,
  type CardFieldsError,
} from "@solid-memo/ui/CardContentFields";
import { CourseQuestion, type CheckedAnswer } from "@solid-memo/ui/CourseQuestion";
import { cardName } from "@solid-memo/ui/DataText";
import { DistractorFields } from "@solid-memo/ui/DistractorFields";
import { useI18n } from "@solid-memo/ui/i18n";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import type { DraftLinks } from "./DraftOverviewScreen";
import { chapterTitles, DraftScope, DraftStatus } from "./DraftParts";
import { OUTLINE_LIMIT } from "./DraftOutline";
import { LifeActions } from "./LifeActions";

/** A place as the select's value: `step <id>`, `review <id>`, or "" for nowhere. */
function placeValue(place: QuestionPlace | null): string {
  return place === null
    ? ""
    : place.kind === "step"
      ? `step ${place.step}`
      : `review ${place.chapter}`;
}

function placeFrom(value: string): QuestionPlace | null {
  const [kind, id] = value.split(" ");
  return kind === "step"
    ? { kind: "step", step: id! }
    : kind === "review"
      ? { kind: "review", chapter: id! }
      : null;
}

/**
 * Where a course's question is asked, chosen in two parts: a chapter,
 * then a place in it (nowhere, one of its steps, or its final review),
 * so every step of every chapter can be chosen however many there are.
 * A draft started from a release may have thousands of chapters and
 * steps: the chapter select lists the first OUTLINE_LIMIT chapters, and
 * as many more each time the user asks, the place select the chapter's
 * first OUTLINE_LIMIT steps, and as many more each time; each lists the
 * place chosen wherever it is. They are listed when the chapters or
 * steps change, or the user asks for more, not on each keystroke in the
 * form nor each edit to a card, and a chapter is named cut short
 * (chapterTitles).
 */
function PlaceChoice({
  draft,
  place,
  onMove,
}: {
  draft: ReleaseDraft;
  place: QuestionPlace | null;
  onMove: (place: QuestionPlace | null) => void;
}) {
  const { t, readerText } = useI18n();
  const outline = useMemo(
    () => draftOutline(draft),
    // draftOutline reads only these.
    [draft.url, draft.chapters, draft.steps],
  );
  const titles = useMemo(
    () =>
      chapterTitles(
        outline.map(({ chapter }) => chapter),
        readerText,
      ),
    [outline, readerText],
  );
  const value = placeValue(place);
  // The place's chapter and step in the outline: -1 for none, or a chapter retired.
  const [placeAt, placeStep] = useMemo(() => {
    const [kind, id] = value.split(" ");
    for (const [at, { chapter, steps }] of outline.entries()) {
      if (kind === "review" && chapter.id === id) return [at, -1];
      const step = kind === "step" ? steps.findIndex((node) => node.id === id) : -1;
      if (step >= 0) return [at, step];
    }
    return [-1, -1];
  }, [outline, value]);
  const [picked, setPicked] = useState<string | null>(null);
  const [chapterCount, setChapterCount] = useState(OUTLINE_LIMIT);
  const [stepCount, setStepCount] = useState(OUTLINE_LIMIT);
  const pickedAt = useMemo(
    () => (picked === null ? -1 : outline.findIndex(({ chapter }) => chapter.id === picked)),
    [outline, picked],
  );
  // The chapter chosen: the one the user picked, else the place's, else the first.
  const at = pickedAt >= 0 ? pickedAt : placeAt >= 0 ? placeAt : outline.length > 0 ? 0 : -1;
  const chapters = useMemo(() => {
    const ats = outline.slice(0, chapterCount).map((_, index) => index);
    if (at >= chapterCount) ats.push(at);
    return {
      options: ats.map((index) => {
        const { id } = outline[index]!.chapter;
        return (
          <option key={id} value={id}>
            {readerText(titles.get(id)!)}
          </option>
        );
      }),
      more: outline.length - ats.length,
    };
  }, [outline, chapterCount, at, titles, readerText]);
  const steps = useMemo(() => {
    if (at < 0) return { options: null, more: 0 };
    const { chapter, steps: all } = outline[at]!;
    const ats = all.slice(0, stepCount).map((_, index) => index);
    if (placeAt === at && placeStep >= stepCount) ats.push(placeStep);
    return {
      options: (
        <>
          {ats.map((index) => (
            <option key={all[index]!.id} value={placeValue({ kind: "step", step: all[index]!.id })}>
              {t("studio.chapter.step", { number: index + 1 })}
            </option>
          ))}
          <option value={placeValue({ kind: "review", chapter: chapter.id })}>
            {t("studio.chapter.review")}
          </option>
        </>
      ),
      more: all.length - ats.length,
    };
  }, [outline, at, stepCount, placeAt, placeStep, t]);
  // The select closed shows only its option ("Step 3"): the place chosen,
  // with its chapter, is said to a screen reader as part of its name.
  const labelId = useId();
  const chosenId = useId();
  const chosen = useMemo(() => {
    if (placeAt < 0) return null;
    const chapter = readerText(titles.get(outline[placeAt]!.chapter.id)!);
    return placeStep < 0
      ? t("studio.question.atReview", { chapter })
      : t("studio.question.atStep", { chapter, step: placeStep + 1 });
  }, [outline, placeAt, placeStep, titles, t, readerText]);

  // Whether the place select lists the place chosen: nowhere, or a place in the chapter chosen.
  const here = value === "" || (placeAt >= 0 && placeAt === at);

  return (
    <>
      {at >= 0 && (
        <label>
          {t("studio.question.chapter")}
          <select
            value={outline[at]!.chapter.id}
            onChange={(event) => {
              setPicked(event.currentTarget.value);
              setStepCount(OUTLINE_LIMIT);
            }}
          >
            {chapters.options}
          </select>
        </label>
      )}
      {chapters.more > 0 && (
        <button type="button" onClick={() => setChapterCount((was) => was + OUTLINE_LIMIT)}>
          {t("studio.question.moreChapters", { count: Math.min(chapters.more, OUTLINE_LIMIT) })}
        </button>
      )}
      <label>
        <span id={labelId}>{t("studio.question.place")}</span>
        <select
          value={here ? value : "elsewhere"}
          aria-labelledby={chosen === null ? labelId : `${labelId} ${chosenId}`}
          onChange={(event) => onMove(placeFrom(event.currentTarget.value))}
        >
          <option value="">{t("studio.question.nowhere")}</option>
          {!here && (
            <option value="elsewhere" disabled>
              {t("studio.question.elsewhere")}
            </option>
          )}
          {steps.options}
        </select>
      </label>
      {steps.more > 0 && (
        <button type="button" onClick={() => setStepCount((was) => was + OUTLINE_LIMIT)}>
          {t("studio.question.moreSteps", { count: Math.min(steps.more, OUTLINE_LIMIT) })}
        </button>
      )}
      {chosen !== null && (
        <span id={chosenId} class="visually-hidden">
          {chosen}
        </span>
      )}
    </>
  );
}

/** The order the preview offers the options in: as they come, so the same card shows the same each time it is drawn. */
const IN_ORDER = () => 0.5;

/**
 * A card of a draft (docs/studio.md, A question): for a course, where it
 * is asked (a step, a chapter's final review, or nowhere yet); its
 * content, Solid Memo's card editor (CardContentFields), saved by Save;
 * its wrong options (DistractorFields), each change saved as it is made;
 * a preview of it as the course asks it (CourseQuestion), as typed,
 * which can be answered and answered again; and the card retired,
 * restored or deleted (one an earlier release published is only
 * retired, and so is a wrong option it published). Opened at a field
 * (`field`, from the release check: a text, the wrong options, or one
 * of them), that field is where the user arrives.
 */
export function QuestionEditorScreen({
  draft,
  card,
  readOnly,
  status,
  links,
  field,
  onEdit,
  onDeleted,
}: {
  draft: ReleaseDraft;
  card: string;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: DraftLinks;
  field?: QuestionField;
  onEdit: DraftEditor["edit"];
  onDeleted: () => void;
}) {
  const { t, readerText, locale } = useI18n();
  const held = readOnly !== null;
  // The workspace opens a card it can read.
  const saved = useMemo(() => draftCardOf(draft, card)!, [draft, card]);
  const [form, setForm] = useState(() => draftOf(saved.content, [locale, ...navigator.languages]));
  const [invalid, setInvalid] = useState<CardFieldsError | null>(null);
  const [answer, setAnswer] = useState<CheckedAnswer | null>(null);
  const [round, setRound] = useState(0);
  const name = cardName({ ...saved.content, id: card }, readerText);

  // The preview: the card as typed, while it is a card; else as saved.
  const typed = checkDraft(form, saved.content);
  const shown: CardContent = typed.ok
    ? {
        ...typed.content,
        textFormat: typed.content.textFormat ?? saved.content.textFormat,
        distractors: saved.content.distractors,
      }
    : saved.content;
  // The options built again only when the answer typed or the wrong options change, so
  // a keystroke elsewhere, or checking an answer, does not draw or parse every one again.
  const back = JSON.stringify(shown.back);
  const choices = useMemo(() => choicesOf(shown, IN_ORDER), [back, shown.distractors]);

  function save(event: Event) {
    event.preventDefault();
    const check = checkDraft(form, saved.content);
    if (!check.ok) {
      setInvalid(check.invalid);
      return;
    }
    setInvalid(null);
    const content = {
      ...check.content,
      textFormat: check.content.textFormat ?? saved.content.textFormat,
    };
    onEdit([{ kind: "editCard", id: card, card: cardTextOf(content, saved.created) }]);
  }

  const place = useMemo(() => placeOf(draft, card), [draft, card]);

  return (
    <section>
      <header>
        <h2>{name}</h2>
        <p class="hint">
          {saved.retired && `${t("studio.question.retired")} · `}
          <code>{card}</code>
        </p>
      </header>
      <DraftStatus editor={status} />
      {/* On a wide screen, the preview beside the form. */}
      <div class="studio-editor">
        <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
          {draft.course && (
            <PlaceChoice
              draft={draft}
              place={place}
              onMove={(to) => onEdit([{ kind: "moveQuestion", card, place: to }])}
            />
          )}

          <form class="card-edit" onSubmit={save}>
            <CardContentFields
              draft={form}
              saved={saved.content}
              busy={false}
              invalid={invalid}
              suggestions={{ front: [], back: [], own: [] }}
              {...(field === undefined || field === "distractors" || field.startsWith("distractor:")
                ? {}
                : { arrival: field as CardTextPart })}
              onChange={(next) => {
                if (invalid?.entry !== undefined) setInvalid(null);
                setForm(next);
              }}
            />
            <CardFieldsErrorMessage invalid={invalid} />
            <button type="submit" class="primary">
              {t("card.saveButton")}
            </button>
          </form>

          <div
            id="question-distractors"
            tabIndex={-1}
            data-arrival={field === "distractors" || undefined}
          >
            <DistractorFields
              cardId={card}
              distractors={saved.content.distractors ?? []}
              published={new Set(Object.keys(draft.published.ids))}
              back={saved.content.back}
              textFormat={saved.content.textFormat}
              busy={held}
              suggestions={[]}
              {...(field?.startsWith("distractor:") === true
                ? { arrival: field.slice("distractor:".length) }
                : {})}
              onChange={(next) =>
                Promise.resolve(onEdit(distractorChanges(draft, card, next)) === null)
              }
            />
          </div>

          <LifeActions
            of="card"
            id={card}
            name={name}
            retired={saved.retired}
            published={isPublished(draft, card)}
            onEdit={(change) => onEdit([change])}
            onDeleted={onDeleted}
          />
        </DraftScope>

        <section aria-labelledby="question-preview-heading" class="course-player">
          <h3 id="question-preview-heading">{t("studio.question.preview")}</h3>
          <CourseQuestion
            key={round}
            card={shown}
            choices={choices}
            answer={answer}
            focusQuestion={false}
            busy={false}
            error={null}
            nextLabel={t("studio.question.again")}
            onCheck={(choice: Choice) => setAnswer({ choice, effect: "none" })}
            onNext={() => {
              setAnswer(null);
              setRound(round + 1);
            }}
          />
        </section>
      </div>
    </section>
  );
}
