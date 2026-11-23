// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from "preact/hooks";
import {
  changedTexts,
  REPLACE_FIELDS,
  type CardEdit,
  type CardEditPlan,
  type ListedDistractors,
  type ReplaceField,
} from "@solid-memo/domain/cardBulk";
import { UNSTATED } from "@solid-memo/domain/cardQuery";
import type { Card } from "@solid-memo/domain/deck";
import { firstCodePoints } from "@solid-memo/domain/langText";
import { bounded } from "@solid-memo/ui/bounded";
import { useCardText } from "@solid-memo/ui/cardLanguage";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { Dialog } from "@solid-memo/ui/Dialog";

/** At most how many texts of a changed card the preview lists; past it, it says how many more. */
const CHANGE_LIMIT = 10;

/** At most how many code points of a changed text the preview shows, from a little before where it first changes. */
const TEXT_WINDOW = 120;

/** How many UTF-16 units before where a text first changes the preview's window of it starts. */
const TEXT_LEAD = 30;

/** At most how many code points of a card's name or a language's name the preview shows. */
const NAME_WINDOW = 80;

/** A name as the preview shows it: its first NAME_WINDOW code points, with an ellipsis where it is cut. */
function short(name: string): string {
  const shown = firstCodePoints(name, NAME_WINDOW);
  return shown.length < name.length ? `${shown}…` : shown;
}

/** Where two texts first differ: the length of what they start with alike. */
function firstDifference(before: string, after: string): number {
  const end = Math.min(before.length, after.length);
  let at = 0;
  while (at < end && before[at] === after[at]) at++;
  return at;
}

/**
 * What the preview shows of a changed text: at most TEXT_WINDOW code
 * points, from TEXT_LEAD before `at` (never inside a code point), with
 * an ellipsis where it is cut.
 */
function around(text: string, at: number): string {
  let start = Math.max(0, at - TEXT_LEAD);
  const code = text.charCodeAt(start);
  const before = text.charCodeAt(start - 1);
  if (code >= 0xdc00 && code <= 0xdfff && before >= 0xd800 && before <= 0xdbff) start--;
  const rest = text.slice(start);
  const shown = firstCodePoints(rest, TEXT_WINDOW);
  return `${start > 0 ? "…" : ""}${shown}${shown.length < rest.length ? "…" : ""}`;
}

/**
 * Find and replace in the selected cards, with a preview: as the user
 * types, the cards the replace would change are listed with the texts
 * it changes, before and after, and the cards it leaves as it is for a
 * reason (not one without a match). A card can have any number of
 * texts, each of any length, so the preview is bounded: it lists the
 * first LIST_LIMIT changed cards, CHANGE_LIMIT texts of each and
 * TEXT_WINDOW code points of each text around where it changes, and
 * the first LIST_LIMIT cards left as they are, and says how many more
 * there are; each card's name is cut to NAME_WINDOW code points. A distractor that several cards share is edited once, so
 * its change is listed under the first of those cards only. Nothing is
 * written until the user confirms (`onConfirm`, with the whole plan,
 * not only what the preview lists). It is a modal dialog (Dialog):
 * Cancel, Escape or Close leaves it (`onCancel`).
 */
