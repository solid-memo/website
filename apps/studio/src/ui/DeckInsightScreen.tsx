import type { DeckInsight } from "@solid-memo/application/useCases";
import { LEECH_LAPSES } from "@solid-memo/domain/cardHistory";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Bin } from "@solid-memo/domain/scheduleInsight";
import { cardName } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { BarChart, StatTile } from "@solid-memo/ui/StatisticsCharts";

/** How many days the tile of the reviews to come counts, today's included. */
const WEEK = 7;

/**
 * A deck's schedule (docs/studio.md): tiles of headline figures; the
 * reviews of the days to come, as the daily cap lets them through
 * (the deck's own, `ownCap`, else the instance's); how the prompts'
 * intervals and eases are spread; and its lapses, counted since the
 * month of its first answer in the log, with its leeches, each a link to the
 * card (`cardHref`), and a link to them all in the card workbench
 * (`leechesHref`). Each chart has its figures as a table too.
 */
export function DeckInsightScreen({
  deck,
  insight,
  ownCap,
  cardHref,
  leechesHref,
}: {
  deck: Deck;
  insight: DeckInsight;
  /** The cap is the deck's own, not the instance's. */
  ownCap: boolean;
  cardHref: (card: Card) => string;
  leechesHref: string;
}) {
  const { t, tx, readerText, formatDate, formatMonth } = useI18n();
  const { forecast, lapses, leeches } = insight;
  const week = forecast.slice(0, WEEK).reduce((sum, day) => sum + day.reviews, 0);
  const intervalRange = (bin: Bin) =>
    bin.to === undefined
      ? t("studio.insight.intervalFrom", { from: bin.from })
      : bin.to - bin.from === 1
        ? t("studio.cards.days", { count: bin.from })
        : t("studio.insight.intervalRange", { from: bin.from, to: bin.to - 1 });
  const easeRange = (bin: Bin) =>
    bin.to === undefined
      ? t("studio.insight.easeFrom", { from: bin.from.toFixed(1) })
      : t("studio.insight.easeRange", { from: bin.from.toFixed(1), to: bin.to.toFixed(1) });
  return (
    <section class="studio-insight">
      <h2>{tx("studio.insight.heading", { deck: <ReaderText text={deck.title} /> })}</h2>
      <div class="stat-tiles">
        <StatTile label={t("studio.insight.today")} value={String(forecast[0]?.reviews ?? 0)} />
        <StatTile label={t("studio.insight.week", { count: WEEK })} value={String(week)} />
        <StatTile label={t("studio.insight.scheduled")} value={String(insight.scheduled)} />
        <StatTile label={t("studio.insight.leeches")} value={String(leeches.length)} />
      </div>

      <h3>{t("studio.insight.forecastHeading")}</h3>
      <p class="hint">
        {t(ownCap ? "studio.insight.capDeck" : "studio.insight.capInstance", { max: insight.maxReviewsPerDay })}
      </p>
      <BarChart
        caption={t("studio.insight.forecast", { count: forecast.length })}
        label={t("studio.insight.forecastLabel", { count: forecast.length })}
        bars={forecast.map((day) => ({
          key: day.studyDay,
          value: day.reviews,
          text: t("studio.insight.forecastDay", { date: formatDate(day.studyDay), reviews: day.reviews, due: day.due }),
        }))}
        prompt={t("statistics.pointAtDay")}
      >
        <details class="chart-table">
          <summary>{t("statistics.showTable")}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("statistics.day")}</th>
                <th scope="col">{t("studio.insight.due")}</th>
                <th scope="col">{t("studio.insight.reviews")}</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((day) => (
                <tr key={day.studyDay}>
                  <td>{formatDate(day.studyDay)}</td>
                  <td>{day.due}</td>
                  <td>{day.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </BarChart>

      <h3>{t("studio.insight.spreadHeading")}</h3>
      {insight.scheduled === 0 ? (
        <p class="hint">{t("studio.insight.noneScheduled")}</p>
      ) : (
        <>
          <Histogram
            caption={t("studio.insight.intervals")}
            label={t("studio.insight.intervalsLabel")}
            heading={t("studio.insight.interval")}
            bins={insight.intervals}
            range={intervalRange}
          />
          <Histogram
            caption={t("studio.insight.eases")}
            label={t("studio.insight.easesLabel")}
            heading={t("studio.insight.ease")}
            bins={insight.eases}
            range={easeRange}
          />
        </>
      )}

      <h3>{t("studio.insight.lapsesHeading")}</h3>
      <p class="hint">
        {lapses.since === null ? t("studio.insight.noAnswers") : t("studio.insight.lapsesSince", { month: formatMonth(lapses.since) })}
      </p>
      <p class="hint">{t("studio.insight.leechHint", { count: LEECH_LAPSES })}</p>
      {leeches.length === 0 ? (
        <p>{t("studio.insight.noLeeches")}</p>
      ) : (
        <>
          <ol class="studio-leeches" aria-label={t("studio.insight.leeches")}>
            {leeches.map(({ card, lapses: count }) => (
              <li key={card.url}>
                <a href={cardHref(card)}>{cardName(card, readerText)}</a>{" "}
                <span class="hint">{t("studio.insight.leechLapses", { count })}</span>
              </li>
            ))}
          </ol>
          <p>
            <a href={leechesHref}>{t("studio.insight.allLeeches")}</a>
          </p>
        </>
      )}
    </section>
  );
}

/** A histogram's bins as bars, each named by `range`, with the same as a table. */
function Histogram({
  caption,
  label,
  heading,
  bins,
  range,
}: {
  caption: string;
  label: string;
  /** The table's first column: what the bins spread. */
  heading: string;
  bins: readonly Bin[];
  range: (bin: Bin) => string;
}) {
  const { t } = useI18n();
  return (
    <BarChart
      caption={caption}
      label={label}
      bars={bins.map((bin) => ({
        key: String(bin.from),
        value: bin.count,
        text: t("studio.insight.binText", { range: range(bin), count: bin.count }),
      }))}
      prompt={t("studio.insight.pointAtBar")}
    >
      <details class="chart-table">
        <summary>{t("statistics.showTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{heading}</th>
              <th scope="col">{t("studio.insight.prompts")}</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin) => (
              <tr key={bin.from}>
                <td>{range(bin)}</td>
                <td>{bin.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </BarChart>
  );
}
