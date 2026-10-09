import { useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import type { CardEdit, CardEditPlan, StatedSide } from "@solid-memo/domain/cardBulk";
import type { Card } from "@solid-memo/domain/deck";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { FindReplaceDialog } from "./FindReplaceDialog";

/** The form an edit opens, to say how. */
type Form = "language" | "replace";

/**
 * What can be done with the cards selected in the workbench, all at
 * once: retire them, restore them, write them in Markdown or as plain
 * text, state the language of their untagged sides, find and replace
 * in them (FindReplaceDialog, with a preview), or delete them, once the
 * user confirms. Each edit is planned on the cards as they are (`plan`)
 * and made with that plan (`onEdit`), which resolves to whether it was
 * made; an edit that would change none of them is not made, and says
 * so. Only one is made at a time (`busy`).
 */
export function CardBulkActions({
  cards,
  languages,
  busy,
  plan,
  onEdit,
}: {
  /** The selected cards the table shows. */
  cards: readonly Card[];
  /** The languages the find and replace offers. */
  languages: readonly string[];
  busy: boolean;
  plan: (edit: CardEdit) => CardEditPlan;
  onEdit: (edit: CardEdit, plan: CardEditPlan) => Promise<boolean>;
}) {
  const { t, errorText } = useI18n();
  const [form, setForm] = useState<Form | null>(null);
  const [nothing, setNothing] = useState(false);
  const [tag, setTag] = useState("");
  const [side, setSide] = useState<StatedSide | "">("");
  const [tagError, setTagError] = useState<AppError | null>(null);

  const toggle = (which: Form) => {
    setNothing(false);
    setForm((open) => (open === which ? null : which));
  };

  /** Make the edit, unless it changes nothing; done, its form closes. */
  function edit(change: CardEdit, planned = plan(change)) {
    const changes = planned.save.length + planned.remove.length;
    setNothing(changes === 0);
    if (changes === 0) return;
    void onEdit(change, planned).then((ok) => {
      if (ok) setForm(null);
    });
  }

  function remove() {
    setForm(null);
    if (!window.confirm(t("studio.cardBulk.removeConfirm", { count: cards.length }))) return;
    edit({ kind: "remove" });
  }

  function stateLanguage() {
    if (canonicalTag(tag) === null) {
      setTagError(new AppError("textLanguageInvalid", { tag }));
      return;
    }
    setTagError(null);
    edit({ kind: "stateLanguage", tag, ...(side === "" ? {} : { side }) });
  }

  const simple = (label: string, change: CardEdit) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setForm(null);
        edit(change);
      }}
    >
      {label}
    </button>
  );

  return (
    <div class="studio-bulk" role="group" aria-label={t("studio.cardBulk.label")}>
      <div class="actions">
        {simple(t("studio.cardBulk.retire"), { kind: "retire" })}
        {simple(t("studio.cardBulk.restore"), { kind: "restore" })}
        {simple(t("studio.cardBulk.markdownOn"), { kind: "setTextFormat", markdown: true })}
        {simple(t("studio.cardBulk.markdownOff"), { kind: "setTextFormat", markdown: false })}
        {(["language", "replace"] as const).map((which) => (
          <button key={which} type="button" aria-expanded={form === which} disabled={busy} onClick={() => toggle(which)}>
            {t(which === "language" ? "studio.cardBulk.stateLanguage" : "studio.cardBulk.findReplace")}
          </button>
        ))}
        <button type="button" class="danger" disabled={busy} onClick={remove}>
          {t("studio.cardBulk.remove")}
        </button>
      </div>
      {nothing && <p role="status">{t("studio.cardBulk.nothing")}</p>}
      {form === "language" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            stateLanguage();
          }}
        >
          <label>
            {t("studio.cardBulk.tag")}
            <input type="text" value={tag} onInput={(event) => setTag(event.currentTarget.value)} />
          </label>
          <label>
            {t("studio.cardBulk.side")}
            <select value={side} onChange={(event) => setSide(event.currentTarget.value as StatedSide | "")}>
              <option value="">{t("studio.cardBulk.sides.both")}</option>
              <option value="front">{t("studio.cardBulk.sides.front")}</option>
              <option value="back">{t("studio.cardBulk.sides.back")}</option>
            </select>
          </label>
          <p class="hint">{t("studio.cardBulk.stateHint")}</p>
          <ErrorMessage error={errorText(tagError)} />
          <p class="actions">
            <button type="submit" class="primary" disabled={busy}>
              {t("studio.bulk.apply")}
            </button>
            <button type="button" onClick={() => setForm(null)}>
              {t("studio.bulk.cancel")}
            </button>
          </p>
        </form>
      )}
      {form === "replace" && (
        <FindReplaceDialog
          cards={cards}
          languages={languages}
          plan={plan}
          busy={busy}
          onConfirm={edit}
          onCancel={() => setForm(null)}
        />
      )}
    </div>
  );
}
