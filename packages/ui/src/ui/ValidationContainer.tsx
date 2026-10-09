import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { Loading } from "./Loading";
import { summaryClass, summaryOf, ValidationScreen } from "./ValidationScreen";

/**
 * Developer tool: the instance's documents checked against Solid Memo's
 * shapes (docs/validation.md). Reads every document once; "Validate
 * again" reads them afresh.
 */
export function ValidationContainer({
  useCases,
  instance,
}: {
  useCases: UseCases;
  instance: Instance;
}) {
  const { t, errorText } = useI18n();
  const reportQuery = useQuery({
    queryKey: ["validation", instance.url],
    queryFn: () => useCases.validateInstance(instance.url),
    staleTime: Infinity,
  });

  const report = reportQuery.data;

  return (
    <>
      <h2>{t("validation.heading", { name: instance.name })}</h2>
      <p>
        <button
          onClick={() => reportQuery.refetch()}
          disabled={reportQuery.isFetching}
        >
          {reportQuery.isFetching ? t("validation.validating") : t("validation.validateAgain")}
        </button>
      </p>
      {reportQuery.isPending && <Loading label={t("validation.validating")} />}
      <ErrorMessage error={errorText(reportQuery.error)} />
      {/* Mounted throughout, so the summary is heard each time the check
          ends: empty while it runs, then filled. */}
      <p class={report === undefined ? "hint" : summaryClass(report)} role="status">
        {report === undefined || reportQuery.isFetching ? "" : summaryOf(report, t)}
      </p>
      {report && <ValidationScreen report={report} summary={false} />}
    </>
  );
}
