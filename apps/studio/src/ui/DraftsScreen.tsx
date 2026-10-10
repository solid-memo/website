import { useState } from "preact/hooks";
import type { CreatedDraft, NewDraft } from "@solid-memo/application/releaseDrafts";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { draftOf, LangTextField, rememberLanguages, textOfDraft, useMissingLanguage } from "@solid-memo/ui/LangTextField";
import { recentLanguages } from "@solid-memo/ui/remembered";
import { ReadOnlyScope } from "./ReadOnly";

/** What a new draft starts from, as the form offers it. */
type Start = NewDraft["kind"];

const STARTS: readonly Start[] = ["blankDeck", "blankCourse", "fromDeck", "nextVersionOf", "fromFile"];

/**
 * The drafts of releases an instance holds (docs/studio.md, Drafts):
 * each with its kind, version and whether it was released, a link to it
 * (one that can be read), to delete;
 * and a new one, started from nothing (a deck or a course, by its name
 * in a language the user states), from a deck of the instance, as the
 * next version of a release (by its address), or from a release saved as
 * a file. A draft made of a copy of a release says so, and offers to
 * start the next version of that release instead, which keeps its
 * learners' progress. Making or deleting a draft changes the catalogue,
 * so both are held while it may not be changed (`readOnly`).
 */
