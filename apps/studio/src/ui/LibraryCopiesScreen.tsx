import { useState } from "preact/hooks";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { StepPart, DeckUpgradeOutcome } from "@solid-memo/domain/deckUpgrade";
import type { Instance } from "@solid-memo/domain/instance";
import { releaseHost, type LibraryCard, type LibraryCopy } from "@solid-memo/domain/library";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { cardName } from "@solid-memo/ui/DataText";
import { DeckUpgradeProgress, type DeckUpgradeScreenStep } from "@solid-memo/ui/DeckUpgrade";
import { useI18n } from "@solid-memo/ui/i18n";
import { describeChanges, historyKept } from "@solid-memo/ui/LibraryUpgradeNotice";
import { LoadingDots } from "@solid-memo/ui/Loading";
import { ReaderText } from "@solid-memo/ui/ReaderText";
import { ReadOnlyNotice } from "./ReadOnly";
import { BulkBar } from "./shell/BulkBar";
import { DataTable } from "./shell/DataTable";
import { NO_SELECTION, type Selection } from "./shell/tableModel";

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
 * as Solid Memo's offer says it. The copy at the table's cursor
 * (a DataTable) is shown beside it (`onCursor`, `current`), with the
 * cards each change touches (LibraryPlanScreen). The copies that can be upgraded are selected by their
 * checkbox, or all at once, and upgraded in turn (`onUpgrade`): the deck
 * being upgraded, with its steps, then how each upgrade ended. Only a
 * deck that may be changed (`selectable`) can be: none while the
 * instance's data is being checked, and none set aside, which a line
 * says (`readOnly`), with a link to the health (`healthHref`). A copy of
 * a release added from a link says the host it came from; whether a
 * newer version of it is out is unknown when its creator's catalogue
 * cannot be read.
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
  current,
  onCursor,
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
  /** The copy shown beside the table, by its deck's URL. */
  current?: string;
  /** Show the copy at the table's cursor beside it (LibraryPlanScreen). */
  onCursor: (deck: Deck) => void;
}) {
  const { t, tx, readerText } = useI18n();
  const [chosen, setChosen] = useState<Selection>(NO_SELECTION);

  const heading = <h2>{t("studio.library.heading", { instance: instance.name })}</h2>;
  if (rows.length === 0) {
    return (
      <section>
        <header>{heading}</header>
        <p class="hint">{tx("studio.library.empty", { library: <a href={libraryHref}>{t("studio.library.libraryLink")}</a> })}</p>
      </section>
    );
  }

  const upgradable = rows.flatMap((row) => {
    const plan = planOf(row);
    return plan === null || !selectable(row.copy.deck) ? [] : [{ deck: row.copy.deck, plan }];
  });
  const selected = upgradable.filter((each) => chosen.has(each.deck.url));
  const busy = running !== null;

  return (
    <section>
      <header>
        {heading}
        <a href={libraryHref}>{t("studio.library.browse")}</a>
      </header>
      <p class="hint">{t("studio.library.intro")}</p>
      <ReadOnlyNotice reason={readOnly} subject="decks" healthHref={healthHref} />
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
      <DataTable
        caption={t("studio.library.caption", { instance: instance.name })}
        rows={rows}
        keyOf={(row) => row.copy.deck.url}
        name={{
          key: "title",
          label: t("studio.decks.title"),
          cell: ({ copy }) => (
            <>
              <a href={deckHref(copy.deck)}>
                <ReaderText text={copy.deck.title} />
              </a>
              {copy.fromLink === true && <span class="studio-badge">{t("studio.decks.badge.from", { host: releaseHost(copy.deck.sourceUrl!) })}</span>}
            </>
          ),
        }}
        columns={[
          {
            key: "copied",
            label: t("studio.library.copied"),
            cell: ({ copy }) =>
              copy.version === null ? <span class="hint">{t("studio.library.unknown")}</span> : t("studio.library.release", { version: copy.version }),
          },
          {
            key: "current",
            label: t("studio.library.current"),
            cell: ({ copy }) =>
              copy.series === null ? <span class="hint">{t("studio.library.gone")}</span> : t("studio.library.release", { version: copy.series.version }),
          },
          { key: "update", label: t("studio.library.update"), cell: (row) => <UpdateText row={row} /> },
        ]}
        select={{
          label: t("studio.decks.select"),
          allLabel: t("studio.library.selectAll"),
          rowLabel: ({ copy }) => t("studio.decks.selectDeck", { deck: readerText(copy.deck.title) }),
          offered: (row) => planOf(row) !== null && selectable(row.copy.deck),
          disabled: busy,
          chosen,
          onChoose: setChosen,
        }}
        current={current}
        onCursor={(row) => onCursor(row.copy.deck)}
      />
      {/* While copies are upgraded, none is selected. */}
      <BulkBar
        label={t("studio.library.bulk")}
        count={selected.length}
        said={t("studio.library.selected", { count: selected.length })}
        onClear={() => setChosen(NO_SELECTION)}
      >
        <button
          type="button"
          class="primary"
          onClick={() => {
            setChosen(NO_SELECTION);
            onUpgrade(selected);
          }}
        >
          {t("studio.library.upgrade", { count: selected.length })}
        </button>
      </BulkBar>
    </section>
  );
}

/** What updating a copy would do, in a sentence; nothing for a copy whose release is gone. */
function UpdateText({ row }: { row: CopyRow }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { series, newer } = row.copy;
  const plan = planOf(row);
  if (series === null) return null;
  if (newer === "unknown") return <span class="hint">{t("studio.library.newerUnknown")}</span>;
  if (!newer) return <>{t("studio.library.upToDate")}</>;
  if (row.plan === "loading") {
    return (
      <>
        <LoadingDots />
        <span class="visually-hidden">{t("studio.library.planning")}</span>
      </>
    );
  }
  if (row.plan === "failed") return <>{t("studio.library.planFailed", { version: series.version })}</>;
  if (plan === null) return <>{t("studio.library.nothingToUpdate", { version: series.version })}</>;
  return <>{t("studio.library.changes", { version: plan.toVersion, changes: describeChanges(plan, i18n) })}</>;
}

/** What upgrading a copy would do, once planned: null when there is nothing to offer, or it is not known yet. */
function planOf(row: CopyRow): LibraryUpgradePlan | null {
  return row.copy.newer === true && typeof row.plan === "object" && row.plan !== null ? row.plan : null;
}

/**
 * A library copy beside the table of them (docs/studio.md, Library
 * copies): the copy at the table's cursor, its release and the
 * library's, what upgrading it would change and, once planned, all it
 * would do: what it keeps, the releases' notes, and the cards each
 * change touches. Without one (`row` null: none at the cursor yet, or
 * one no longer there), how to show one.
 */
export function LibraryPlanScreen({ row }: { row: CopyRow | null }) {
  const { tx } = useI18n();
  if (row === null) return <p class="hint">{tx("studio.library.peek", { j: <kbd>j</kbd>, k: <kbd>k</kbd> })}</p>;
  const plan = planOf(row);
  return (
    <section class="studio-peek" aria-labelledby="studio-plan-heading">
      <h3 id="studio-plan-heading">
        <ReaderText text={row.copy.deck.title} />
      </h3>
      <p>
        <UpdateText row={row} />
      </p>
      {plan !== null && <PlanDetails plan={plan} />}
    </section>
  );
}

/** Everything an upgrade would do: what it keeps, the releases' notes, and the cards each change touches. */
function PlanDetails({ plan }: { plan: LibraryUpgradePlan }) {
  const { t, readerText } = useI18n();
  return (
    <div class="studio-diff">
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
    </div>
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
