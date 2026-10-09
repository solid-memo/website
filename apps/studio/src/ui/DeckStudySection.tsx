import { useState } from "preact/hooks";
import { DECK_DIRECTIONS, type Deck, type DeckDirection } from "@solid-memo/domain/deck";
import type { DeckPace } from "@solid-memo/domain/deckPace";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { useI18n } from "@solid-memo/ui/i18n";

type Limit = keyof DeckPace;

const LIMITS: Limit[] = ["newCardsPerDay", "maxReviewsPerDay"];

/**
 * How a deck is studied: its direction, and its pace, the deck's own
 * daily limits. A limit left empty follows the instance's preferences
 * (`preferences`, shown as its placeholder), which are set in Solid
 * Memo (`preferencesHref`). Save hands on what the form says.
 */
export function DeckStudySection({
  deck,
  preferences,
  preferencesHref,
  busy,
  onSave,
}: {
  deck: Deck;
  preferences: Pick<StudyPreferences, Limit>;
  preferencesHref: string;
  busy: boolean;
  onSave: (direction: DeckDirection, pace: DeckPace) => void;
}) {
  const { t, tx, directionLabel } = useI18n();
  const [direction, setDirection] = useState(deck.direction);
  /** The limits as typed; empty follows the instance's preferences. */
  const [draft, setDraft] = useState<Record<Limit, string>>({
    newCardsPerDay: deck.newCardsPerDay?.toString() ?? "",
    maxReviewsPerDay: deck.maxReviewsPerDay?.toString() ?? "",
  });

  function handleSubmit(event: Event) {
    event.preventDefault();
    const pace: DeckPace = {};
    for (const limit of LIMITS) if (draft[limit] !== "") pace[limit] = Number(draft[limit]);
    onSave(direction, pace);
  }

  return (
    <section aria-labelledby="deck-study-heading">
      <h3 id="deck-study-heading">{t("studio.about.study")}</h3>
      <form class="card-edit" onSubmit={handleSubmit}>
        <fieldset>
          <legend>{t("browser.directionLegend")}</legend>
          {DECK_DIRECTIONS.map((option) => (
            <label key={option} class="radio-option">
              <input
                type="radio"
                name="deck-direction"
                value={option}
                checked={direction === option}
                disabled={busy}
                onChange={() => setDirection(option)}
              />
              {directionLabel(option)}
            </label>
          ))}
        </fieldset>
        {LIMITS.map((limit) => (
          <label key={limit}>
            {t(`studio.bulk.${limit}`)}
            <input
              type="number"
              min="0"
              step="1"
              value={draft[limit]}
              placeholder={String(preferences[limit])}
              aria-describedby="deck-pace-hint"
              disabled={busy}
              onInput={(event) => setDraft({ ...draft, [limit]: event.currentTarget.value })}
            />
          </label>
        ))}
        <p id="deck-pace-hint" class="hint">
          {tx("deckPreferences.emptyHint", { link: <a href={preferencesHref}>{t("deckPreferences.studyPreferencesLink")}</a> })}
        </p>
        <button type="submit" disabled={busy}>
          {t("studio.about.saveStudy")}
        </button>
      </form>
    </section>
  );
}