export function DraftsScreen({
  instance,
  drafts,
  decks,
  readOnly,
  healthHref,
  draftHref,
  creating,
  created,
  createError,
  onCreate,
  deleting,
  deleted,
  deleteError,
  onDelete,
}: {
  instance: Instance;
  drafts: readonly ReleaseDraftSummary[];
  /** The instance's decks, to start a draft of one. */
  decks: readonly Deck[];
  /** Why no draft can be made or deleted now (useDataCheck); null when one can. */
  readOnly: ReadOnlyReason | null;
  /** The instance's health, where data set aside is repaired. */
  healthHref: string;
  /** A draft's overview, where it is written. */
  draftHref: (draft: ReleaseDraftSummary) => string;
  creating: boolean;
  /** The draft the last start made; null before one did. */
  created: CreatedDraft | null;
  createError: ErrorText | null;
  onCreate: (from: NewDraft) => void;
  /** The draft being deleted; null when none is. */
  deleting: ReleaseDraftSummary | null;
  /** The draft the last delete deleted; null before one did. */
  deleted: ReleaseDraftSummary | null;
  deleteError: ErrorText | null;
  onDelete: (draft: ReleaseDraftSummary) => void;
}) {
  const { t, tx, errorText, readerText } = useI18n();
  const [start, setStart] = useState<Start>("blankDeck");
  const [title, setTitle] = useState(() => draftOf(undefined, [], { tag: recentLanguages("deck")[0] ?? null }));
  const [deckUrl, setDeckUrl] = useState(decks[0]?.url ?? "");
  const [releaseUrl, setReleaseUrl] = useState("");
  const { missing, ask, clear } = useMissingLanguage("draft-name");

  const nameOf = (draft: ReleaseDraftSummary) =>
    Object.keys(draft.title).length === 0 ? t("studio.drafts.untitled", { name: draft.name }) : readerText(draft.title);

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (creating) return;
    switch (start) {
      case "blankDeck":
      case "blankCourse": {
        const result = textOfDraft(title);
        if ("missing" in result) {
          ask(result.missing);
          return;
        }
        rememberLanguages("deck", result.text, title);
        onCreate({ kind: start, title: result.text });
        return;
      }
      case "fromDeck":
        onCreate({ kind: "fromDeck", deck: decks.find((deck) => deck.url === deckUrl)! });
        return;
      case "nextVersionOf":
        onCreate({ kind: "nextVersionOf", url: releaseUrl.trim() });
        return;
      case "fromFile":
        onCreate({ kind: "fromFile" });
    }
  }

  return (
    <section>
      <header>
        <h2>{t("studio.drafts.heading", { instance: instance.name })}</h2>
      </header>
      <p class="hint">{t("studio.drafts.intro")}</p>
      <ReadOnlyScope reason={readOnly} subject="catalogue" healthHref={healthHref}>
        <section aria-labelledby="drafts-new-heading">
          <h3 id="drafts-new-heading">{t("studio.drafts.new")}</h3>
          <form class="card-edit" onSubmit={handleSubmit}>
            <fieldset>
              <legend>{t("studio.drafts.from")}</legend>
              {STARTS.map((option) => (
                <label key={option} class="radio-option">
                  <input
                    type="radio"
                    name="draft-start"
                    value={option}
                    checked={start === option}
                    disabled={option === "fromDeck" && decks.length === 0}
                    onChange={() => setStart(option)}
                  />
                  {t(`studio.drafts.start.${option}`)}
                </label>
              ))}
            </fieldset>
            {(start === "blankDeck" || start === "blankCourse") && (
              <LangTextField
                id="draft-name"
                label={t("studio.drafts.name")}
                role="deckName"
                draft={title}
                suggestions={[]}
                required
                disabled={creating}
                missing={missing}
                errorId="draft-create-error"
                onChange={(next) => {
                  clear();
                  setTitle(next);
                }}
              />
            )}
            {start === "fromDeck" && (
              <label>
                {t("studio.drafts.deck")}
                <select value={deckUrl} onChange={(event) => setDeckUrl(event.currentTarget.value)}>
                  {decks.map((deck) => (
                    <option key={deck.url} value={deck.url}>
                      {readerText(deck.title)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {start === "nextVersionOf" && (
              <>
                <label>
                  {t("studio.drafts.release")}
                  <input
                    type="url"
                    required
                    aria-describedby="draft-release-hint"
                    value={releaseUrl}
                    onInput={(event) => setReleaseUrl(event.currentTarget.value)}
                  />
                </label>
                <p id="draft-release-hint" class="hint">
                  {t("studio.drafts.releaseHint")}
                </p>
              </>
            )}
            {start === "fromFile" && <p class="hint">{t("studio.drafts.fileHint")}</p>}
            {/* Only aria-disabled while it creates, so it keeps the focus should that fail. */}
            <button type="submit" class="primary" aria-disabled={creating}>
              {t(start === "fromFile" ? "studio.drafts.chooseFile" : "studio.drafts.create")}
            </button>
          </form>
          <p role="status">
            {creating
              ? t("studio.drafts.creating")
              : created !== null &&
                t("studio.drafts.created", { draft: nameOf(created.draft), version: created.draft.version })}
          </p>
          {!creating && created?.basedOn !== undefined && (
            <p>
              {tx("studio.drafts.basedOn", { release: <code>{created.basedOn}</code> })}{" "}
              <button type="button" onClick={() => onCreate({ kind: "nextVersionOf", url: created.basedOn! })}>
                {t("studio.drafts.startNext")}
              </button>
            </p>
          )}
          <ErrorMessage
            id="draft-create-error"
            error={
              missing === undefined ? createError : errorText(new AppError("textNeedsLanguage", { field: t("language.field.deckName") }))
            }
          />
        </section>

        <section aria-labelledby="drafts-list-heading">
          <h3 id="drafts-list-heading">{t("studio.drafts.list")}</h3>
          {drafts.length === 0 ? (
            <p>{t("studio.drafts.none")}</p>
          ) : (
            <div class="studio-table">
              <table class="studio-list">
                <caption>{t("studio.drafts.caption", { instance: instance.name })}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("studio.drafts.column.name")}</th>
                    <th scope="col">{t("studio.drafts.column.kind")}</th>
                    <th scope="col" class="number">
                      {t("studio.drafts.column.version")}
                    </th>
                    <th scope="col">{t("studio.drafts.column.state")}</th>
                    <th scope="col">
                      <span class="visually-hidden">{t("studio.drafts.column.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((draft) => (
                    <tr key={draft.url}>
                      <th scope="row">
                        {/* One that cannot be read cannot be opened. */}
                        {draft.readable ? <a href={draftHref(draft)}>{nameOf(draft)}</a> : nameOf(draft)}
                      </th>
                      <td>{draft.readable ? t(`studio.drafts.kind.${draft.course ? "course" : "deck"}`) : ""}</td>
                      <td class="number">{draft.version}</td>
                      <td>{t(`studio.drafts.state.${!draft.readable ? "unreadable" : draft.releasedAs === undefined ? "writing" : "released"}`)}</td>
                      <td>
                        <button
                          type="button"
                          aria-label={t("studio.drafts.deleteDraft", { draft: nameOf(draft), version: draft.version })}
                          disabled={deleting !== null}
                          onClick={() => {
                            if (window.confirm(t("studio.drafts.deleteConfirm", { draft: nameOf(draft), version: draft.version }))) onDelete(draft);
                          }}
                        >
                          {t("studio.drafts.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p role="status">
            {deleting !== null
              ? t("studio.drafts.deleting", { draft: nameOf(deleting) })
              : deleted !== null && t("studio.drafts.deleted", { draft: nameOf(deleted), version: deleted.version })}
          </p>
          <ErrorMessage error={deleteError} />
        </section>
      </ReadOnlyScope>
    </section>
  );
}
