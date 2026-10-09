import { useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import type { LangText } from "@solid-memo/domain/langText";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import {
  draftOf,
  LangTextField,
  rememberLanguages,
  textOfDraft,
  useMissingLanguage,
  type LangTextDraft,
} from "@solid-memo/ui/LangTextField";
import { ReaderText } from "@solid-memo/ui/ReaderText";

/**
 * A deck's name in every language it has, with a form to rename it: each
 * language the user's to state (LangTextField), as Solid Memo's deck
 * preferences rename it.
 */
export function DeckNameSection({ deck, busy, onRename }: { deck: Deck; busy: boolean; onRename: (title: LangText) => void }) {
  const { t, locale, errorText } = useI18n();
  /** The draft while renaming; null otherwise. */
  const [draft, setDraft] = useState<LangTextDraft | null>(null);
  const { missing, ask, clear } = useMissingLanguage("deck-name");

  function stop() {
    clear();
    setDraft(null);
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    const result = textOfDraft(draft!);
    if ("missing" in result) {
      ask(result.missing);
      return;
    }
    rememberLanguages("deck", result.text, draft!);
    onRename(result.text);
    stop();
  }

  return (
    <section aria-labelledby="deck-name-heading">
      <h3 id="deck-name-heading">{t("studio.about.name")}</h3>
      {draft === null ? (
        <>
          <ul class="studio-names">
            {Object.entries(deck.title).map(([tag, text]) => (
              <li key={tag}>
                <ReaderText text={{ [tag]: text }} />
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => setDraft(draftOf(deck.title, [locale, ...navigator.languages]))}>
            {t("studio.about.rename")}
          </button>
        </>
      ) : (
        <form class="card-edit" onSubmit={handleSubmit}>
          <LangTextField
            id="deck-name"
            label={t("deckPreferences.deckName")}
            role="deckName"
            draft={draft}
            suggestions={Object.keys({ ...deck.title, ...deck.description })}
            translationsOpen
            required
            disabled={busy}
            missing={missing}
            errorId="deck-name-error"
            onChange={(next) => {
              clear();
              setDraft(next);
            }}
          />
          <ErrorMessage
            id="deck-name-error"
            error={missing === undefined ? null : errorText(new AppError("textNeedsLanguage", { field: t("language.field.deckName") }))}
          />
          <div class="edit-actions">
            <button type="submit" disabled={busy}>
              {t("deckPreferences.saveName")}
            </button>
            <button type="button" onClick={stop} disabled={busy}>
              {t("deckPreferences.cancelButton")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
