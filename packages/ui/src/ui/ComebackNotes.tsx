// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQueries } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { COMEBACK_DAYS } from "@solid-memo/application/deckPauses";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import { backlogDayOf } from "@solid-memo/domain/deckPause";
import { useI18n } from "./i18n";
import { queryKeys } from "./queryKeys";
import { ReaderText } from "./ReaderText";

/**
 * A welcome back above the deck list for each deck that resumed from a
 * pause, by hand or on its day, while its backlog lasts and up to
 * COMEBACK_DAYS after it resumed (getComeback): what is likely left of
 * it, how many reviews wait and over how many days, and that cards
 * learned shortly before the pause may feel new again. Only a deck that
 * resumed in those days is read for it.
 */
export function ComebackNotes({
  useCases,
  instanceUrl,
  decks,
  today,
}: {
  useCases: Pick<UseCases, "getComeback">;
  instanceUrl: string;
  decks: readonly Deck[];
  /** Today's study day. */
  today: string;
}) {
  const { t, tx, formatPercent } = useI18n();
  const since = shiftStudyDay(today, -COMEBACK_DAYS);
  const resumed = decks.filter((deck) => (backlogDayOf(deck, today) ?? "") >= since);
  const comebacks = useQueries({
    queries: resumed.map((deck) => ({
      queryKey: queryKeys.comeback(deck.url),
      queryFn: () => useCases.getComeback(instanceUrl, deck, new Date()),
      refetchOnWindowFocus: false,
    })),
  });
  const shown = resumed.flatMap((deck, at) => {
    const comeback = comebacks[at]!.data;
    return comeback === undefined || comeback === null ? [] : [{ deck, comeback }];
  });
  if (shown.length === 0) return null;
  return (
    <section class="comeback-notes" aria-label={t("comeback.label")}>
      {shown.map(({ deck, comeback }) => (
        <p key={deck.url}>
          {tx("comeback.left", {
            deck: <ReaderText text={deck.title} />,
            percent: formatPercent(comeback.recall),
          })}{" "}
          {t("comeback.waiting", { count: comeback.waiting })}{" "}
          {comeback.days !== null && <>{t("comeback.days", { count: comeback.days })} </>}
          {t("comeback.feelNew")}
        </p>
      ))}
    </section>
  );
}
