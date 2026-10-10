import { useState } from "preact/hooks";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { sourceChange, sourceIri, sourceLicenseValid, sourcesOf, type SourceForm, type SourceView } from "@solid-memo/domain/release/releaseMetadata";
import { licenseLabel } from "@solid-memo/domain/license";
import { useI18n } from "@solid-memo/ui/i18n";
import type { DraftEditor } from "./draftEditor";

const BLANK: SourceForm = { title: "", creator: "", license: "", evidence: "", derivedFrom: true, used: true };

/**
 * The release's sources (docs/studio.md, The release's metadata and
 * provenance): each by its address, shown as text and never opened, with
 * its title, creator and licence; one at a time opened to edit (what it
 * states, and whether the release is derived from it and its making used
 * it), or removed. A source only an earlier version's making used has
 * nothing of this version's to remove: that making still names it. A
 * long list of sources stays light: only the one being edited has a
 * form. A new source is added under them.
 */
export function ReleaseSources({ draft, onEdit }: { draft: ReleaseDraft; onEdit: DraftEditor["edit"] }) {
  const { t } = useI18n();
  const sources = sourcesOf(draft);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <p class="hint">{t("studio.release.sourcesHint")}</p>
      {sources.length === 0 ? (
        <p>{t("studio.release.noSources")}</p>
      ) : (
        <ul class="release-sources">
          {sources.map((source) => (
            <li key={source.iri}>
              {editing === source.iri ? (
                <SourceEditor
                  source={source}
                  onSave={(form) => {
                    if (onEdit([sourceChange(source.iri, form, source.others)]) === null) setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <SourceSummary source={source} onEdit={() => setEditing(source.iri)} onRemove={() => onEdit([{ kind: "setSource", iri: source.iri, source: null }])} />
              )}
            </li>
          ))}
        </ul>
      )}
      <NewSourceForm draft={draft} onEdit={onEdit} />
    </>
  );
}

/** A source as a line: its title (else its address), its address, creator and licence, and how the release uses it. */
function SourceSummary({ source, onEdit, onRemove }: { source: SourceView; onEdit: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const uses = [
    ...(source.derivedFrom ? [t("studio.release.derivedFrom")] : []),
    ...(source.used ? [t("studio.release.used")] : []),
  ];
  return (
    <>
      <p>
        <strong>{source.title === "" ? source.iri : source.title}</strong>
        {source.title !== "" && (
          <>
            {" "}
            <code>{source.iri}</code>
          </>
        )}
      </p>
      <p class="hint">
        {[source.creator, source.license === "" ? "" : licenseLabel(source.license), ...uses].filter((one) => one !== "").join(" · ")}
      </p>
      {source.usedEarlier && <p class="hint">{t("studio.release.usedEarlier")}</p>}
      <button type="button" aria-label={t("studio.release.editOf", { name: source.title || source.iri })} onClick={onEdit}>
        {t("studio.release.edit")}
      </button>
      {(source.derivedFrom || source.used) && (
        <>
          {" "}
          <button type="button" aria-label={t("studio.release.removeOf", { name: source.title || source.iri })} onClick={onRemove}>
            {t("studio.release.remove")}
          </button>
        </>
      )}
    </>
  );
}

/** The fields of a source's form: its texts and licence (its address, checked when saved), and how the release uses it. */
function SourceFields({ id, form, licenseInvalid, onChange }: { id: string; form: SourceForm; licenseInvalid: boolean; onChange: (form: SourceForm) => void }) {
  const { t } = useI18n();
  const text = (field: "title" | "creator", label: string) => (
    <>
      <label for={`${id}-${field}`}>{label}</label>
      <input id={`${id}-${field}`} value={form[field]} autocomplete="off" onInput={(event) => onChange({ ...form, [field]: event.currentTarget.value })} />
    </>
  );
  return (
    <>
      {text("title", t("studio.release.sourceTitle"))}
      {text("creator", t("studio.release.sourceCreator"))}
      <label for={`${id}-license`}>{t("studio.release.sourceLicense")}</label>
      <input
        id={`${id}-license`}
        // Checked when saved, in words of the Studio's, not by the browser's own validation.
        type="text"
        inputMode="url"
        value={form.license}
        autocomplete="off"
        aria-invalid={licenseInvalid}
        aria-describedby={`${id}-error`}
        onInput={(event) => onChange({ ...form, license: event.currentTarget.value })}
      />
      <label for={`${id}-evidence`}>{t("studio.release.sourceEvidence")}</label>
      <textarea id={`${id}-evidence`} rows={3} value={form.evidence} onInput={(event) => onChange({ ...form, evidence: event.currentTarget.value })} />
      <label class="radio-option">
        <input type="checkbox" checked={form.derivedFrom} onChange={(event) => onChange({ ...form, derivedFrom: event.currentTarget.checked })} />{" "}
        {t("studio.release.derivedFrom")}
      </label>
      <label class="radio-option">
        <input type="checkbox" checked={form.used} onChange={(event) => onChange({ ...form, used: event.currentTarget.checked })} /> {t("studio.release.used")}
      </label>
    </>
  );
}

/**
 * Whether a source's form says how the release uses it: derived from it,
 * or this version's making used it. One an earlier version's making used
 * (`usedEarlier`) is that making's still, so it may be neither.
 */
function sourceUseGiven(form: SourceForm, usedEarlier = false): boolean {
  return form.derivedFrom || form.used || usedEarlier;
}

/** A source being edited: its form, saved by its button, its other statements kept as they are. */
function SourceEditor({ source, onSave, onCancel }: { source: SourceView; onSave: (form: SourceForm) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<SourceForm>(source);
  const [problem, setProblem] = useState<"licenseInvalid" | "sourceUnused" | null>(null);
  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sourceLicenseValid(form.license, source.license)) {
          setProblem("licenseInvalid");
          return;
        }
        if (!sourceUseGiven(form, source.usedEarlier)) {
          setProblem("sourceUnused");
          return;
        }
        onSave(form);
      }}
    >
      <fieldset>
        <legend>
          <code>{source.iri}</code>
        </legend>
        <SourceFields
          id="release-source"
          form={form}
          licenseInvalid={problem === "licenseInvalid"}
          onChange={(next) => {
            setProblem(null);
            setForm(next);
          }}
        />
        <p id="release-source-error" class="error" role="alert">
          {problem !== null && t(`studio.release.${problem}`)}
        </p>
        {source.others.length > 0 && <p class="hint">{t("studio.release.sourceOthers", { count: source.others.length })}</p>}
        <button type="submit">{t("studio.release.saveSource")}</button>{" "}
        <button type="button" onClick={onCancel}>
          {t("studio.release.cancel")}
        </button>
      </fieldset>
    </form>
  );
}

