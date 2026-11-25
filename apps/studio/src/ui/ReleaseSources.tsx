// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from "preact/hooks";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import {
  sourceChange,
  sourceIri,
  sourceLicenseValid,
  sourcesOf,
  type SourceForm,
  type SourceView,
} from "@solid-memo/domain/release/releaseMetadata";
import { firstCodePoints } from "@solid-memo/domain/langText";
import { licenseLabel } from "@solid-memo/domain/license";
import { useI18n, type I18n } from "@solid-memo/ui/i18n";
import type { DraftEditor } from "./draftEditor";
import { bounded, MoreInRelease } from "./ReleaseLists";

/**
 * At most how many sources the screen lists, each as its line; past it,
 * it says how many more there are. Those it doesn't list stay in the
 * release.
 */
export const SOURCE_LIMIT = 50;

/**
 * At most how many creators of a source the screen names, in its line
 * and in its editor; past it, it says how many more there are. A
 * release can name any number of creators of a source, each as long as
 * a term; those it doesn't name stay in the release, and saving the
 * source keeps them as they are.
 */
export const CREATOR_LIMIT = 10;

/** At most how many code points of a creator's name the screen shows; past them, the name is cut with an ellipsis. */
export const CREATOR_NAME_LIMIT = 200;

/**
 * Creators of a source as the screen names them: the first
 * CREATOR_LIMIT, each cut to CREATOR_NAME_LIMIT code points (never
 * inside one), comma-separated, then how many more there are.
 */
function creatorNames(creators: readonly string[], t: I18n["t"]): string {
  const { shown, more } = bounded(creators, CREATOR_LIMIT);
  const names = shown
    .map((name) => {
      const kept = firstCodePoints(name, CREATOR_NAME_LIMIT);
      return kept.length < name.length ? `${kept}…` : kept;
    })
    .join(", ");
  return more > 0 ? t("studio.release.sourceCreatorsMore", { names, count: more }) : names;
}

const BLANK: SourceForm = {
  title: "",
  creator: "",
  license: "",
  evidence: "",
  derivedFrom: true,
  used: true,
};

/**
 * The release's sources (docs/studio.md, The release's metadata and
 * provenance): each by its address, shown as text and never opened, with
 * its title, creator and license; one at a time opened to edit (what it
 * states, and whether the release is derived from it and its making used
 * it), or removed. A source only an earlier version's making used has
 * nothing of this version's to remove: that making still names it. A
 * long list of sources stays light: only the one being edited has a
 * form, at most SOURCE_LIMIT are listed, and at most CREATOR_LIMIT
 * creators of each are named. A new source is added
 * under them.
 */
export function ReleaseSources({
  draft,
  onEdit,
}: {
  draft: ReleaseDraft;
  onEdit: DraftEditor["edit"];
}) {
  const { t } = useI18n();
  const sources = useMemo(() => bounded(sourcesOf(draft), SOURCE_LIMIT), [draft]);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <p class="hint">{t("studio.release.sourcesHint")}</p>
      {sources.shown.length === 0 ? (
        <p>{t("studio.release.noSources")}</p>
      ) : (
        <ul class="release-sources">
          {sources.shown.map((source) => (
            <li key={source.iri}>
              {editing === source.iri ? (
                <SourceEditor
                  source={source}
                  onSave={(form) => {
                    if (onEdit([sourceChange(source.iri, form, source.others)]) === null)
                      setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <SourceSummary
                  source={source}
                  onEdit={() => setEditing(source.iri)}
                  onRemove={() => onEdit([{ kind: "setSource", iri: source.iri, source: null }])}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <MoreInRelease count={sources.more} />
      <NewSourceForm draft={draft} onEdit={onEdit} />
    </>
  );
}

/** A source as a line: its title (else its address), its address, creators and license, and how the release uses it. */
function SourceSummary({
  source,
  onEdit,
  onRemove,
}: {
  source: SourceView;
  onEdit: () => void;
  onRemove: () => void;
}) {
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
        {[
          creatorNames(source.creators, t),
          source.license === "" ? "" : licenseLabel(source.license),
          ...uses,
        ]
          .filter((one) => one !== "")
          .join(" · ")}
      </p>
      {source.usedEarlier && <p class="hint">{t("studio.release.usedEarlier")}</p>}
      <button
        type="button"
        aria-label={t("studio.release.editOf", { name: source.title || source.iri })}
        onClick={onEdit}
      >
        {t("studio.release.edit")}
      </button>
      {(source.derivedFrom || source.used) && (
        <>
          {" "}
          <button
            type="button"
            aria-label={t("studio.release.removeOf", { name: source.title || source.iri })}
            onClick={onRemove}
          >
            {t("studio.release.remove")}
          </button>
        </>
      )}
    </>
  );
}

/** The fields of a source's form: its texts and license (its address, checked when saved), and how the release uses it. */
function SourceFields({
  id,
  form,
  licenseInvalid,
  onChange,
}: {
  id: string;
  form: SourceForm;
  licenseInvalid: boolean;
  onChange: (form: SourceForm) => void;
}) {
  const { t } = useI18n();
  const text = (field: "title" | "creator", label: string) => (
    <>
      <label for={`${id}-${field}`}>{label}</label>
      <input
        id={`${id}-${field}`}
        value={form[field]}
        autocomplete="off"
        onInput={(event) => onChange({ ...form, [field]: event.currentTarget.value })}
      />
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
      <textarea
        id={`${id}-evidence`}
        rows={3}
        value={form.evidence}
        onInput={(event) => onChange({ ...form, evidence: event.currentTarget.value })}
      />
      <label class="radio-option">
        <input
          type="checkbox"
          checked={form.derivedFrom}
          onChange={(event) => onChange({ ...form, derivedFrom: event.currentTarget.checked })}
        />{" "}
        {t("studio.release.derivedFrom")}
      </label>
      <label class="radio-option">
        <input
          type="checkbox"
          checked={form.used}
          onChange={(event) => onChange({ ...form, used: event.currentTarget.checked })}
        />{" "}
        {t("studio.release.used")}
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

/** A source being edited: its form, saved by its button, its other creators named and its other statements counted, all kept as they are. */
function SourceEditor({
  source,
  onSave,
  onCancel,
}: {
  source: SourceView;
  onSave: (form: SourceForm) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<SourceForm>(source);
  const [problem, setProblem] = useState<"licenseInvalid" | "sourceUnused" | null>(null);
  // The creators after the first, which the form doesn't edit: named here (the first CREATOR_LIMIT, and how many more), and so not counted with the rest.
  const moreCreators = source.creators.slice(1);
  const unshown = source.others.length - moreCreators.length;
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
        {moreCreators.length > 0 && (
          <p class="hint">
            {t("studio.release.sourceMoreCreators", { names: creatorNames(moreCreators, t) })}
          </p>
        )}
        {unshown > 0 && <p class="hint">{t("studio.release.sourceOthers", { count: unshown })}</p>}
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
  const [problem, setProblem] = useState<
    "sourceInvalid" | "sourceExists" | "licenseInvalid" | "sourceUnused" | null
  >(null);
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
