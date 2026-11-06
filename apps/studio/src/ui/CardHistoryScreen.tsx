// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo, useState } from "preact/hooks";
import type { Answer } from "@solid-memo/domain/answer";
import { isRecalled, MAX_HISTORY_ROWS } from "@solid-memo/domain/answer";
import { chainIndexOf, isLapse } from "@solid-memo/domain/answerChain";
import { isMarkdown, type Card, type Distractor } from "@solid-memo/domain/deck";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { DataLine } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { DataTable } from "./shell/DataTable";
import { nextSort, sortedRows, type TableSort } from "./shell/tableModel";

/** A column of the answers, to sort them by. */
type HistoryColumn = "when" | "direction" | "grade" | "mode";

/** An answer of the history, with the wrong option it chose, looked up once. */
type HistoryRow = {
  answer: Answer;
  /** The chosen option's id; undefined when no wrong option was chosen. */
  chosenId?: string;
  /** The chosen option as the card has it now; undefined when it no longer does. */
  chosen?: Distractor;
};

/**
 * The card's distractors by id, the first of an id kept, so that each
 * answer's chosen option is looked up at once, not searched for among
 * all of them, however many the card has.
 */
function distractorsById(card: Card): ReadonlyMap<string, Distractor> {
  const byId = new Map<string, Distractor>();
  for (const distractor of card.distractors ?? []) {
    if (!byId.has(distractor.id)) byId.set(distractor.id, distractor);
  }
  return byId;
}

/** How each SM-2 grade is named, as Solid Memo's study names it. */
const GRADES = ["blackout", "wrong", "almost", "hard", "good", "easy"] as const;

/**
 * The card inspector's history tab: the card's answers in its deck,
 * newest first (`answers`), a row each: when it was given, which way,
 * its grade, how (recalled, or chosen among options) and, for a wrong
 * choice, the wrong option chosen, named as the card has it now (by its
 * id when the card no longer has it). Above, how many there are and the
 * card's lapses (answerChain.ts isLapse), as the cards' table counts
 * them; a row below grade 3 is marked forgotten all the same. The table is a DataTable: a column's header
 * sorts it by the column (but the wrong option's), then the other way,
 * then newest first again. Beside the deck's cards, the keys are the
 * cards' table's, not its own. Each answer's chosen option is looked
 * up in the card's distractors by id once for the answers, and the rows
 * are sorted again only when the answers, the sort or the language
 * change. Past MAX_HISTORY_ROWS the table holds the newest, a line under
 * it saying so, and sorts those; the count above still covers them all.
 */
export function CardHistoryScreen({ card, answers }: { card: Card; answers: readonly Answer[] }) {
  const { t, locale, directionLabel } = useI18n();
  const [sort, setSort] = useState<TableSort<HistoryColumn>>();
  const instant = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });
  const markdown = isMarkdown(card.textFormat);
  const byId = useMemo(() => distractorsById(card), [card]);
  const rows = useMemo(
    () =>
      answers.slice(0, MAX_HISTORY_ROWS).map((answer): HistoryRow => {
        if (answer.chosenDistractor === undefined) return { answer };
        const chosenId = fragmentIdOf(answer.chosenDistractor);
        const chosen = byId.get(chosenId);
        return chosen === undefined ? { answer, chosenId } : { answer, chosenId, chosen };
      }),
    [answers, byId],
  );
  const sorted = useMemo(
    () =>
      sortedRows(
        rows,
        sort,
        ({ answer }, column) =>
          column === "when"
            ? Date.parse(answer.answeredAt)
            : column === "direction"
              ? directionLabel(answer.direction)
              : column === "grade"
                ? answer.grade
                : t(`studio.history.mode.${answer.mode ?? "recall"}`),
        locale,
      ),
    [rows, sort, locale, t, directionLabel],
  );
  const chosenCell = ({ chosenId, chosen }: HistoryRow) =>
    chosenId === undefined ? (
      ""
    ) : chosen === undefined ? (
      t("studio.history.unknownOption", { id: chosenId })
    ) : (
      <DataLine text={chosen.text} markdown={markdown} />
    );
  const index = chainIndexOf(answers);
  const lapses = answers.filter((answer) => isLapse(answer, index)).length;
  return (
    <div class="studio-history">
      {answers.length === 0 ? (
        <p>{t("studio.history.empty")}</p>
      ) : (
        <>
          <p>{t("studio.history.summary", { count: answers.length, lapses })}</p>
          <DataTable
            caption={t("studio.history.caption")}
            rows={sorted}
            keyOf={({ answer }) => answer.id}
            classOf={({ answer }) => (isRecalled(answer) ? undefined : "forgotten")}
            name={{
              key: "when",
              label: t("studio.history.column.when"),
              cell: ({ answer }) => instant(answer.answeredAt),
            }}
            columns={[
              {
                key: "direction",
                label: t("studio.history.column.direction"),
                cell: ({ answer }) => directionLabel(answer.direction),
              },
              {
                key: "grade",
                label: t("studio.history.column.grade"),
                cell: ({ answer }) => t(`study.quality.${GRADES[answer.grade]}`),
              },
              {
                key: "mode",
                label: t("studio.history.column.mode"),
                cell: ({ answer }) => t(`studio.history.mode.${answer.mode ?? "recall"}`),
              },
              {
                key: "chosen",
                label: t("studio.history.column.chosen"),
                unsorted: true,
                cell: chosenCell,
              },
            ]}
            sort={sort}
            onSort={(key) => setSort(nextSort(sort, key as HistoryColumn))}
            keys={false}
          />
          {answers.length > MAX_HISTORY_ROWS && (
            <p class="hint">
              {t("card.historyCapped", { shown: MAX_HISTORY_ROWS, total: answers.length })}
            </p>
          )}
        </>
      )}
      <p class="hint">{t("studio.history.hint")}</p>
    </div>
  );
}