/** A new source: its address (an http(s) URL the release does not name yet) and its form. */
function NewSourceForm({ draft, onEdit }: { draft: ReleaseDraft; onEdit: DraftEditor["edit"] }) {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [form, setForm] = useState(BLANK);
  const [problem, setProblem] = useState<"sourceInvalid" | "sourceExists" | "licenseInvalid" | "sourceUnused" | null>(null);
  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault();
        const iri = sourceIri(address);
        const known = sourcesOf(draft).some((source) => source.iri === iri);
        if (iri === null || known) {
          setProblem(iri === null ? "sourceInvalid" : "sourceExists");
          return;
        }
        if (!sourceLicenseValid(form.license)) {
          setProblem("licenseInvalid");
          return;
        }
        if (!sourceUseGiven(form)) {
          setProblem("sourceUnused");
          return;
        }
        if (onEdit([sourceChange(iri, form)]) !== null) return;
        setAddress("");
        setForm(BLANK);
      }}
    >
      <fieldset>
        <legend>{t("studio.release.newSource")}</legend>
        <label for="release-new-source-iri">{t("studio.release.sourceIri")}</label>
        <input
          id="release-new-source-iri"
          // Checked here, in words of the Studio's, not by the browser's own validation.
          type="text"
          inputMode="url"
          value={address}
          autocomplete="off"
          aria-invalid={problem === "sourceInvalid" || problem === "sourceExists"}
          aria-describedby="release-new-source-error"
          onInput={(event) => {
            setProblem(null);
            setAddress(event.currentTarget.value);
          }}
        />
        <SourceFields
          id="release-new-source"
          form={form}
          licenseInvalid={problem === "licenseInvalid"}
          onChange={(next) => {
            setProblem(null);
            setForm(next);
          }}
        />
        <p id="release-new-source-error" class="error" role="alert">
          {problem !== null && t(`studio.release.${problem}`)}
        </p>
        <button type="submit">{t("studio.release.addSource")}</button>
      </fieldset>
    </form>
  );
}
