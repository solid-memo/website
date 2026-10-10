import { useState } from "preact/hooks";
import { EU_LANGUAGES, type ReferenceConcept } from "@solid-memo/vocab/concepts.generated";
import type { ReleaseField } from "@solid-memo/domain/release/releaseCheck";
import { attributionOf, attributionText, authorNames, makingNotesOf, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { useI18n, type I18n } from "@solid-memo/ui/i18n";
import type { DraftEditor, DraftReadOnly } from "./draftEditor";
import { DraftScope, DraftStatus, DraftTextField } from "./DraftParts";
import { LicenseSelect } from "./LicenseSelect";
import { ReleaseAuthors } from "./ReleaseAuthors";
import { ReleaseChecks } from "./ReleaseChecks";
import { ReleaseSources } from "./ReleaseSources";

/** What the release screen links to. */
export interface ReleaseLinks {
  draftsHref: string;
  healthHref: string;
}

/**
 * What a draft's release says of itself beyond its listing, how it was
 * made and from what (docs/studio.md, The release's metadata and
 * provenance): its version notes, languages, licence and publisher, its
 * authors, the attribution of its making ("Compiled by …", with or
 * without "with the help of AI") and the notes on it, its sources, and
 * the checks it had, by machine or AI. Nothing here records that anyone
 * reviewed the release. A draft released is shown, frozen. Opened at a
 * part (`field`, from the release check), that part is where the user
 * arrives.
 */
export function ReleaseMetadataScreen({
  draft,
  readOnly,
  status,
  links,
  field,
  onEdit,
}: {
  draft: ReleaseDraft;
  readOnly: DraftReadOnly | null;
  status: Pick<DraftEditor, "saving" | "failure">;
  links: ReleaseLinks;
  field?: ReleaseField;
  onEdit: DraftEditor["edit"];
}) {
  const { t } = useI18n();
  const held = readOnly !== null;
  const heading = (id: string, part: ReleaseField, text: string) => (
    <h3 id={id} tabIndex={-1} data-arrival={field === part || undefined}>
      {text}
    </h3>
  );
  return (
    <section>
      <header>
        <h2>{t("studio.release.heading")}</h2>
        <p class="hint">{t("studio.release.intro")}</p>
      </header>
      <DraftStatus editor={status} />
      <DraftScope readOnly={readOnly} draftsHref={links.draftsHref} healthHref={links.healthHref}>
        <section aria-labelledby="release-about-heading">
          <h3 id="release-about-heading">{t("studio.release.about")}</h3>
          <VersionNotes draft={draft} arrival={field === "versionNotes"} onEdit={onEdit} />
          <Languages draft={draft} arrival={field === "languages"} onEdit={onEdit} />
          <div data-arrival={field === "license" || undefined} tabIndex={-1}>
            <LicenseSelect
              id="release-license"
              value={draft.root.license ?? ""}
              current={draft.root.license}
              disabled={held}
              onChange={(license) => onEdit([{ kind: "setLicense", license: license === "" ? null : license }])}
            />
            <p class="hint field-hint">{t("studio.release.licenseHint")}</p>
          </div>
          <Publisher draft={draft} arrival={field === "publisher"} onEdit={onEdit} />
        </section>
        <section aria-labelledby="release-authors-heading">
          {heading("release-authors-heading", "authors", t("studio.release.authors"))}
          <ReleaseAuthors draft={draft} onEdit={onEdit} />
        </section>
        <section aria-labelledby="release-making-heading">
          {heading("release-making-heading", "making", t("studio.release.making"))}
          <Attribution draft={draft} onEdit={onEdit} />
          <DraftTextField
            id="release-making-notes"
            label={t("studio.release.makingNotes")}
            role="description"
            field={t("studio.release.makingNotes")}
            text={makingNotesOf(draft)}
            multiline
            disabled={held}
            onSave={(notes) => onEdit([{ kind: "setMakingNotes", notes }], { debounce: true })}
          />
          <p class="hint field-hint">{t("studio.release.makingNotesHint")}</p>
        </section>
        <section aria-labelledby="release-sources-heading">
          {heading("release-sources-heading", "sources", t("studio.release.sources"))}
          <ReleaseSources draft={draft} onEdit={onEdit} />
        </section>
        <section aria-labelledby="release-checks-heading">
          {heading("release-checks-heading", "checks", t("studio.release.checks"))}
          <ReleaseChecks draft={draft} onEdit={onEdit} />
        </section>
      </DraftScope>
    </section>
  );
}

/** The version notes (adms:versionNotes): one text, saved as it is typed; cleared when empty. */
function VersionNotes({ draft, arrival, onEdit }: { draft: ReleaseDraft; arrival: boolean; onEdit: DraftEditor["edit"] }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState(draft.root.versionNotes ?? "");
  return (
    <>
      <label for="release-version-notes">{t("studio.release.versionNotes")}</label>
      <textarea
        id="release-version-notes"
        value={notes}
        rows={2}
        aria-describedby="release-version-notes-hint"
        data-arrival={arrival || undefined}
        onInput={(event) => {
          const text = event.currentTarget.value;
          setNotes(text);
          onEdit([{ kind: "setMeta", meta: { versionNotes: text.trim() === "" ? null : text } }], { debounce: true });
        }}
      />
      <p id="release-version-notes-hint" class="hint field-hint">
        {t("studio.release.versionNotesHint")}
      </p>
    </>
  );
}

/**
 * An EU language's name in the reader's language, by its code ("ENG",
 * which Intl reads as "eng"): its English label from the table when
 * Intl does not know it.
 */
export function languageNameOf(concept: ReferenceConcept, languageParts: I18n["languageParts"]): string {
  const name = languageParts(concept.code.toLowerCase()).name;
  return name.toLowerCase() === concept.code.toLowerCase() ? concept.label : name;
}

/**
 * The languages the release is in (dcterms:language): those of the EU's
 * table the reference data describes (EU_LANGUAGES), each named in the
 * reader's language, and any other the release states, by its IRI, to
 * keep or leave out.
 */
function Languages({ draft, arrival, onEdit }: { draft: ReleaseDraft; arrival: boolean; onEdit: DraftEditor["edit"] }) {
  const { t, languageParts } = useI18n();
  const chosen = draft.root.language;
  const known = new Set(EU_LANGUAGES.map((concept) => concept.iri));
  const options = [
    ...EU_LANGUAGES.map((concept) => ({ iri: concept.iri, name: languageNameOf(concept, languageParts) })),
    ...chosen.filter((iri) => !known.has(iri)).map((iri) => ({ iri, name: t("studio.release.languageOther", { iri }) })),
  ];
  const toggle = (iri: string, on: boolean) =>
    onEdit([{ kind: "setMeta", meta: { language: on ? [...chosen, iri] : chosen.filter((one) => one !== iri) } }]);
  return (
    <fieldset class="release-languages" data-arrival={arrival || undefined} tabIndex={-1}>
      <legend>{t("studio.release.languages")}</legend>
      <p class="hint">{t("studio.release.languagesHint")}</p>
      {options.map((option) => (
        <label key={option.iri} class="radio-option">
          <input type="checkbox" checked={chosen.includes(option.iri)} onChange={(event) => toggle(option.iri, event.currentTarget.checked)} />{" "}
          {option.name}
        </label>
      ))}
    </fieldset>
  );
}

/** Who publishes the release (dcterms:publisher): one of its agents, the one it names elsewhere, or none. */
function Publisher({ draft, arrival, onEdit }: { draft: ReleaseDraft; arrival: boolean; onEdit: DraftEditor["edit"] }) {
  const { t } = useI18n();
  const current = draft.root.publisher;
  const agents = draft.agents.map((node) => ({ iri: `${draft.url}#${node.id}`, name: node.data.name }));
  const other = current !== undefined && !agents.some((agent) => agent.iri === current) ? current : null;
  return (
    <>
      <label for="release-publisher">{t("studio.release.publisher")}</label>
      <select
        id="release-publisher"
        value={current ?? ""}
        aria-describedby="release-publisher-hint"
        data-arrival={arrival || undefined}
        onChange={(event) => {
          const value = event.currentTarget.value;
          onEdit([{ kind: "setMeta", meta: { publisher: value === "" ? null : value } }]);
        }}
      >
        <option value="">{t("studio.release.publisherNone")}</option>
        {agents.map((agent) => (
          <option key={agent.iri} value={agent.iri}>
            {agent.name}
          </option>
        ))}
        {other !== null && <option value={other}>{other}</option>}
      </select>
      <p id="release-publisher-hint" class="hint field-hint">
        {t("studio.release.publisherHint")}
      </p>
    </>
  );
}

/**
 * The attribution of the release's making: none, "Compiled by <its
 * authors>", or that "with the help of AI", each shown as the reader's
 * language words it; the release states it in English and Swedish. It
 * needs an author to name.
 */
function Attribution({ draft, onEdit }: { draft: ReleaseDraft; onEdit: DraftEditor["edit"] }) {
  const { t, locale } = useI18n();
  const names = authorNames(draft);
  const stated = attributionOf(draft);
  const chosen = stated === null ? "none" : stated.ai ? "ai" : "compiled";
  const none = names.length === 0;
  const options = [
    { value: "none", label: t("studio.release.attributionNone"), attribution: null },
    { value: "compiled", label: none ? null : attributionText(names, false, locale), attribution: { ai: false } },
    { value: "ai", label: none ? null : attributionText(names, true, locale), attribution: { ai: true } },
  ];
  return (
    <fieldset>
      <legend>{t("studio.release.attribution")}</legend>
      <p class="hint">{t("studio.release.attributionHint")}</p>
      {options.map(
        (option) =>
          option.label !== null && (
            <label key={option.value} class="radio-option">
              <input
                type="radio"
                name="release-attribution"
                value={option.value}
                checked={chosen === option.value}
                onChange={() => onEdit([{ kind: "setAttribution", attribution: option.attribution }])}
              />{" "}
              {option.label}
            </label>
          ),
      )}
      {none && <p class="hint">{t("studio.release.attributionNeedsAuthors")}</p>}
    </fieldset>
  );
}
