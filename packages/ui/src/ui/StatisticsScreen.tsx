import type { Deck } from "@solid-memo/domain/deck";
import type { Statistics } from "@solid-memo/domain/statistics";
import { useI18n } from "./i18n";
import { ActivityCalendar, IntroducedChart, RecallChart, RecallTile, StatTile } from "./StatisticsCharts";
import { ReaderText } from "./ReaderText";

/**
 * The instance's study statistics: totals and streaks, the activity of
 * the last year, the cards introduced over it, how well reviews were
 * remembered, in all and month by month, and each deck's share. A deck
 * that has since been removed is named as such.
 */
export function StatisticsScreen({ statistics, decks }: { statistics: Statistics; decks: readonly Deck[] }) {
  const { t, formatDate } = useI18n();
  const { totals, streaks, retention } = statistics;
  const nameOf = (deckUrl: string) => {
    const deck = decks.find((d) => d.url === deckUrl);
    return deck === undefined ? t("statistics.removedDeck") : <ReaderText text={deck.title} />;
  };
  return (
    <section class="statistics" aria-labelledby="statistics-heading">
      <h2 id="statistics-heading">{t("statistics.heading")}</h2>
      {totals.answers === 0 ? (
        <p class="hint">{t("statistics.empty")}</p>
      ) : (
        <>
          <div class="stat-tiles">
            <StatTile label={t("statistics.answers")} value={String(totals.answers)} />
            <StatTile label={t("statistics.studyDays")} value={String(totals.studyDays)} />
            <StatTile label={t("statistics.cards")} value={String(totals.cards)} />
            <StatTile label={t("statistics.currentStreak")} value={t("statistics.dayCount", { count: streaks.current })} />
            <StatTile label={t("statistics.longestStreak")} value={t("statistics.dayCount", { count: streaks.longest })} />
          </div>
          <ActivityCalendar days={statistics.days} today={statistics.today} />
          <h3>{t("statistics.progress")}</h3>
          <IntroducedChart days={statistics.days} today={statistics.today} />
          <h3>{t("statistics.remembered")}</h3>
          <div class="stat-tiles">
            <RecallTile label={t("statistics.young")} recall={retention.young} />
            <RecallTile label={t("statistics.mature")} recall={retention.mature} />
          </div>
          {retention.young.reviews + retention.mature.reviews > 0 && <RecallChart months={statistics.months} />}
          <h3>{t("statistics.byDeck")}</h3>
          <table class="deck-statistics">
            <thead>
              <tr>
                <th scope="col">{t("statistics.deck")}</th>
                <th scope="col">{t("statistics.answers")}</th>
                <th scope="col">{t("statistics.lastStudied")}</th>
              </tr>
            </thead>
            <tbody>
              {statistics.decks.map((deck) => (
                <tr key={deck.deckUrl}>
                  <td>{nameOf(deck.deckUrl)}</td>
                  <td>{deck.answers}</td>
                  <td>{formatDate(deck.lastStudyDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
