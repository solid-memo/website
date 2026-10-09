import { useState } from "preact/hooks";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { StepPart, DeckUpgradeOutcome } from "@solid-memo/domain/deckUpgrade";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCard, LibraryCopy } from "@solid-memo/domain/library";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { cardName } from "@solid-memo/ui/DataText";
import { DeckUpgradeProgress, type DeckUpgradeScreenStep } from "@solid-memo/ui/DeckUpgrade";
import { useI18n } from "@solid-memo/ui/i18n";
import { describeChanges, historyKept } from "@solid-memo/ui/LibraryUpgradeNotice";
import { LoadingDots } from "@solid-memo/ui/Loading";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { ReadOnlyNotice } from "./ReadOnly";

/** What upgrading a copy would do: its plan, null when there is nothing to offer, or why it is not known yet. */
export type PlanState = LibraryUpgradePlan | null | "loading" | "failed";

/** A copy of a library release, and, when the library has a newer one, what upgrading would do. */
export interface CopyRow {
  copy: LibraryCopy;
  /** Only looked at when the copy is not up to date (`copy.newer`). */
  plan: PlanState;
}

/** The deck a batch is upgrading, and how far along it is. */
export interface BatchRun {
  /** Which of the batch's decks it is, from 0. */
  index: number;
  total: number;
  deck: Deck;
  step: DeckUpgradeScreenStep;
  done: number;
  part?: StepPart;
}

/** How a deck's upgrade in a batch ended. */
export interface BatchResult {
  deck: Deck;
  plan: LibraryUpgradePlan;
  outcome: DeckUpgradeOutcome;
}

/** The kinds of change an upgrade makes to cards, in the order the diff lists them. */
const CHANGES = ["add", "change", "retire", "restore", "remove", "kept"] as const;

/**
 * The instance's decks copied from a library release, as a table: the
 * release each was copied from, the library's current one and, when it
 * is newer, what upgrading would change (planLibraryUpgrade): a sentence,
 * as Solid Memo's offer says it, and a list of the cards each change
 * touches. The copies that can be upgraded are selected by their
 * checkbox, or all at once, and upgraded in turn (`onUpgrade`): the deck
 * being upgraded, with its steps, then how each upgrade ended. Only a
 * deck that may be changed (`selectable`) can be: none while the
 * instance's data is being checked, and none set aside, which a line
 * says (`readOnly`), with a link to the health (`healthHref`).
 */
