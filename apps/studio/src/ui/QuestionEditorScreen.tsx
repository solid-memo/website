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
  stepPlaceOf,
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

  // A course draft may have thousands of steps: its places are listed
  // when the draft changes, not on each keystroke in the form, and a
  // chapter is named once, over its steps, each step by its number.
  const place = useMemo(() => placeOf(draft, card), [draft, card]);
  const outline = useMemo(() => draftOutline(draft), [draft]);
  const titles = useMemo(
    () =>
      chapterTitles(
        outline.map(({ chapter }) => chapter),
        readerText,
      ),
    [outline, readerText],
  );
  const places = useMemo(
    () =>
      outline.map(({ chapter, steps }) => (
        <optgroup key={chapter.id} label={readerText(titles.get(chapter.id)!)}>
          {steps.map((step, index) => (
            <option key={step.id} value={placeValue({ kind: "step", step: step.id })}>
              {t("studio.chapter.step", { number: index + 1 })}
            </option>
          ))}
          <option value={placeValue({ kind: "review", chapter: chapter.id })}>
            {t("studio.chapter.review")}
          </option>
        </optgroup>
      )),
    [outline, titles, t, readerText],
  );
  // The select closed shows only its option ("Step 3"): the place chosen,
  // with its chapter, is said to a screen reader as part of its name.
  const labelId = useId();
  const chosenId = useId();
  const chosen = useMemo(() => {
    const at =
      place === null
        ? null
        : place.kind === "review"
          ? { chapter: place.chapter, index: -1 }
          : stepPlaceOf(draft, place.step);
    // A place in a chapter retired is no option of the select.
    const title = at === null ? undefined : titles.get(at.chapter);
    if (title === undefined) return null;
    const chapter = readerText(title);
    return at!.index < 0
      ? t("studio.question.atReview", { chapter })
      : t("studio.question.atStep", { chapter, step: at!.index + 1 });
  }, [draft, place, titles, t, readerText]);

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
            <label>
              <span id={labelId}>{t("studio.question.place")}</span>
              <select
                value={placeValue(place)}
                aria-labelledby={chosen === null ? labelId : `${labelId} ${chosenId}`}
                onChange={(event) =>
                  onEdit([
                    { kind: "moveQuestion", card, place: placeFrom(event.currentTarget.value) },
                  ])
                }
              >
                <option value="">{t("studio.question.nowhere")}</option>
                {places}
              </select>
            </label>
          )}
          {chosen !== null && (
            <span id={chosenId} class="visually-hidden">
              {chosen}
            </span>
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
