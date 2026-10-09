import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckLanguages, StatedLanguages } from "@solid-memo/domain/deckLanguages";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { LanguagePicker } from "./LanguagePicker";

type Side = "front" | "back";

const SIDES: Side[] = ["front", "back"];

/** The id of the section's heading: a link to the section focuses it. */
export const DECK_LANGUAGES_ID = "deck-languages";

/** The id of a side's picker. */
function pickerId(side: Side): string {
  return `deck-${side}s-language`;
}

/**
 * A deck's text whose language is not settled (deckLanguages): how many
 * card fronts and backs say no language, with a picker per side to state
 * the language they are all in, after the user confirms. Text saved the
 * same in several languages is text in each of them, nothing to settle.
 * Text still as its library release has it is not counted: a later
 * release updates it.
 * When the cards, or that release, cannot be read, the section says so
 * (`unreadable`) rather than waiting on them.
 *
 * The deck's page links here when any of this is to settle
 * (DeckLanguagesNotice): opened so (`arrival`), the heading takes the
 * focus (useScreenFocus).
 *
 * Nothing is chosen for the user: each picker starts with no language,
 * suggesting the one the side usually states. Stating with none chosen
 * asks for one (textNeedsLanguage) and focuses the picker. While the
 * statement is saved the button keeps the focus (aria-disabled); when it
 * is gone, for nothing is left to state, the heading takes the focus.
 */
export function DeckLanguagesSection({
  deck,
  languages,
  unreadable = null,
  arrival = false,
  busy,
  stated,
  onStateLanguages,
}: {
  deck: Deck;
  /** What the deck's cards say of their languages; undefined while they are read. */
  languages: DeckLanguages | undefined;
  /** Why the cards, or the library release they are weighed against, could not be read; null when they could. */
  unreadable?: ErrorText | null;
  /** The screen was opened at this section: its heading is where the user arrives. */
  arrival?: boolean;
  busy: boolean;
  /** How many cards the last statement changed; null before any. */
  stated: number | null;
  onStateLanguages: (languages: StatedLanguages) => void;
}) {
  const { t, errorText, languageParts } = useI18n();
  const [chosen, setChosen] = useState<Record<Side, string | null>>({ front: null, back: null });
  const [missing, setMissing] = useState<Side | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** A statement is being saved: once it is, focus stays or goes to the heading. */
  const saving = useRef(false);

  useLayoutEffect(() => {
    if (!saving.current || busy) return;
    saving.current = false;
    if (buttonRef.current === null) headingRef.current!.focus();
  }, [busy]);

  const counts = languages?.unstatedCounts ?? { front: 0, back: 0 };
  const sides = SIDES.filter((side) => counts[side] > 0);

  function handleState() {
    if (busy) return;
    const ready = sides.filter((side) => chosen[side] !== null);
    if (ready.length === 0) {
      setMissing(sides[0]!);
      document.getElementById(pickerId(sides[0]!))!.focus();
      return;
    }
    const question = ready
      .map((side) =>
        t(side === "front" ? "deckPreferences.languages.confirmFronts" : "deckPreferences.languages.confirmBacks", {
          count: counts[side],
          language: languageParts(chosen[side]!).name,
        }),
      )
      .join("\n");
    if (!window.confirm(question)) return;
    saving.current = true;
    onStateLanguages(Object.fromEntries(ready.map((side) => [side, chosen[side]!])));
  }

  return (
    <section class="deck-languages" aria-labelledby={DECK_LANGUAGES_ID}>
      <h3 id={DECK_LANGUAGES_ID} ref={headingRef} tabIndex={-1} data-arrival={arrival || undefined}>
        {t("deckPreferences.languages.heading")}
      </h3>
      {languages === undefined ? (
        <p class="hint">
          {t(unreadable === null ? "deckPreferences.languages.loading" : "deckPreferences.languages.unreadable")}
        </p>
      ) : (
        <>
          {sides.length > 0 && (
            <>
              <p id="deck-languages-unstated">
                {t("deckPreferences.languages.unstated", {
                  count: counts.front,
                  backs: t("deckPreferences.languages.backs", { count: counts.back }),
                })}
              </p>
              {sides.map((side) => (
                <fieldset key={side} class="language-side">
                  <legend>
                    {t(side === "front" ? "deckPreferences.languages.fronts" : "deckPreferences.languages.backsLegend")}
                  </legend>
                  <LanguagePicker
                    id={pickerId(side)}
                    value={chosen[side]}
                    role={side}
                    suggestions={[languages[side], ...Object.keys(deck.title)].filter((tag) => tag !== undefined)}
                    errorId={missing === side ? "deck-languages-error" : undefined}
                    onChange={(tag) => {
                      setMissing(null);
                      setChosen({ ...chosen, [side]: tag });
                    }}
                  />
                </fieldset>
              ))}
              <button
                ref={buttonRef}
                type="button"
                aria-describedby="deck-languages-unstated"
                aria-disabled={busy}
                onClick={handleState}
              >
                {t("deckPreferences.languages.stateButton")}
              </button>
            </>
          )}
          {sides.length === 0 && (
            <p>{t("deckPreferences.languages.settled")}</p>
          )}
          {deck.sourceUrl !== undefined && <p class="hint">{t("deckPreferences.languages.releaseHint")}</p>}
        </>
      )}
      <ErrorMessage
        id="deck-languages-error"
        error={
          missing === null
            ? unreadable
            : errorText(new AppError("textNeedsLanguage", { field: t(`language.field.${missing}`) }))
        }
      />
      <p class="hint" role="status">
        {stated === null ? "" : t("deckPreferences.languages.stated", { count: stated })}
      </p>
    </section>
  );
}
