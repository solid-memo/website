import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { isMarkdown, type Card, type CardContent } from "@solid-memo/domain/deck";
import { cardName } from "./DataText";
import type { DeckLanguages } from "@solid-memo/domain/deckLanguages";
import type { LangText } from "@solid-memo/domain/langText";
import {
  cardLanguageHints,
  CardContentFields,
  CardFieldsErrorMessage,
  checkDraft,
  draftOf,
  rememberCardLanguages,
  type CardDraft,
  type CardFieldsError,
} from "./CardContentFields";
import { CardFace } from "./CardFace";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { CardIcon, TrashIcon } from "./icons";
import { RetiredNotice } from "./RetiredCards";

/** What a deck with no cards (yet read) says of its languages: nothing. */
const NO_LANGUAGES: DeckLanguages = { unstatedCounts: { front: 0, back: 0 } };
const NO_TITLE: LangText = {};

/**
 * One card's own page: the card as it looks in study, and its editor.
 * While a change saves, its buttons keep the focus (aria-disabled), as
 * the page stays.
 *
 * The editor edits each text in the languages it is in, a text new to
 * the card starting in the language the deck's cards usually have
 * (`languages`). A side saved with no language keeps none until the user
 * edits it or gives it a translation: then its language is asked for.
 */
export function CardScreen({
  card,
  deckTitle = NO_TITLE,
  languages = NO_LANGUAGES,
  busy,
  saved,
  error,
  onSave,
  onRemove,
}: {
  card: Card;
  /** The deck's name: its languages are suggested for the card's text. */
  deckTitle?: LangText;
  /** What the deck's cards say of their languages (deckLanguages). */
  languages?: DeckLanguages;
  busy: boolean;
  /** The last save succeeded (and nothing was edited since). */
  saved: boolean;
  error: ErrorText | null;
  onSave: (content: CardContent) => void;
  onRemove: () => void;
}) {
  const { t, locale, readerText } = useI18n();
  const hints = useMemo(() => cardLanguageHints(languages, deckTitle), [languages, deckTitle]);
  const startDraft = () => draftOf(card, [locale, ...navigator.languages], { defaults: hints.defaults });
  const [draft, setDraft] = useState(startDraft);
  const [invalid, setInvalid] = useState<CardFieldsError | null>(null);

  // What is known of the deck (its cards' languages) may come
  // after the page opens: an editor not yet touched — no text, no
  // picture's URL, nor Markdown switched — starts again from it.
  const started = useRef(false);
  useLayoutEffect(() => {
    const untouched =
      draft.touched.length === 0 &&
      draft.frontImageUrl === (card.frontImageUrl ?? "") &&
      draft.backImageUrl === (card.backImageUrl ?? "") &&
      draft.markdown === isMarkdown(card.textFormat);
    if (started.current && untouched) setDraft(startDraft());
    started.current = true;
  }, [hints]);

  // The languages of the user's own text a save states are this device's
  // latest choices for it once the save succeeds, not before.
  const submitted = useRef<{ content: CardContent; draft: CardDraft } | null>(null);
  useLayoutEffect(() => {
    if (!saved || submitted.current === null) return;
    rememberCardLanguages(submitted.current.content, submitted.current.draft);
    submitted.current = null;
  }, [saved]);

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    const check = checkDraft(draft, card);
    if (!check.ok) {
      setInvalid(check.invalid);
      return;
    }
    setInvalid(null);
    submitted.current = { content: check.content, draft };
    onSave(check.content);
  }

  function handleRemove() {
    if (busy) return;
    if (
      window.confirm(t("card.removeConfirm", { card: cardName(card, readerText) }))
    ) {
      onRemove();
    }
  }

  return (
    <section>
      <header>
        <h2>
          <CardIcon />
          {t("card.heading")}
        </h2>
      </header>
      <div class="practice-card">
        <CardFace
          side="front"
          text={card.front}
          imageUrl={card.frontImageUrl}
          imageDescription={card.frontImageDescription}
          note={card.frontNote}
          textFormat={card.textFormat}
        />
        <CardFace
          side="back"
          text={card.back}
          imageUrl={card.backImageUrl}
          imageDescription={card.backImageDescription}
          label={card.backLabel}
          note={card.backNote}
          textFormat={card.textFormat}
        />
      </div>
      {card.retired && <RetiredNotice />}
      <form onSubmit={handleSubmit} noValidate>
        <CardContentFields
          draft={draft}
          saved={card}
          busy={busy}
          invalid={invalid}
          suggestions={hints.suggestions}
          onChange={(next) => {
            // A language asked for is answered as the user changes the card.
            if (invalid?.entry !== undefined) setInvalid(null);
            setDraft(next);
          }}
        />
        <CardFieldsErrorMessage invalid={invalid} />
        <div class="edit-actions">
          <button type="submit" aria-disabled={busy}>
            {t("card.saveButton")}
          </button>
          <button
            type="button"
            class="danger icon"
            aria-label={t("card.removeButton")}
            title={t("card.removeButton")}
            onClick={handleRemove}
            aria-disabled={busy}
          >
            <TrashIcon />
          </button>
        </div>
      </form>
      {/* Mounted throughout, so each save is heard: the text clears while
          the next one is under way and comes back once it is done. */}
      <p class="hint" role="status">
        {saved ? t("card.saved") : ""}
      </p>
      <ErrorMessage error={error} />
    </section>
  );
}