export function LibraryCopiesScreen({
  instance,
  rows,
  running,
  results,
  deckHref,
  libraryHref,
  readOnly,
  selectable,
  healthHref,
  onUpgrade,
}: {
  instance: Instance;
  rows: readonly CopyRow[];
  /** The deck a batch is upgrading; null when none runs. */
  running: BatchRun | null;
  /** How each upgrade of the last batch ended, in its order. */
  results: readonly BatchResult[];
  /** What a deck says of itself, in the Studio. */
  deckHref: (deck: Deck) => string;
  /** Solid Memo's deck library. */
  libraryHref: string;
  /** Why some decks, or all, cannot be upgraded now (useDataCheck); null when all can. */
  readOnly: ReadOnlyReason | null;
  /** Whether a deck may be changed, so upgraded. */
  selectable: (deck: Deck) => boolean;
  /** The instance's health, where data set aside is repaired. */
  healthHref: string;
  onUpgrade: (chosen: readonly { deck: Deck; plan: LibraryUpgradePlan }[]) => void;
}) {
  const i18n = useI18n();
  const { t, tx, readerText } = i18n;
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  const heading = <h2>{t("studio.library.heading", { instance: instance.name })}</h2>;
  if (rows.length === 0) {
    return (
      <section>
        <header>{heading}</header>
        <p class="hint">{tx("studio.library.empty", { library: <a href={libraryHref}>{t("studio.library.libraryLink")}</a> })}</p>
      </section>
    );
  }

  const planOf = (row: CopyRow) => (row.copy.newer && typeof row.plan === "object" && row.plan !== null ? row.plan : null);
  const upgradable = rows.flatMap((row) => {
    const plan = planOf(row);
    return plan === null || !selectable(row.copy.deck) ? [] : [{ deck: row.copy.deck, plan }];
  });
  const selected = upgradable.filter((each) => chosen.has(each.deck.url));
  const busy = running !== null;
  const toggle = (urls: readonly string[], on: boolean) =>
    setChosen((all) => new Set(on ? [...all, ...urls] : [...all].filter((url) => !urls.includes(url))));

  return (
    <section>
      <header>
        {heading}
        <a href={libraryHref}>{t("studio.library.browse")}</a>
      </header>
      <p class="hint">{t("studio.library.intro")}</p>
      <ReadOnlyNotice reason={readOnly} subject="decks" healthHref={healthHref} />
      {selected.length > 0 && !busy && (
        <div class="edit-actions">
          <button
            class="primary"
            onClick={() => {
              setChosen(new Set());
              onUpgrade(selected);
            }}
          >
            {t("studio.library.upgrade", { count: selected.length })}
          </button>
        </div>
      )}
      {running !== null && (
        <>
          <p>
            {tx("studio.library.running", {
              deck: <ReaderText text={running.deck.title} />,
              at: running.index + 1,
              total: running.total,
            })}
          </p>
          <DeckUpgradeProgress step={running.step} done={running.done} part={running.part} />
        </>
      )}
      <div role="status">
        {results.length > 0 && !busy && (
          <ul>
            {results.map((result) => (
              <li key={result.deck.url}>
                <BatchResultText result={result} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="studio-table">
        <table class="studio-list">
          <caption>{t("studio.library.caption", { instance: instance.name })}</caption>
          <thead>
            <tr>
              <th scope="col">
                <span class="visually-hidden">{t("studio.decks.select")}</span>
                {upgradable.length > 0 && (
                  <input
                    type="checkbox"
                    aria-label={t("studio.library.selectAll")}
                    checked={upgradable.every((each) => chosen.has(each.deck.url))}
                    disabled={busy}
                    onChange={(event) => toggle(upgradable.map((each) => each.deck.url), event.currentTarget.checked)}
                  />
                )}
              </th>
              <th scope="col">{t("studio.decks.title")}</th>
              <th scope="col">{t("studio.library.copied")}</th>
              <th scope="col">{t("studio.library.current")}</th>
              <th scope="col">{t("studio.library.update")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { deck, series, version } = row.copy;
              const plan = planOf(row);
              return (
                <tr key={deck.url}>
                  <td>
                    {plan !== null && selectable(deck) && (
                      <input
                        type="checkbox"
                        aria-label={t("studio.decks.selectDeck", { deck: readerText(deck.title) })}
                        checked={chosen.has(deck.url)}
                        disabled={busy}
                        onChange={(event) => toggle([deck.url], event.currentTarget.checked)}
                      />
                    )}
                  </td>
                  <th scope="row">
                    <a href={deckHref(deck)}>
                      <ReaderText text={deck.title} />
                    </a>
                  </th>
                  <td>{version === null ? <span class="hint">{t("studio.library.unknown")}</span> : t("studio.library.release", { version })}</td>
                  <td>
                    {series === null ? (
                      <span class="hint">{t("studio.library.gone")}</span>
                    ) : (
                      t("studio.library.release", { version: series.version })
                    )}
                  </td>
                  <td>
                    {series === null ? null : !row.copy.newer ? (
                      t("studio.library.upToDate")
                    ) : row.plan === "loading" ? (
                      <>
                        <LoadingDots />
                        <span class="visually-hidden">{t("studio.library.planning")}</span>
                      </>
                    ) : row.plan === "failed" ? (
                      t("studio.library.planFailed", { version: series.version })
                    ) : plan === null ? (
                      t("studio.library.nothingToUpdate", { version: series.version })
                    ) : (
                      <>
                        {t("studio.library.changes", { version: plan.toVersion, changes: describeChanges(plan, i18n) })}
                        <PlanDetails plan={plan} />
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Everything an upgrade would do: what it keeps, the releases' notes, and the cards each change touches. */
function PlanDetails({ plan }: { plan: LibraryUpgradePlan }) {
  const { t, readerText } = useI18n();
  return (
    <details class="studio-diff">
      <summary>{t("studio.library.details")}</summary>
      <p>
        {historyKept(plan, t)}
        {plan.kept.length > 0 && ` ${t("libraryUpgradeNotice.kept", { count: plan.kept.length })}`}
      </p>
      {plan.notes.length > 0 && (
        <ul>
          {plan.notes.map((note) => (
            <li key={note.version}>{t("libraryUpgradeNotice.releaseNote", { version: note.version, notes: note.notes })}</li>
          ))}
        </ul>
      )}
      {CHANGES.map((kind) => {
        const cards: readonly (Card | LibraryCard)[] = plan[kind];
        return (
          cards.length > 0 && (
            <div key={kind}>
              <h4>{t(`studio.library.cards.${kind}`, { count: cards.length })}</h4>
              <ul>
                {cards.map((card) => (
                  <li key={card.id}>{cardName(card, readerText)}</li>
                ))}
              </ul>
            </div>
          )
        );
      })}
    </details>
  );
}

/** How one upgrade of a batch ended: the release the deck is at now, or where it failed and whether the deck changed. */
function BatchResultText({ result }: { result: BatchResult }) {
  const { t, tx, errorText } = useI18n();
  const deck = <ReaderText text={result.deck.title} />;
  const { outcome } = result;
  if (outcome.ok) return <>{tx("studio.library.updated", { deck, version: result.plan.toVersion })}</>;
  return (
    <>
      {tx("studio.library.failed", { deck, step: t(`deckUpgrade.step.${outcome.step}`).toLowerCase() })}{" "}
      {errorText(outcome.error)} {outcome.changed ? t("deckUpgrade.partlyChanged") : t("deckUpgrade.noChanges")}
    </>
  );
}
