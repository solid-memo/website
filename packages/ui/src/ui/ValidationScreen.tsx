import type {
  DocumentReport,
  SubjectReport,
  ValidationReport,
  Violation,
} from "@solid-memo/domain/validation";
import { ExternalLink } from "./ExternalLink";
import { useI18n, type I18n } from "./i18n";

/** The summary line: "All 9 documents conform" or "3 violations in 2 documents". */
export function summaryOf(report: ValidationReport, t: I18n["t"]): string {
  const checked = report.documents.filter((d) => d.status === "checked");
  if (report.conforms) return t("validation.allConform", { count: checked.length });
  const failing = checked.filter((d) =>
    d.subjects.some(
      (s) =>
        (s.status === "checked" || s.status === "profiled") &&
        s.violations.some((v) => v.severity === "violation"),
    ),
  ).length;
  return t("validation.violationsIn", {
    violations: t("validation.violationCount", { count: report.violationCount }),
    documents: t("validation.documentCount", { count: failing }),
  });
}

/** The summary line's look: a hint when all conforms, else a warning. */
export function summaryClass(report: ValidationReport): string {
  return report.conforms ? "hint" : "warning";
}

/**
 * The report, document by document, under its summary line — which a
 * screen that announces the summary itself leaves out (`summary={false}`).
 */
export function ValidationScreen({ report, summary = true }: { report: ValidationReport; summary?: boolean }) {
  const { t } = useI18n();
  return (
    <div class="validation">
      {summary && <p class={summaryClass(report)}>{summaryOf(report, t)}</p>}
      {report.documents.map((document) => (
        <DocumentView key={document.url} document={document} />
      ))}
    </div>
  );
}

function DocumentView({ document }: { document: DocumentReport }) {
  const { t } = useI18n();
  return (
    <section class="thing">
      <h3>
        <ExternalLink url={document.url} />
      </h3>
      {document.status === "missing" ? (
        <p class="hint">{t("validation.notCreated")}</p>
      ) : document.subjects.length === 0 ? (
        <p class="hint">{t("validation.noSubjects")}</p>
      ) : (
        <ul>
          {document.subjects.map((subject) => (
            <li key={subject.url}>
              <SubjectView subject={subject} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SubjectView({ subject }: { subject: SubjectReport }) {
  const { tx } = useI18n();
  const name = <ExternalLink url={subject.url} />;
  switch (subject.status) {
    case "untyped":
      return <>{tx("validation.untyped", { name })}</>;
    case "newer":
      return (
        <>
          {tx("validation.newer", {
            name,
            shape: subject.shape,
            version: subject.version,
            latest: subject.latest,
          })}
        </>
      );
    case "profiled":
      return (
        <>
          {tx(subject.foreign ? "validation.foreign" : "validation.profiled", { name })}
          <ViolationTable violations={subject.violations} />
        </>
      );
    case "checked":
      if (subject.violations.length === 0) {
        return <>{tx("validation.conforms", { name, shape: subject.shape, version: subject.version })}</>;
      }
      return (
        <>
          {subject.foreign
            ? tx("validation.foreign", { name })
            : tx("validation.checked", { name, shape: subject.shape, version: subject.version })}
          <ViolationTable violations={subject.violations} />
        </>
      );
  }
}

/**
 * A shape check's message, as violationText says it: marked with its
 * language when that is not the page's (English, where no translation is).
 */
export function ViolationMessage({ violation }: { violation: Violation }) {
  const { violationText, violationLang } = useI18n();
  const lang = violationLang(violation);
  return lang === undefined ? <>{violationText(violation)}</> : <span lang={lang}>{violationText(violation)}</span>;
}

/** One row per result; a DCAT-AP result says so before its message. */
function ViolationTable({ violations }: { violations: Violation[] }) {
  const { t, severityLabel } = useI18n();
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{t("validation.severity")}</th>
          <th scope="col">{t("validation.property")}</th>
          <th scope="col">{t("validation.message")}</th>
          <th scope="col">{t("validation.value")}</th>
        </tr>
      </thead>
      <tbody>
        {violations.map((violation, index) => (
          <tr key={index}>
            <td>{severityLabel(violation.severity)}</td>
            <td>
              {violation.path === undefined ? (
                t("validation.theSubject")
              ) : (
                <ExternalLink url={violation.path} />
              )}
            </td>
            <td>
              {violation.profile === "dcat-ap" && "DCAT-AP: "}
              <ViolationMessage violation={violation} />
            </td>
            <td>{violation.value ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
