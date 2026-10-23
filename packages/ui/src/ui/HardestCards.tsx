// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId } from "preact/hooks";
import type { DeckProgress } from "@solid-memo/application/useCases";
import { LEECH_LAPSES, type HardCard } from "@solid-memo/domain/cardHistory";
import { isMarkdown, type Card, type Deck } from "@solid-memo/domain/deck";
import { CardLanguage } from "./cardLanguage";
import { cardName, cardNameText, DataLine } from "./DataText";
import { useI18n } from "./i18n";
import { ReaderText } from "./ReaderText";
import { cramHref, routeToHash } from "./router";

/** How many of a deck's hardest cards its page lists. */
export const HARDEST_SHOWN = 10;

/**
 * A card's name, as a link to its page in the app, in its deck's card
 * language first, marked with the language it is in.
 */
function CardLink({ instanceUrl, deck, card }: { instanceUrl: string; deck: Deck; card: Card }) {
  const { cardText, cardLang } = useI18n().cardReader(deck.cardLanguage);
  return (
    <a
      href={routeToHash({ screen: "card", instanceUrl, deckUrl: deck.url, cardUrl: card.url })}
      lang={cardLang(cardNameText(card, cardText))}
    >
      {cardName(card, cardText)}
    </a>
  );
}

/** How a card's lapses are told: how often it was forgotten, of how many reviews, and whether that makes it a leech. */
function useForgottenText(): (hard: HardCard<Card>) => string {
  const { t, formatPercent } = useI18n();
  return (hard) => {
    const share = t("statistics.recallShare", {
      percent: formatPercent(hard.lapses / hard.reviews),
      count: hard.reviews,
    });
    const text = t("statistics.forgottenTimes", { count: hard.lapses, share });
    return hard.lapses >= LEECH_LAPSES ? t("statistics.leechMark", { text }) : text;
  };
}

/**
 * The leeches of the decks given (cards forgotten LEECH_LAPSES times or
 * more in their reviews of the last twelve months), each with its deck,
 * the most forgotten first, then the most often forgotten of their
 * reviews: what the statistics list and a cram crams.
 */
export function leechesOf(decks: readonly DeckProgress[]): { deck: Deck; hard: HardCard<Card> }[] {
  return decks
    .flatMap(({ deck, hardest }) =>
      hardest.cards.filter((hard) => hard.lapses >= LEECH_LAPSES).map((hard) => ({ deck, hard })),
    )
    .sort(
      (a, b) =>
        b.hard.lapses - a.hard.lapses ||
        b.hard.lapses / b.hard.reviews - a.hard.lapses / a.hard.reviews,
    );
}

/** A link to cram leeches (CramContainer), described by what cramming them does and does not. */
function CramLink({ href }: { href: string }) {
  const { t } = useI18n();
  const hintId = useId();
  return (
    <>
      <p>
        <a href={href} aria-describedby={hintId}>
          {t("statistics.cramLeeches")}
        </a>
      </p>
      <p class="hint" id={hintId}>
        {t("statistics.cramLeechesHint")}
      </p>
    </>
  );
}

/**
 * A deck's hardest cards (hardestCardsOf): the HARDEST_SHOWN forgotten
 * most often in their reviews of the last twelve months, each a link to
 * its page, with how often of how many reviews, a leech marked as one;
 * with a leech, a link to cram the deck's leeches. Nothing for a deck
 * without such reviews (one studied only in a course's chapters, or not
 * yet reviewed).
 */
export function HardestCards({
  instanceUrl,
  progress,
}: {
  instanceUrl: string;
  progress: DeckProgress;
}) {
  const { t } = useI18n();
  const forgotten = useForgottenText();
  const { deck, hardest } = progress;
  if (hardest.reviews === 0) return null;
  return (
    <>
      <h4>{t("statistics.hardest")}</h4>
      <p class="hint">{t("statistics.hardestHint", { count: LEECH_LAPSES })}</p>
      {hardest.cards.length === 0 ? (
        <p>{t("statistics.noHardest")}</p>
      ) : (
        <ol class="hardest-cards" aria-label={t("statistics.hardest")}>
          {hardest.cards.slice(0, HARDEST_SHOWN).map((hard) => (
            <li key={hard.card.url}>
              <CardLink instanceUrl={instanceUrl} deck={deck} card={hard.card} />{" "}
              <span class="hint">{forgotten(hard)}</span>
            </li>
          ))}
        </ol>
      )}
      {leechesOf([progress]).length > 0 && <CramLink href={cramHref(instanceUrl, deck.url)} />}
    </>
  );
}

/**
 * The wrong options chosen most often in a deck's course questions of
 * the last twelve months (confusionsOf), each with its card, a link to
 * its page, and how often, both in the deck's card language first.
 * Nothing for a deck without multiple-choice answers.
 */
export function ConfusedOptions({
  instanceUrl,
  progress,
}: {
  instanceUrl: string;
  progress: DeckProgress;
}) {
  const { t, tx } = useI18n();
  const { deck, confusions } = progress;
  if (progress.courseAnswers === 0) return null;
  return (
    <>
      <h4>{t("statistics.confusions")}</h4>
      <p class="hint">{t("statistics.confusionsHint")}</p>
      {confusions.length === 0 ? (
        <p>{t("statistics.noConfusions")}</p>
      ) : (
        <CardLanguage language={deck.cardLanguage}>
          <ol class="hardest-cards" aria-label={t("statistics.confusions")}>
            {confusions.slice(0, HARDEST_SHOWN).map(({ card, distractor, picks }) => (
              <li key={`${card.url} ${distractor.id}`}>
                <CardLink instanceUrl={instanceUrl} deck={deck} card={card} />{" "}
                <span class="hint">
                  {tx("statistics.confusedWith", {
                    option: (
                      <DataLine text={distractor.text} markdown={isMarkdown(card.textFormat)} />
                    ),
                    count: picks,
                  })}
                </span>
              </li>
            ))}
          </ol>
        </CardLanguage>
      )}
    </>
  );
}

/**
 * The leeches of every deck (cards forgotten LEECH_LAPSES times or more
 * in their reviews of the last twelve months), the most forgotten first,
 * each a link to its page, with its deck and how often of how many
 * reviews, and, with one, a link to cram them all. A deck since removed
 * has no cards to name, so none of its.
 */
export function Leeches({
  instanceUrl,
  decks,
}: {
  instanceUrl: string;
  decks: readonly DeckProgress[];
}) {
  const { t, tx } = useI18n();
  const forgotten = useForgottenText();
  const leeches = leechesOf(decks);
  return (
    <>
      <h4>{t("statistics.leeches")}</h4>
      <p class="hint">{t("statistics.leechesHint", { count: LEECH_LAPSES })}</p>
      {leeches.length === 0 ? (
        <p>{t("statistics.noLeeches")}</p>
      ) : (
        <ol class="hardest-cards" aria-label={t("statistics.leeches")}>
          {leeches.map(({ deck, hard }) => (
            <li key={hard.card.url}>
              <CardLink instanceUrl={instanceUrl} deck={deck} card={hard.card} />{" "}
              <span class="hint">
                {tx("statistics.leechIn", {
                  deck: <ReaderText text={deck.title} />,
                  forgotten: forgotten(hard),
                })}
              </span>
            </li>
          ))}
        </ol>
      )}
      {leeches.length > 0 && <CramLink href={cramHref(instanceUrl)} />}
    </>
  );
}
