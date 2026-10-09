import { useMemo, useState } from "preact/hooks";
import { changedTexts, REPLACE_FIELDS, type CardEdit, type CardEditPlan, type ReplaceField } from "@solid-memo/domain/cardBulk";
import { UNSTATED } from "@solid-memo/domain/cardQuery";
import type { Card } from "@solid-memo/domain/deck";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";

/**
 * Find and replace in the selected cards, with a preview: as the user
 * types, every card the replace would change is listed with each text
 * it changes, before and after, and every card it leaves as it is for
 * a reason (not one without a match). Nothing is written until the user
 * confirms (`onConfirm`, with the plan they saw).
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
  const { t, readerText, languageLabel } = useI18n();
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
  const byId = new Map(cards.map((card) => [card.id, card]));
  const reasons = preview?.skipped.filter((skip) => skip.reason !== "unchanged") ?? [];
  const tagName = (tag: string) => (tag === "" ? t("studio.cards.unstated") : languageLabel(tag));
  const check = (label: string, checked: boolean, onChange: (checked: boolean) => void) => (
    <label class="studio-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      {label}
    </label>
  );

  return (
    <form
      class="studio-replace"
      aria-labelledby="find-replace-heading"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(edit, preview!);
      }}
    >
      <h3 id="find-replace-heading">{t("studio.cardBulk.findReplace")}</h3>
      <label>
        {t("studio.cardBulk.find")}
        <input type="text" value={find} onInput={(event) => setFind(event.currentTarget.value)} />
      </label>
      <label>
        {t("studio.cardBulk.replaceWith")}
        <input type="text" value={replace} onInput={(event) => setReplace(event.currentTarget.value)} />
      </label>
      <fieldset>
        <legend>{t("studio.cardBulk.fields")}</legend>
        {REPLACE_FIELDS.map((field) => (
          <span key={field}>
            {check(t(`studio.cards.fields.${field}`), fields.has(field), (on) =>
              setFields((all) => new Set(on ? [...all, field] : [...all].filter((other) => other !== field))),
            )}
          </span>
        ))}
      </fieldset>
      <label>
        {t("studio.cardBulk.lang")}
        <select value={language} onChange={(event) => setLanguage(event.currentTarget.value)}>
          <option value="">{t("studio.cards.anyLang")}</option>
          {languages.map((tag) => (
            <option key={tag} value={tag}>
              {tag === UNSTATED ? t("studio.cards.unstated") : languageLabel(tag)}
            </option>
          ))}
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
              {preview.save.map((after) => {
                const before = byId.get(after.id)!;
                return (
                  <li key={after.id}>
                    <strong>{cardName(before, readerText)}</strong>
                    <ul>
                      {changedTexts(before, after).map((change, at) => (
                        <li key={at}>
                          {t(`studio.cardBulk.part.${change.part}`)}, {tagName(change.tag)}:{" "}
                          <del>{change.before}</del>
                          {change.after === undefined ? (
                            <span class="hint"> {t("studio.cardBulk.removed")}</span>
                          ) : (
                            <>
                              {" → "}
                              <ins>{change.after}</ins>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {reasons.length > 0 && (
          <>
            <p>{t("studio.cardBulk.skippedHeading", { count: reasons.length })}</p>
            <ul>
              {reasons.map(({ id, reason }) => (
                <li key={id}>
                  {cardName(byId.get(id)!, readerText)}: {t(`studio.cardBulk.reasons.${reason}`)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <p class="actions">
        <button type="submit" class="primary" disabled={busy || preview === null || preview.save.length === 0}>
          {t("studio.cardBulk.confirmReplace", { count: preview?.save.length ?? 0 })}
        </button>
        <button type="button" onClick={onCancel}>
          {t("studio.bulk.cancel")}
        </button>
      </p>
    </form>
  );
}
