// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { Answer } from "@solid-memo/domain/answer";
import { isRecalled } from "@solid-memo/domain/answer";
import { chainIndexOf, isLapse } from "@solid-memo/domain/answerChain";
import { isMarkdown, type Card } from "@solid-memo/domain/deck";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { DataLine } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";
import { DataTable } from "./shell/DataTable";
import { nextSort, sortedRows, type TableSort } from "./shell/tableModel";

/** A column of the answers, to sort them by. */
type HistoryColumn = "when" | "direction" | "grade" | "mode";

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
 * cards' table's, not its own.
 */
export function CardHistoryScreen({ card, answers }: { card: Card; answers: readonly Answer[] }) {
  const { t, locale, directionLabel } = useI18n();
  const [sort, setSort] = useState<TableSort<HistoryColumn>>();
  const instant = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });
  const markdown = isMarkdown(card.textFormat);
  const chosen = (iri: string) => {
    const id = fragmentIdOf(iri);
    const option = card.distractors?.find((distractor) => distractor.id === id);
    return option === undefined ? (
      t("studio.history.unknownOption", { id })
    ) : (
      <DataLine text={option.text} markdown={markdown} />
    );
  };
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
            rows={sortedRows(
              answers,
              sort,
              (answer, column) =>
                column === "when"
                  ? Date.parse(answer.answeredAt)
                  : column === "direction"
                    ? directionLabel(answer.direction)
                    : column === "grade"
                      ? answer.grade
                      : t(`studio.history.mode.${answer.mode ?? "recall"}`),
              locale,
            )}
            keyOf={(answer) => answer.id}
            classOf={(answer) => (isRecalled(answer) ? undefined : "forgotten")}
            name={{
              key: "when",
              label: t("studio.history.column.when"),
              cell: (answer) => instant(answer.answeredAt),
            }}
            columns={[
              {
                key: "direction",
                label: t("studio.history.column.direction"),
                cell: (answer) => directionLabel(answer.direction),
              },
              {
                key: "grade",
                label: t("studio.history.column.grade"),
                cell: (answer) => t(`study.quality.${GRADES[answer.grade]}`),
              },
              {
                key: "mode",
                label: t("studio.history.column.mode"),
                cell: (answer) => t(`studio.history.mode.${answer.mode ?? "recall"}`),
              },
              {
                key: "chosen",
                label: t("studio.history.column.chosen"),
                unsorted: true,
                cell: (answer) =>
                  answer.chosenDistractor === undefined ? "" : chosen(answer.chosenDistractor),
              },
            ]}
            sort={sort}
            onSort={(key) => setSort(nextSort(sort, key as HistoryColumn))}
            keys={false}
          />
        </>
      )}
      <p class="hint">{t("studio.history.hint")}</p>
    </div>
  );
}
