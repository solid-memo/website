import { Fragment } from "preact";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { RepairKind, Unrepairable } from "@solid-memo/domain/repair";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n, type I18n } from "./i18n";
import { summaryOf, ValidationScreen, ViolationMessage } from "./ValidationScreen";

/** What a repair does, for the user: "Give the deck the default description". */
export function repairLabels(t: I18n["t"]): Record<RepairKind, string> {
  return {
    "describe-deck": t("repair.action.describeDeck"),
    "direct-deck": t("repair.action.directDeck"),
    "drop-snapshot": t("repair.action.dropSnapshot"),
    "recompute-due": t("repair.action.recomputeDue"),
    "name-agent": t("repair.action.nameAgent"),
    "drop-dangling-members": t("repair.action.dropDanglingMembers"),
    "remove-subject": t("repair.action.removeSubject"),
  };
}

/**
 * Applies repairs (UseCases.applyRepairs), then reads afresh what they
 * may have changed: the decks, cards, reviews and preferences, the
 * format update's plan, and every check of the instance (its own, and
 * its decks' health in the Studio, under the same key).
 */
export function useRepairMutation(useCases: UseCases, instanceUrl: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repairs: Parameters<UseCases["applyRepairs"]>[0]) => useCases.applyRepairs(repairs),
    onSuccess: async () => {
      for (const key of ["decks", "cards", "reviews", "preferences", "migration"]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      await queryClient.invalidateQueries({ queryKey: ["validation", instanceUrl] });
    },
  });
}

/**
 * What an instance check found, and the way out (see docs/validation.md):
 * one button repairs every problem with a safe answer; each problem left
 * is named, with its document linked, and can be removed — the user's
 * call, confirmed first. The full report is a click away.
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
  const plan = useCases.planRepair(report);
  const repairMutation = useRepairMutation(useCases, instance.url);

  function remove(problem: Unrepairable) {
    if (window.confirm(t("repair.removeConfirm", { url: problem.subjectUrl }))) {
      repairMutation.mutate([
        { kind: "remove-subject", documentUrl: problem.documentUrl, subjectUrl: problem.subjectUrl, version: 1 },
      ]);
    }
  }

  const busy = repairMutation.isPending;
  const labels = repairLabels(t);
  return (
    <div class="repair">
      <p>{summaryOf(report, t)}</p>
      {plan.repairs.length > 0 && (
        <>
          <p>{t("repair.canRepair")}</p>
          <ul>
            {plan.repairs.map((repair) => (
              <li key={`${repair.kind} ${repair.subjectUrl}`}>
                {labels[repair.kind]}: <ExternalLink url={repair.subjectUrl} />
              </li>
            ))}
          </ul>
          <button class="primary" onClick={() => repairMutation.mutate(plan.repairs)} disabled={busy}>
            {busy ? t("repair.repairing") : t("repair.repairButton", { count: plan.repairs.length })}
          </button>
        </>
      )}
      {plan.unrepairable.length > 0 && (
        <>
          <p>{t("repair.needDecision")}</p>
          <ul>
            {plan.unrepairable.map((problem) => (
              <li key={problem.subjectUrl}>
                {tx("repair.problem", {
                  subject: <ExternalLink url={problem.subjectUrl} />,
                  document: <ExternalLink url={problem.documentUrl} />,
                  messages: problem.violations.map((violation, index) => (
                    <Fragment key={index}>
                      {index > 0 && " "}
                      <ViolationMessage violation={violation} />
                    </Fragment>
                  )),
                })}{" "}
                <button class="danger" onClick={() => remove(problem)} disabled={busy}>
                  {t("repair.removeButton")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <ErrorMessage error={errorText(repairMutation.error)} />
      <details>
        <summary>{t("repair.fullReport")}</summary>
        <ValidationScreen report={report} />
      </details>
    </div>
  );
}
