// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Fragment } from "preact";
import { useId } from "preact/hooks";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { useCardProgress } from "./CardProgressContainer";
import { ConfusedOptions, HardestCards, Leeches } from "./HardestCards";
import { useI18n } from "./i18n";

/**
 * What is hard, from the cards' progress (read once with
 * CardProgressContainer's, which says when it is loading or cannot be
 * read; this says nothing then): of the one deck given, its hardest
 * cards and, for a deck with course answers, the wrong options chosen
 * most; else the leeches of every deck. Nothing either before there is
 * anything to tell: no review (of the deck, or of any deck), nor, for a
 * deck, a course answer.
 */
export function HardestCardsContainer({
  useCases,
  instance,
  deck,
}: {
  useCases: UseCases;
  instance: Instance;
  deck?: Deck;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const report = useCardProgress(useCases, instance, deck).data;
  if (report === undefined) return null;
  // Nothing to say before the first review, or a deck's first course answer.
  const nothing = report.decks.every(
    ({ hardest, courseAnswers }) =>
      hardest.reviews === 0 && (deck === undefined || courseAnswers === 0),
  );
  if (nothing) return null;
  return (
    <section class="statistics hardest" aria-labelledby={headingId}>
      <h3 id={headingId}>{t("statistics.whatIsHard")}</h3>
      {deck === undefined ? (
        <Leeches instanceUrl={instance.url} decks={report.decks} />
      ) : (
        report.decks.map((progress) => (
          <Fragment key={progress.deck.url}>
            <HardestCards instanceUrl={instance.url} progress={progress} />
            <ConfusedOptions instanceUrl={instance.url} progress={progress} />
          </Fragment>
        ))
      )}
    </section>
  );
}
