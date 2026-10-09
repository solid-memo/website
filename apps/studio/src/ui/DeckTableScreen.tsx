import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { useI18n } from "@solid-memo/ui/i18n";
import { LoadingDots } from "@solid-memo/ui/Loading";
import { ReaderText } from "@solid-memo/ui/ReaderText";

/** One figure of a deck's row: a number, or why there is none yet. */
export type Count = number | "loading" | "unreadable";

/** A deck's row: how many cards it has (retired ones aside) and how many are due today. */
export interface DeckFigures {
  cards: Count;
  due: Count;
}

/**
 * Home: every deck of the instance as a table, a row each, with its
 * figures as they come in. Read-only; a deck is studied and edited in
 * Solid Memo, which `appHref` opens at the instance's decks.
 */
export function DeckTableScreen({
  instance,
  decks,
  figures,
  appHref,
}: {
  instance: Instance;
  decks: Deck[];
  figures: (deck: Deck) => DeckFigures;
  appHref: string;
}) {
  const { t, tx } = useI18n();
  return (
    <section>
      <h2>{t("studio.decks.heading")}</h2>
      {decks.length === 0 ? (
        <p class="hint">{tx("studio.decks.empty", { app: <a href={appHref}>{t("app.documentTitle")}</a> })}</p>
      ) : (
        <table class="studio-decks">
          <caption>{t("studio.decks.caption", { instance: instance.name })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("studio.decks.deck")}</th>
              <th scope="col">{t("studio.decks.cards")}</th>
              <th scope="col">{t("studio.decks.due")}</th>
            </tr>
          </thead>
          <tbody>
            {decks.map((deck) => {
              const { cards, due } = figures(deck);
              return (
                <tr key={deck.url}>
                  <th scope="row">
                    <ReaderText text={deck.title} />
                  </th>
                  <td>
                    <CountCell count={cards} />
                  </td>
                  <td>
                    <CountCell count={due} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A figure, or while it is counted a loader, or a dash for one that could not be read; each named for a screen reader. */
function CountCell({ count }: { count: Count }) {
  const { t } = useI18n();
  if (typeof count === "number") return <>{count}</>;
  return count === "loading" ? (
    <>
      <LoadingDots />
      <span class="visually-hidden">{t("studio.decks.counting")}</span>
    </>
  ) : (
    <>
      <span aria-hidden="true">–</span>
      <span class="visually-hidden">{t("studio.decks.unreadable")}</span>
    </>
  );
}
