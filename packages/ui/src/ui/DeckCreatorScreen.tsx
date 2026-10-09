import { useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import type { LangText } from "@solid-memo/domain/langText";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { draftOf, LangTextField, rememberLanguages, textOfDraft, useMissingLanguage } from "./LangTextField";
import { recentLanguages } from "./remembered";

/**
 * A new deck, by its name in the language the user states — the one
 * last chosen for a deck's text on this device, else none until they
 * choose it: the app does not guess it from the page. Creating a deck
 * whose name has no language says so, and focus goes to its picker.
 */
export function DeckCreatorScreen({
  busy,
  error,
  onCreate,
}: {
  busy: boolean;
  error: ErrorText | null;
  onCreate: (title: LangText) => void;
}) {
  const { t, errorText } = useI18n();
  const [draft, setDraft] = useState(() => draftOf(undefined, [], { tag: recentLanguages("deck")[0] ?? null }));
  const { missing, ask, clear } = useMissingLanguage("deck-name");

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    const result = textOfDraft(draft);
    if ("missing" in result) {
      ask(result.missing);
      return;
    }
    rememberLanguages("deck", result.text, draft);
    onCreate(result.text);
  }

  return (
    <section>
      <header>
        <h2>{t("deckCreator.heading")}</h2>
      </header>
      <form onSubmit={handleSubmit}>
        <LangTextField
          id="deck-name"
          label={t("deckCreator.nameLabel")}
          placeholder={t("deckCreator.namePlaceholder")}
          role="deckName"
          draft={draft}
          suggestions={[]}
          translationsOpen
          required
          disabled={busy}
          missing={missing}
          errorId="deck-creator-error"
          onChange={(next) => {
            clear();
            setDraft(next);
          }}
        />
        {/* Only aria-disabled while it creates, so it keeps the focus should that fail. */}
        <button type="submit" aria-disabled={busy}>
          {t("deckCreator.createButton")}
        </button>
      </form>
      <ErrorMessage
        id="deck-creator-error"
        error={
          missing === undefined
            ? error
            : errorText(new AppError("textNeedsLanguage", { field: t("language.field.deckName") }))
        }
      />
    </section>
  );
}
