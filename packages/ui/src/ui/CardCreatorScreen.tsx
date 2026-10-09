import { useMemo } from "preact/hooks";
import { AddCardForm } from "./AddCardForm";
import type { CardContent, Deck } from "@solid-memo/domain/deck";
import type { DeckLanguages } from "@solid-memo/domain/deckLanguages";
import { cardLanguageHints } from "./CardContentFields";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";

/** What a deck with no cards (yet read) says of its languages: nothing. */
const NO_LANGUAGES: DeckLanguages = { unstatedCounts: { front: 0, back: 0 } };

/**
 * Card entry page; stays open after each add so batches are easy. New
 * text starts in the languages the deck's cards have (`languages`).
 */
export function CardCreatorScreen({
  deck,
  languages = NO_LANGUAGES,
  deckHref,
  busy,
  error,
  onAdd,
  backHref,
}: {
  deck: Deck;
  /** What the deck's cards say of their languages (deckLanguages). */
  languages?: DeckLanguages;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  busy: boolean;
  error: ErrorText | null;
  /** Add the card; `onAdded` once it is. */
  onAdd: (content: CardContent, onAdded: () => void) => void;
  /** URL of the deck's Browser, where Back goes. */
  backHref: string;
}) {
  const { t, tx } = useI18n();
  const hints = useMemo(() => cardLanguageHints(languages, deck.title), [languages, deck.title]);
  return (
    <section>
      <header>
        <h2>{t("cardCreator.heading")}</h2>
        <a class="button" href={backHref}>
          {t("cardCreator.backButton")}
        </a>
      </header>
      <p class="hint">
        {tx("cardCreator.addingTo", {
          deck: (
            <a href={deckHref}>
              <ReaderText text={deck.title} />
            </a>
          ),
        })}
      </p>
      <AddCardForm busy={busy} languages={hints} onAdd={onAdd} />
      <ErrorMessage error={error} />
    </section>
  );
}
