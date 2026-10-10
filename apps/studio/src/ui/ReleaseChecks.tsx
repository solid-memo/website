import { useState } from "preact/hooks";
import type { CheckActivity, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseText } from "@solid-memo/domain/release/releaseModel";
import { checkIdFor, checksOf, type CheckView } from "@solid-memo/domain/release/releaseMetadata";
import { useI18n } from "@solid-memo/ui/i18n";
import type { DraftEditor } from "./draftEditor";

/** A check's form: its fields as typed, its day as a date input gives it. */
interface CheckForm {
  check: CheckActivity["check"];
  label: string;
  scope: string;
  outcome: string;
  /** YYYY-MM-DD. */
  day: string;
  language: "en" | "sv";
}

/** The check a form records: its day, unchanged, keeps the time the check had. */
function activityOf(form: CheckForm, before: CheckActivity | null): CheckActivity {
  const endedAt = before !== null && before.endedAt.slice(0, 10) === form.day ? before.endedAt : `${form.day}T00:00:00Z`;
  return { check: form.check, label: form.label, scope: form.scope, outcome: form.outcome, endedAt, language: form.language };
}

/**
 * The checks the release had (docs/studio.md, The release's metadata and
 * provenance): this version's, each recorded by machine or AI, never as a
 * human review (checkActivityTriples words it so), edited or deleted;
 * one written otherwise is only deleted. Those carried from earlier
 * versions are shown as they are, never edited. A new check is recorded
 * under them, `#check-<n>`.
 */
