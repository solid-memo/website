import type { ComponentChildren } from "preact";
import type { Deck } from "@solid-memo/domain/deck";
import { DeckProvenance } from "./DeckProvenance";
import { ErrorMessage } from "./ErrorMessage";
import { DeckIcon } from "./icons";
import { useI18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";

export function DeckDetailScreen({
  deck,
  cardCount,
  dueCount,
  newCount,
  studiedToday,
  busy,
  error,
  preferencesHref,
  browseHref,
  onStudy,
  onResetDay,
  notice,
}: {
  deck: Deck;
  cardCount: number;
  /** Prompts due today. */
  dueCount: number;
  /** New prompts still within today's budget. */
  newCount: number;
  /** Cards reviewed today; the reset option appears once there are any. */
  studiedToday: number;
  /** A reset is in progress. */
  busy: boolean;
  error: ErrorText | null;
  /** URL of the deck's preferences: its own daily limits. */
  preferencesHref: string;
  /** URL of the Browser view, where the deck and its cards are edited. */
  browseHref: string;
  /** Today's session: due prompts and new ones, interleaved. */
  onStudy: () => void;
  /** Undo today's reviews of this deck. */
  onResetDay: () => void;
  /** Anything to say about the deck before its study state, e.g. an offer. */
  notice?: ComponentChildren;
}) {
  const { t, readerText } = useI18n();
  const canStudy = dueCount + newCount > 0;
  const studied = t("common.cardCount", { count: studiedToday });

  function handleResetDay() {
    if (
      window.confirm(
        t("deckDetail.resetConfirm", { title: readerText(deck.title), studied }),
      )
    ) {
      onResetDay();
    }
  }

  return (
    <section>
      <header>
        <h2>
          <DeckIcon />
          <ReaderText text={deck.title} />
        </h2>
        <div class="header-actions">
          <a class="button" href={preferencesHref} aria-label={t("deckDetail.preferencesLabel")}>
            {t("deckDetail.preferencesButton")}
          </a>
          <a class="button" href={browseHref}>
            {t("deckDetail.browseButton")}
          </a>
        </div>
      </header>
      <DeckProvenance
        authors={deck.authors}
        license={deck.license}
        modifiedAt={deck.modifiedAt}
        description={deck.description}
      />
      {notice}
      {!canStudy && (
        <p>
          {cardCount === 0
            ? t("deckDetail.noCards")
            : t("deckDetail.allStudied")}
        </p>
      )}
      {canStudy && (
        <p class="hint">
          {dueCount === 0
            ? t("deckDetail.newOnly", { count: newCount })
            : newCount === 0
              ? t("deckDetail.dueOnly", { due: t("common.cardCount", { count: dueCount }) })
              : t("deckDetail.dueAndNew", {
                  due: t("common.cardCount", { count: dueCount }),
                  count: newCount,
                })}
        </p>
      )}
      <div class="session-actions">
        {canStudy && (
          <button class="primary" onClick={onStudy} disabled={busy}>
            {t("deckDetail.studyButton")}
          </button>
        )}
      </div>
      {studiedToday > 0 && (
        <div class="day-reset">
          <span class="hint">{t("deckDetail.studiedToday", { studied })}</span>
          <button onClick={handleResetDay} disabled={busy}>
            {busy ? t("deckDetail.resetting") : t("deckDetail.resetButton")}
          </button>
        </div>
      )}
      <ErrorMessage error={error} />
      <p class="hint">
        {t("deckDetail.cardsInDeck", { cards: t("common.cardCount", { count: cardCount }) })}
      </p>
    </section>
  );
}
