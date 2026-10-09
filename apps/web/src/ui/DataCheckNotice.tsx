import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import type { InvalidDataPolicy } from "@solid-memo/domain/invalidDataPolicy";
import type { LangText } from "@solid-memo/domain/langText";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { useI18n } from "./i18n";
import { ReaderTexts } from "./ReaderText";
import { RepairContainer } from "./RepairContainer";
import { routeToHash } from "./router";

/**
 * Tells the user that data in the instance does not conform, and what
 * the app does about it under their policy, with the repair a click
 * away. Under "block the instance" the notice takes the workspace's
 * place; otherwise it sits above it. What another app wrote is never in
 * it: the check reports that as warnings, which need no notice.
 */
export function DataCheckNotice({
  useCases,
  instance,
  report,
  policy,
  setAside,
  arrangementSetAside,
}: {
  useCases: UseCases;
  instance: Instance;
  report: ValidationReport;
  policy: InvalidDataPolicy;
  /** Titles of the decks set aside, under "set invalid data aside". */
  setAside: LangText[];
  /** The catalogue or a deck group is set aside, under "set invalid data aside": the list cannot be rearranged. */
  arrangementSetAside: boolean;
}) {
  const { t, tx } = useI18n();
  const preferences = routeToHash({ screen: "preferences", instanceUrl: instance.url });
  const consequence =
    policy === "block-instance"
      ? t("dataCheckNotice.blockInstance")
      : policy === "block-subject"
        ? setAside.length === 0
          ? t("dataCheckNotice.restKeepsWorking")
          : tx("dataCheckNotice.setAside", { names: <ReaderTexts texts={setAside} />, count: setAside.length })
        : t("dataCheckNotice.keepsWorking");
  return (
    <div class="warning data-check" role="region" aria-label={t("dataCheckNotice.region")}>
      <p>
        <strong>{t("dataCheckNotice.heading", { name: instance.name })}</strong> {consequence}{" "}
        {arrangementSetAside && <>{t("dataCheckNotice.arrangementSetAside")} </>}
        {tx("dataCheckNotice.policyHint", {
          preferences: <a href={preferences}>{t("dataCheckNotice.preferences")}</a>,
        })}
      </p>
      {policy === "block-instance" ? (
        <RepairContainer useCases={useCases} instance={instance} report={report} />
      ) : (
        <details>
          <summary>{t("dataCheckNotice.repair")}</summary>
          <RepairContainer useCases={useCases} instance={instance} report={report} />
        </details>
      )}
    </div>
  );
}
