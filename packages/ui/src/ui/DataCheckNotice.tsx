// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useMemo } from "preact/hooks";
import type { Instance } from "@solid-memo/domain/instance";
import type { InvalidDataPolicy } from "@solid-memo/domain/invalidDataPolicy";
import type { LangText } from "@solid-memo/domain/langText";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { bounded } from "./bounded";
import { useI18n } from "./i18n";
import { LazyDetails } from "./LazyDetails";
import { ReaderTexts } from "./ReaderText";
import { routeToHash } from "./router";
import { summaryOf, ValidationScreen } from "./ValidationScreen";

/**
 * Tells the user that data in the instance does not conform, what the
 * app does about it under their policy, and that it leaves that data as
 * it is: it must be fixed outside the app. The problems are a click
 * away, drawn only once opened (LazyDetails), as the notice sits above
 * every screen; under "block the instance" the notice takes the
 * workspace's place. For the same reason it names the first LIST_LIMIT
 * decks set aside (bounded) and says how many more there are. What
 * another app wrote is never in it: the check reports that as warnings,
 * which need no notice.
 */
export function DataCheckNotice({
  instance,
  report,
  policy,
  setAside,
  arrangementSetAside,
}: {
  instance: Instance;
  report: ValidationReport;
  policy: InvalidDataPolicy;
  /** Titles of the decks set aside, under "set invalid data aside". */
  setAside: LangText[];
  /** The catalog or a deck group is set aside, under "set invalid data aside": the list cannot be rearranged. */
  arrangementSetAside: boolean;
}) {
  const { t, tx } = useI18n();
  const preferences = routeToHash({ screen: "preferences", instanceUrl: instance.url });
  const named = bounded(setAside);
  // Built once per report: the notice stays above every screen.
  const summary = useMemo(() => summaryOf(report, t), [report, t]);
  const consequence =
    policy === "block-instance"
      ? t("dataCheckNotice.blockInstance")
      : policy === "block-subject"
        ? setAside.length === 0
          ? t("dataCheckNotice.restKeepsWorking")
          : tx("dataCheckNotice.setAside", {
              names: (
                <>
                  <ReaderTexts texts={named.shown} />
                  {named.more > 0 && ` ${t("dataCheckNotice.setAsideMore", { count: named.more })}`}
                </>
              ),
              count: setAside.length,
            })
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
      <p>
        {summary} {t("dataCheckNotice.leftAsItIs")}
      </p>
      <LazyDetails summary={t("dataCheckLists.problems")}>
        <ValidationScreen report={report} summary={false} problemsOnly />
      </LazyDetails>
    </div>
  );
}