export function ReleaseChecks({ draft, onEdit }: { draft: ReleaseDraft; onEdit: DraftEditor["edit"] }) {
  const { t, locale } = useI18n();
  const checks = checksOf(draft);
  const own = checks.filter((check) => !check.carried);
  const carried = checks.filter((check) => check.carried);
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const blank: CheckForm = { check: "machine", label: "", scope: "", outcome: "", day: today, language: locale === "sv" ? "sv" : "en" };
  return (
    <>
      <p class="hint">{t("studio.release.checksHint")}</p>
      {own.length === 0 ? (
        <p>{t("studio.release.noChecks")}</p>
      ) : (
        <ul class="release-checks">
          {own.map((check) =>
            editing === check.id && check.activity !== null ? (
              <li key={check.id}>
                <CheckFormFields
                  id="release-check"
                  legend={nameOf(check)}
                  start={{ ...check.activity, day: check.activity.endedAt.slice(0, 10), language: check.activity.language === "sv" ? "sv" : "en" }}
                  submit={t("studio.release.saveCheck")}
                  onSubmit={(form) => {
                    const made = onEdit([{ kind: "editCheckActivity", id: check.id, activity: activityOf(form, check.activity) }]) === null;
                    if (made) setEditing(null);
                    return made;
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={check.id}>
                <CheckSummary check={check} />
                {check.activity === null ? (
                  <p class="hint">{t("studio.release.checkOtherwise")}</p>
                ) : (
                  <>
                    <button type="button" aria-label={t("studio.release.editOf", { name: nameOf(check) })} onClick={() => setEditing(check.id)}>
                      {t("studio.release.edit")}
                    </button>{" "}
                  </>
                )}
                <button type="button" aria-label={t("studio.release.removeOf", { name: nameOf(check) })} onClick={() => onEdit([{ kind: "deleteActivity", id: check.id }])}>
                  {t("studio.release.remove")}
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      <CheckFormFields
        id="release-new-check"
        legend={t("studio.release.newCheck")}
        start={blank}
        submit={t("studio.release.addCheck")}
        onSubmit={(form) => onEdit([{ kind: "addCheckActivity", id: checkIdFor(draft), activity: activityOf(form, null) }]) === null}
      />
      {carried.length > 0 && (
        <>
          <h4>{t("studio.release.carried")}</h4>
          <p class="hint">{t("studio.release.carriedHint")}</p>
          <ul class="release-checks">
            {carried.map((check) => (
              <li key={check.id}>
                <CheckSummary check={check} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** A check by its label, else its id. */
function nameOf(check: CheckView): string {
  return check.label[0]?.value ?? check.id;
}

/** A check as its record says it: its label, when it ended, and its comments (its scope and outcome), each in its language. */
function CheckSummary({ check }: { check: CheckView }) {
  const { partLang } = useI18n();
  const said = (text: ReleaseText) => <span lang={partLang(text.language)}>{text.value}</span>;
  return (
    <>
      <p>
        <strong>{check.label.length === 0 ? check.id : said(check.label[0]!)}</strong>
        {check.endedAt !== "" && <> · {check.endedAt.slice(0, 10)}</>}
      </p>
      {check.comments.map((comment, index) => (
        <p key={index} class="hint">
          {said(comment)}
        </p>
      ))}
    </>
  );
}

/**
 * A check's form: by machine or AI, what it looked at, its scope and
 * outcome, the day it ended and the language it is written in. Every
 * text is asked; `onSubmit` says whether the change was made, and a new
 * check's form is then empty again.
 */
function CheckFormFields({
  id,
  legend,
  start,
  submit,
  onSubmit,
  onCancel,
}: {
  id: string;
  legend: string;
  start: CheckForm;
  submit: string;
  onSubmit: (form: CheckForm) => boolean;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(start);
  const [empty, setEmpty] = useState(false);
  const set = (next: Partial<CheckForm>) => {
    setEmpty(false);
    setForm({ ...form, ...next });
  };
  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault();
        if ([form.label, form.scope, form.outcome].some((text) => text.trim() === "") || form.day === "") {
          setEmpty(true);
          return;
        }
        if (onSubmit(form) && onCancel === undefined) setForm(start);
      }}
    >
      <fieldset>
        <legend>{legend}</legend>
        <fieldset>
          <legend>{t("studio.release.checkKind")}</legend>
          {(["machine", "ai"] as const).map((check) => (
            <label key={check} class="radio-option">
              <input type="radio" name={`${id}-kind`} checked={form.check === check} onChange={() => set({ check })} />{" "}
              {t(check === "machine" ? "studio.release.checkMachine" : "studio.release.checkAi")}
            </label>
          ))}
        </fieldset>
        <label for={`${id}-label`}>{t("studio.release.checkLabel")}</label>
        <input id={`${id}-label`} value={form.label} autocomplete="off" onInput={(event) => set({ label: event.currentTarget.value })} />
        <label for={`${id}-scope`}>{t("studio.release.checkScope")}</label>
        <textarea id={`${id}-scope`} rows={2} value={form.scope} onInput={(event) => set({ scope: event.currentTarget.value })} />
        <label for={`${id}-outcome`}>{t("studio.release.checkOutcome")}</label>
        <textarea id={`${id}-outcome`} rows={2} value={form.outcome} onInput={(event) => set({ outcome: event.currentTarget.value })} />
        <label for={`${id}-day`}>{t("studio.release.checkEnded")}</label>
        <input id={`${id}-day`} type="date" value={form.day} onInput={(event) => set({ day: event.currentTarget.value })} />
        <label for={`${id}-language`}>{t("studio.release.checkLanguage")}</label>
        <select id={`${id}-language`} value={form.language} onChange={(event) => set({ language: event.currentTarget.value === "sv" ? "sv" : "en" })}>
          <option value="en">{t("studio.release.checkLanguageEn")}</option>
          <option value="sv">{t("studio.release.checkLanguageSv")}</option>
        </select>
        <p class="error" role="alert">
          {empty && t("studio.release.checkEmpty")}
        </p>
        <button type="submit">{submit}</button>
        {onCancel !== undefined && (
          <>
            {" "}
            <button type="button" onClick={onCancel}>
              {t("studio.release.cancel")}
            </button>
          </>
        )}
      </fieldset>
    </form>
  );
}
