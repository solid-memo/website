import { useState } from "preact/hooks";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckProvenance as Provenance } from "@solid-memo/domain/deckProvenance";
import { DeckProvenance } from "@solid-memo/ui/DeckProvenance";
import { useI18n } from "@solid-memo/ui/i18n";
import { LicenseSelect } from "./LicenseSelect";

/**
 * Who made a deck and its licence (dcterms:creator, dcterms:license),
 * with a form to change them: an author a line, "Name" or
 * "Name <email>", added and removed there, and a licence from those
 * offered (LicenseSelect). The domain tidies and checks them
 * (withProvenance): the form stays until the save is made, so one it
 * refuses loses nothing. Nothing here says anyone reviewed the deck.
 */
export function DeckProvenanceSection({
  deck,
  busy,
  onSave,
}: {
  deck: Deck;
  busy: boolean;
  /** Saves them; whether it did. */
  onSave: (provenance: Provenance) => Promise<boolean>;
}) {
  const { t } = useI18n();
  /** The draft while editing; null otherwise. */
  const [draft, setDraft] = useState<{ authors: string[]; license: string } | null>(null);
  const stated = deck.authors.length > 0 || deck.license !== undefined;

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (await onSave({ authors: draft!.authors, ...(draft!.license === "" ? {} : { license: draft!.license }) })) setDraft(null);
  }

  const setAuthor = (index: number, author: string) =>
    setDraft({ ...draft!, authors: draft!.authors.map((other, i) => (i === index ? author : other)) });

  return (
    <section aria-labelledby="deck-provenance-heading">
      <h3 id="deck-provenance-heading">{t("studio.about.provenance")}</h3>
      {draft === null ? (
        <>
          {stated ? <DeckProvenance authors={deck.authors} license={deck.license} /> : <p class="hint">{t("studio.about.noProvenance")}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => setDraft({ authors: deck.authors.length === 0 ? [""] : [...deck.authors], license: deck.license ?? "" })}
          >
            {t("studio.about.editProvenance")}
          </button>
        </>
      ) : (
        <form class="card-edit" onSubmit={handleSubmit}>
          <fieldset>
            <legend>{t("studio.about.authors")}</legend>
            <p id="deck-authors-hint" class="hint">
              {t("studio.about.authorsHint")}
            </p>
            {draft.authors.map((author, index) => (
              <div key={index} class="studio-author">
                <input
                  aria-label={t("studio.about.author", { number: index + 1 })}
                  aria-describedby="deck-authors-hint"
                  value={author}
                  disabled={busy}
                  onInput={(event) => setAuthor(index, event.currentTarget.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDraft({ ...draft, authors: draft.authors.filter((_, i) => i !== index) })}
                >
                  {t("studio.about.removeAuthor", { number: index + 1 })}
                </button>
              </div>
            ))}
            <button type="button" disabled={busy} onClick={() => setDraft({ ...draft, authors: [...draft.authors, ""] })}>
              {t("studio.about.addAuthor")}
            </button>
          </fieldset>
          <LicenseSelect
            id="deck-license"
            value={draft.license}
            current={deck.license}
            disabled={busy}
            onChange={(license) => setDraft({ ...draft, license })}
          />
          <div class="edit-actions">
            <button type="submit" disabled={busy}>
              {t("studio.about.saveProvenance")}
            </button>
            <button type="button" disabled={busy} onClick={() => setDraft(null)}>
              {t("deckAbout.cancelButton")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
