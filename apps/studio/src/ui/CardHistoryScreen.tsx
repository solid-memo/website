import type { Answer } from "@solid-memo/domain/answer";
import { isRecalled } from "@solid-memo/domain/answer";
import { isMarkdown, type Card } from "@solid-memo/domain/deck";
import { fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { DataLine } from "@solid-memo/ui/DataText";
import { useI18n } from "@solid-memo/ui/i18n";

/** How each SM-2 grade is named, as Solid Memo's study names it. */
const GRADES = ["blackout", "wrong", "almost", "hard", "good", "easy"] as const;

/**
 * The card inspector's history tab: the card's answers in its deck,
 * newest first (`answers`), a row each: when it was given, which way,
 * its grade, how (recalled, or chosen among options) and, for a wrong
 * choice, the wrong option chosen, named as the card has it now (by its
 * id when the card no longer has it). Above, how many there are and how
 * many forgot the card.
 */
export function CardHistoryScreen({ card, answers }: { card: Card; answers: readonly Answer[] }) {
  const { t, locale, directionLabel } = useI18n();
  const instant = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });
  const markdown = isMarkdown(card.textFormat);
  const chosen = (iri: string) => {
    const id = fragmentIdOf(iri);
    const option = card.distractors?.find((distractor) => distractor.id === id);
    return option === undefined ? t("studio.history.unknownOption", { id }) : <DataLine text={option.text} markdown={markdown} />;
  };
  const forgotten = answers.filter((answer) => !isRecalled(answer)).length;
  return (
    <div class="studio-history">
      {answers.length === 0 ? (
        <p>{t("studio.history.empty")}</p>
      ) : (
        <>
          <p>{t("studio.history.summary", { count: answers.length, forgotten })}</p>
          <div class="studio-table">
            <table class="studio-list">
              <caption>{t("studio.history.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("studio.history.column.when")}</th>
                  <th scope="col">{t("studio.history.column.direction")}</th>
                  <th scope="col">{t("studio.history.column.grade")}</th>
                  <th scope="col">{t("studio.history.column.mode")}</th>
                  <th scope="col">{t("studio.history.column.chosen")}</th>
                </tr>
              </thead>
              <tbody>
                {answers.map((answer) => (
                  <tr key={answer.id} class={isRecalled(answer) ? undefined : "forgotten"}>
                    <td>{instant(answer.answeredAt)}</td>
                    <td>{directionLabel(answer.direction)}</td>
                    <td>{t(`study.quality.${GRADES[answer.grade]}`)}</td>
                    <td>{t(`studio.history.mode.${answer.mode ?? "recall"}`)}</td>
                    <td>{answer.chosenDistractor === undefined ? "" : chosen(answer.chosenDistractor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p class="hint">{t("studio.history.hint")}</p>
    </div>
  );
}