export function FindReplaceDialog({
  cards,
  languages,
  plan,
  busy,
  onConfirm,
  onCancel,
}: {
  /** The selected cards, as they are now: those the plan is made of. */
  cards: readonly Card[];
  /** The languages the language choice offers (cardLanguages). */
  languages: readonly string[];
  /** What a replace would do (planCardEdit, on the cards as they are). */
  plan: (edit: CardEdit) => CardEditPlan;
  busy: boolean;
  onConfirm: (edit: CardEdit, plan: CardEditPlan) => void;
  onCancel: () => void;
}) {
  const { t, languageLabel } = useI18n();
  const { cardText } = useCardText();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [fields, setFields] = useState<ReadonlySet<ReplaceField>>(new Set(REPLACE_FIELDS));
  const [language, setLanguage] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const edit: CardEdit = {
    kind: "replaceText",
    find,
    replace,
    fields: REPLACE_FIELDS.filter((field) => fields.has(field)),
    ...(language === "" ? {} : { language }),
    caseSensitive,
    wholeWord,
  };
  const preview = useMemo(
    () => (find === "" ? null : plan(edit)),
    [find, replace, fields, language, caseSensitive, wholeWord, plan],
  );
  // Named once, not on each keystroke.
  const languageOptions = useMemo(
    () =>
      languages.map((tag) => (
        <option key={tag} value={tag}>
          {tag === UNSTATED ? t("studio.cards.unstated") : languageLabel(tag)}
        </option>
      )),
    [languages, t, languageLabel],
  );
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  // Each listed card with its changes, made once for each preview; a
  // distractor that several cards share is listed once, under the first.
  const changes = useMemo(() => {
    const listed: ListedDistractors = new Map();
    const { shown, more } = bounded(preview?.save ?? []);
    return {
      shown: shown.map((after) => {
        const before = byId.get(after.id)!;
        return {
          before,
          after,
          changes: bounded(changedTexts(before, after, listed), undefined, CHANGE_LIMIT),
        };
      }),
      more,
    };
  }, [preview, byId]);
  const reasons = bounded(preview?.skipped.filter((skip) => skip.reason !== "unchanged") ?? []);
  const tagName = (tag: string) =>
    tag === "" ? t("studio.cards.unstated") : short(languageLabel(tag));
  const check = (label: string, checked: boolean, onChange: (checked: boolean) => void) => (
    <label class="studio-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {label}
    </label>
  );

  return (
    <Dialog heading={t("studio.cardBulk.findReplace")} onClose={onCancel}>
      <form
        class="studio-replace"
        aria-label={t("studio.cardBulk.findReplace")}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(edit, preview!);
        }}
      >
        <label>
          {t("studio.cardBulk.find")}
          <input
            type="text"
            autoFocus
            value={find}
            onInput={(event) => setFind(event.currentTarget.value)}
          />
        </label>
        <label>
          {t("studio.cardBulk.replaceWith")}
          <input
            type="text"
            value={replace}
            onInput={(event) => setReplace(event.currentTarget.value)}
          />
        </label>
        <fieldset>
          <legend>{t("studio.cardBulk.fields")}</legend>
          {REPLACE_FIELDS.map((field) => (
            <span key={field}>
              {check(t(`studio.cards.fields.${field}`), fields.has(field), (on) =>
                setFields(
                  (all) =>
                    new Set(on ? [...all, field] : [...all].filter((other) => other !== field)),
                ),
              )}
            </span>
          ))}
        </fieldset>
        <label>
          {t("studio.cardBulk.lang")}
          <select value={language} onChange={(event) => setLanguage(event.currentTarget.value)}>
            <option value="">{t("studio.cards.anyLang")}</option>
            {languageOptions}
          </select>
        </label>
        {check(t("studio.cardBulk.caseSensitive"), caseSensitive, setCaseSensitive)}
        {check(t("studio.cardBulk.wholeWord"), wholeWord, setWholeWord)}

        <section class="studio-preview" aria-labelledby="find-replace-preview">
          <h4 id="find-replace-preview">{t("studio.cardBulk.preview")}</h4>
          {preview === null ? (
            <p class="hint">{t("studio.cardBulk.previewEmpty")}</p>
          ) : preview.save.length === 0 ? (
            <p>{t("studio.cardBulk.noChange")}</p>
          ) : (
            <>
              <p>{t("studio.cardBulk.changes", { count: preview.save.length })}</p>
              <ul>
                {changes.shown.map(({ before, after, changes: texts }) => (
                  <li key={after.id}>
                    <strong>{short(cardName(before, cardText))}</strong>
                    {texts.shown.length > 0 && (
                      <ul>
                        {texts.shown.map((change, at) => {
                          const from = firstDifference(change.before ?? "", change.after ?? "");
                          return (
                            <li key={at}>
                              {t(`studio.cardBulk.part.${change.part}`)}, {tagName(change.tag)}:{" "}
                              <del>{around(change.before ?? "", from)}</del>
                              {change.after === undefined ? (
                                <span class="hint"> {t("studio.cardBulk.removed")}</span>
                              ) : (
                                <>
                                  {" → "}
                                  <ins>{around(change.after, from)}</ins>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {texts.more > 0 && (
                      <p class="hint">{t("studio.cardBulk.moreChanges", { count: texts.more })}</p>
                    )}
                  </li>
                ))}
              </ul>
              {changes.more > 0 && (
                <p class="hint">{t("studio.cardBulk.moreCards", { count: changes.more })}</p>
              )}
            </>
          )}
          {reasons.shown.length > 0 && (
            <>
              <p>
                {t("studio.cardBulk.skippedHeading", {
                  count: reasons.shown.length + reasons.more,
                })}
              </p>
              <ul>
                {reasons.shown.map(({ id, reason }) => (
                  <li key={id}>
                    {short(cardName(byId.get(id)!, cardText))}:{" "}
                    {t(`studio.cardBulk.reasons.${reason}`)}
                  </li>
                ))}
              </ul>
              {reasons.more > 0 && (
                <p class="hint">{t("studio.cardBulk.moreSkipped", { count: reasons.more })}</p>
              )}
            </>
          )}
        </section>
        <p class="actions">
          <button
            type="submit"
            class="primary"
            disabled={busy || preview === null || preview.save.length === 0}
          >
            {t("studio.cardBulk.confirmReplace", { count: preview?.save.length ?? 0 })}
          </button>
          <button type="button" onClick={onCancel}>
            {t("studio.bulk.cancel")}
          </button>
        </p>
      </form>
    </Dialog>
  );
}
