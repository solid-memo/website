// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Fragment } from "preact";
import { useMemo } from "preact/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { RepairKind, Unrepairable } from "@solid-memo/domain/repair";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { bounded } from "./bounded";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n, type I18n } from "./i18n";
import { LazyDetails } from "./LazyDetails";
import { summaryOf, ValidationScreen, ViolationMessage } from "./ValidationScreen";
import { queryKeys } from "./queryKeys";

/** What a repair does, for the user: "Give the deck the default description". */
export function repairLabels(t: I18n["t"]): Record<RepairKind, string> {
  return {
    "describe-deck": t("repair.action.describeDeck"),
    "direct-deck": t("repair.action.directDeck"),
    "drop-snapshot": t("repair.action.dropSnapshot"),
    "recompute-due": t("repair.action.recomputeDue"),
    "name-agent": t("repair.action.nameAgent"),
    "drop-dangling-members": t("repair.action.dropDanglingMembers"),
    "drop-unreadable-date": t("repair.action.dropUnreadableDate"),
    "remove-subject": t("repair.action.removeSubject"),
  };
}

/**
 * Applies repairs (UseCases.applyRepairs), then reads afresh what they
 * may have changed: the decks, cards, reviews and preferences, the
 * format update's plan, and the checks under `checkKey`: by default
 * every check of the instance (its own, and its decks' health in the
 * Studio, under the same key); a deck's health alone where what it
 * finds is put in the instance's check.
 */
export function useRepairMutation(
  useCases: UseCases,
  instanceUrl: string,
  checkKey: readonly unknown[] = queryKeys.validation(instanceUrl),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repairs: Parameters<UseCases["applyRepairs"]>[1]) =>
      useCases.applyRepairs(instanceUrl, repairs),
    onSuccess: async () => {
      for (const queryKey of [
        queryKeys.allDecks(),
        queryKeys.allCards(),
        queryKeys.allReviews(),
        queryKeys.allPreferences(),
        queryKeys.allMigrations(),
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
      await queryClient.invalidateQueries({ queryKey: checkKey });
    },
  });
}

/**
 * What an instance check found, and the way out (see docs/validation.md):
 * one button repairs every problem with a safe answer; each problem left
 * is named, with its document linked, and can be removed — the user's
 * call, confirmed first. The report's problems are a click away, drawn
 * only once opened. A check can find any number of problems, so each
 * list shows the first LIST_LIMIT (bounded) and says how many more
 * there are; the button repairs them all.
 */
export function RepairContainer({
  useCases,
  instance,
  report,
}: {
  useCases: UseCases;
  instance: Instance;
  report: ValidationReport;
}) {
  const { t, tx, errorText } = useI18n();
  const plan = useMemo(() => useCases.planRepair(report), [useCases, report]);
  const repairMutation = useRepairMutation(useCases, instance.url);

  function remove(problem: Unrepairable) {
    if (window.confirm(t("repair.removeConfirm", { url: problem.subjectUrl }))) {
      repairMutation.mutate([
        {
          kind: "remove-subject",
          documentUrl: problem.documentUrl,
          subjectUrl: problem.subjectUrl,
          version: 1,
        },
      ]);
    }
  }

  const summary = useMemo(() => summaryOf(report, t), [report, t]);
  const busy = repairMutation.isPending;
  const labels = repairLabels(t);
  const repairs = bounded(plan.repairs);
  const unrepairable = bounded(plan.unrepairable);
  return (
    <div class="repair">
      <p>{summary}</p>
      {plan.repairs.length > 0 && (
        <>
          <p>{t("repair.canRepair")}</p>
          <ul>
            {repairs.shown.map((repair) => (
              <li key={`${repair.kind} ${repair.subjectUrl}`}>
                {labels[repair.kind]}: <ExternalLink url={repair.subjectUrl} />
              </li>
            ))}
          </ul>
          {repairs.more > 0 && (
            <p class="hint">{t("dataCheckLists.moreRepairs", { count: repairs.more })}</p>
          )}
          <button
            class="primary"
            onClick={() => repairMutation.mutate(plan.repairs)}
            disabled={busy}
          >
            {busy
              ? t("repair.repairing")
              : t("repair.repairButton", { count: plan.repairs.length })}
          </button>
        </>
      )}
      {plan.unrepairable.length > 0 && (
        <>
          <p>{t("repair.needDecision")}</p>
          <ul>
            {unrepairable.shown.map((problem) => (
              <li key={problem.subjectUrl}>
                {tx("repair.problem", {
                  subject: <ExternalLink url={problem.subjectUrl} />,
                  document: <ExternalLink url={problem.documentUrl} />,
                  messages: <ProblemMessages problem={problem} />,
                })}{" "}
                <button class="danger" onClick={() => remove(problem)} disabled={busy}>
                  {t("repair.removeButton")}
                </button>
              </li>
            ))}
          </ul>
          {unrepairable.more > 0 && (
            <p class="hint">{t("dataCheckLists.moreProblems", { count: unrepairable.more })}</p>
          )}
        </>
      )}
      <ErrorMessage error={errorText(repairMutation.error)} />
      <LazyDetails summary={t("dataCheckLists.problems")}>
        <ValidationScreen report={report} summary={false} problemsOnly />
      </LazyDetails>
    </div>
  );
}

/**
 * What the check says about a problem no repair covers: a subject can
 * have any number of results, so at most LIST_LIMIT of them (bounded),
 * and how many more there are.
 */
function ProblemMessages({ problem }: { problem: Unrepairable }) {
  const { t } = useI18n();
  const { shown, more } = bounded(problem.violations);
  return (
    <>
      {shown.map((violation, index) => (
        <Fragment key={index}>
          {index > 0 && " "}
          <ViolationMessage violation={violation} />
        </Fragment>
      ))}
      {more > 0 && ` ${t("dataCheckLists.moreResults", { count: more })}`}
    </>
  );
}
