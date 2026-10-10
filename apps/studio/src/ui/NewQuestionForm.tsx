import { useState } from "preact/hooks";
import { isEmptyText } from "@solid-memo/domain/deck";
import { questionIdBefore, questionIdFor, questionsAt } from "@solid-memo/domain/release/courseIds";
import { draftCardOf } from "@solid-memo/domain/release/draftOutline";
import type { DraftChange, QuestionPlace, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { draftOf, LangTextField, rememberLanguages, textOfDraft, type DraftEntry, type LangTextDraft } from "@solid-memo/ui/LangTextField";
import { recentLanguages } from "@solid-memo/ui/remembered";
import { idUsable, IdField } from "./DraftParts";

/** A new side's draft: empty, in the language last chosen for a card's own text. */
function emptySide(): LangTextDraft {
  return draftOf(undefined, [], { tag: recentLanguages("own")[0] ?? null });
}

/**
 * A new card of a draft, asked where `place` says (a step, a chapter's
 * final review) or nowhere yet (a deck's card): its front and back, each
 * in the languages the user states, and its id, as the id assistant
 * suggests it (questionIdFor) unless the user writes another. Where the
 * place asks others, the user may ask it before one of them: its id is
 * then one that sorts there (questionIdBefore), as the place asks its
 * cards in the order of their ids; an id the user writes that sorts
 * elsewhere is asked there, and the form says so. Adding it
 * adds the card and asks it there (`onAdd`, which makes the changes and
 * returns whether they were made); its wrong options are written in the
 * question's editor. The form is then empty again, for the next.
 */
export function NewQuestionForm({
  id,
  draft,
  place,
  legend,
  onAdd,
}: {
  id: string;
  draft: ReleaseDraft;
  place: QuestionPlace | null;
  legend: string;
  onAdd: (changes: DraftChange[], card: string) => boolean;
}) {
  const { t, readerText } = useI18n();
  const [typedId, setTypedId] = useState<string | null>(null);
  /** The card it is asked before; null: after the last. */
  const [before, setBefore] = useState<string | null>(null);
  const [front, setFront] = useState(emptySide);
  const [back, setBack] = useState(emptySide);
  const [missing, setMissing] = useState<{ side: "front" | "back"; entry: DraftEntry } | null>(null);
  const [empty, setEmpty] = useState(false);
  const asked = place === null ? [] : questionsAt(draft, place);
  const next = before !== null && asked.includes(before) ? before : null;
  const suggested = next === null ? questionIdFor(draft, place) : questionIdBefore(draft, place!, next);
  const cardId = typedId ?? suggested ?? "";
  // The place asks its cards in the order of their ids: one the user writes is asked where it sorts, which may not be where they chose.
  const previous = next === null ? (asked.at(-1) ?? null) : (asked[asked.indexOf(next) - 1] ?? null);
  const sortsThere = (previous === null || cardId > previous) && (next === null || cardId < next);
  const whereHint =
    typedId === null
      ? suggested === null && t("studio.draftEdit.noIdBetween")
      : !sortsThere && idUsable(draft, cardId) && t("studio.draftEdit.notAskedThere");

  function submit(event: Event) {
    event.preventDefault();
    const frontText = textOfDraft(front);
    if ("missing" in frontText) return setMissing({ side: "front", entry: frontText.missing });
    const backText = textOfDraft(back);
    if ("missing" in backText) return setMissing({ side: "back", entry: backText.missing });
    setMissing(null);
    if (isEmptyText(frontText.text) || isEmptyText(backText.text)) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    if (!idUsable(draft, cardId)) return;
    const changes: DraftChange[] = [
      { kind: "addCard", id: cardId, card: { front: frontText.text, back: backText.text, created: new Date().toISOString() } },
      ...(place === null ? [] : [{ kind: "addQuestion" as const, card: cardId, place }]),
    ];
    if (!onAdd(changes, cardId)) return;
    rememberLanguages("own", frontText.text, front);
    rememberLanguages("own", backText.text, back);
    setTypedId(null);
    setBefore(null);
    setFront(emptySide());
    setBack(emptySide());
  }

  const errorId = `${id}-error`;
  return (
    <form class="card-edit" onSubmit={submit}>
      <fieldset>
        <legend>{legend}</legend>
        <LangTextField
          id={`${id}-front`}
          label={t("cardContentFields.front")}
          role="front"
          draft={front}
          suggestions={[]}
          missing={missing?.side === "front" ? missing.entry : undefined}
          errorId={errorId}
          onChange={setFront}
        />
        <LangTextField
          id={`${id}-back`}
          label={t("cardContentFields.back")}
          role="back"
          draft={back}
          suggestions={[]}
          missing={missing?.side === "back" ? missing.entry : undefined}
          errorId={errorId}
          onChange={setBack}
        />
        {asked.length > 0 && (
          <>
            <label for={`${id}-where`}>{t("studio.draftEdit.askedWhere")}</label>
            <select
              id={`${id}-where`}
              value={next ?? ""}
              onChange={(event) => {
                setBefore(event.currentTarget.value || null);
                setTypedId(null);
              }}
            >
              <option value="">{t("studio.draftEdit.askedLast")}</option>
              {asked.map((card) => {
                const found = draftCardOf(draft, card);
                const name = found === null ? card : cardName({ ...found.content, id: card }, readerText);
                return (
                  <option key={card} value={card}>
                    {t("studio.draftEdit.askedBefore", { name })}
                  </option>
                );
              })}
            </select>
          </>
        )}
        <IdField id={`${id}-id`} draft={draft} value={cardId} describedBy={whereHint ? `${id}-where-hint` : undefined} onChange={setTypedId} />
        {whereHint && (
          <p id={`${id}-where-hint`} class={typedId === null ? "hint" : "warning"}>
            {whereHint}
          </p>
        )}
        <p id={errorId} class="error" role="alert">
          {missing !== null
            ? t("studio.draftEdit.chooseLanguage", { field: t(`language.field.${missing.side}`) })
            : empty && t("studio.draftEdit.questionEmpty")}
        </p>
        <button type="submit">{t("studio.draftEdit.addQuestion")}</button>
      </fieldset>
    </form>
  );
}
