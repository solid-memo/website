// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  DocumentReport,
  SubjectReport,
  ValidationReport,
  Violation,
} from "@solid-memo/domain/validation";
import { visibleControls } from "@solid-memo/markdown/parse";
import { useMemo } from "preact/hooks";
import { bounded, LIST_LIMIT, usePaged } from "./bounded";
import { ExternalLink } from "./ExternalLink";
import { useI18n, type I18n } from "./i18n";

/**
 * Why a document could not be read, as the check gave it: a parser's
 * message may quote the document, so its hidden characters are shown as
 * markers (visibleControls), as a web address's are.
 */
export function unreadableReason(reason: string): string {
  return visibleControls(reason);
}

/** The summary line: "All 9 documents conform" or "3 violations in 2 documents". */
export function summaryOf(report: ValidationReport, t: I18n["t"]): string {
  const checked = report.documents.filter((d) => d.status === "checked");
  if (report.conforms) return t("validation.allConform", { count: checked.length });
  // A document the check could not read counts as one with a violation (summarize).
  const failing =
    checked.filter((d) =>
      d.subjects.some(
        (s) =>
          (s.status === "checked" || s.status === "profiled") &&
          s.violations.some((v) => v.severity === "violation"),
      ),
    ).length + report.documents.filter((d) => d.status === "unreadable").length;
  return t("validation.violationsIn", {
    violations: t("validation.violationCount", { count: report.violationCount }),
    documents: t("validation.documentCount", { count: failing }),
  });
}

/** The summary line's look: a hint when all conforms, else a warning. */
export function summaryClass(report: ValidationReport): string {
  return report.conforms ? "hint" : "warning";
}

/** A subject the check has results on: a violation, a warning or a note. */
function hasResults(subject: SubjectReport): boolean {
  return (
    (subject.status === "checked" || subject.status === "profiled") && subject.violations.length > 0
  );
}

/** A document with something wrong: unreadable, or with a subject the check has results on. */
function hasProblems(document: DocumentReport): boolean {
  return document.status === "unreadable" || document.subjects.some(hasResults);
}

/** A line of the report: a subject of a document, or a document listed without one (missing, unreadable, or with no subjects to list). */
interface Entry {
  document: DocumentReport;
  subject?: SubjectReport;
}

/** The report's lines, document by document: with `problemsOnly`, only the documents and subjects with something wrong. */
function entriesOf(report: ValidationReport, problemsOnly: boolean): Entry[] {
  return report.documents.flatMap((document): Entry[] => {
    if (problemsOnly && !hasProblems(document)) return [];
    const subjects = problemsOnly ? document.subjects.filter(hasResults) : document.subjects;
    return subjects.length === 0
      ? [{ document }]
      : subjects.map((subject) => ({ document, subject }));
  });
}

/** The lines a page shows, grouped back under their documents. */
function byDocument(entries: Entry[]): { document: DocumentReport; subjects: SubjectReport[] }[] {
  const groups: { document: DocumentReport; subjects: SubjectReport[] }[] = [];
  let group: { document: DocumentReport; subjects: SubjectReport[] } | undefined;
  for (const { document, subject } of entries) {
    if (group?.document !== document) {
      group = { document, subjects: [] };
      groups.push(group);
    }
    if (subject !== undefined) group.subjects.push(subject);
  }
  return groups;
}

/**
 * The report, document by document, under its summary line — which a
 * screen that announces the summary itself leaves out (`summary={false}`).
 * With `problemsOnly`, only the documents and subjects with something
 * wrong, as the data-check notice shows them. A report can hold any
 * number of documents and subjects, so it shows a page of LIST_LIMIT
 * subjects and documents in all at a time (usePaged), with a button for
 * more, and at most LIST_LIMIT results of each subject.
 */
export function ValidationScreen({
  report,
  summary = true,
  problemsOnly = false,
}: {
  report: ValidationReport;
  summary?: boolean;
  problemsOnly?: boolean;
}) {
  const { t } = useI18n();
  const entries = useMemo(() => entriesOf(report, problemsOnly), [report, problemsOnly]);
  const { shown, more, showMore } = usePaged(entries);
  return (
    <div class="validation">
      {summary && <p class={summaryClass(report)}>{summaryOf(report, t)}</p>}
      {byDocument(shown).map(({ document, subjects }) => (
        <DocumentView key={document.url} document={document} subjects={subjects} />
      ))}
      {more > 0 && (
        <p class="hint">
          {t("dataCheckLists.moreEntries", { count: more })}{" "}
          <button type="button" onClick={showMore}>
            {t("dataCheckLists.showMore", { count: Math.min(more, LIST_LIMIT) })}
          </button>
        </p>
      )}
    </div>
  );
}

function DocumentView({
  document,
  subjects,
}: {
  document: DocumentReport;
  subjects: SubjectReport[];
}) {
  const { t } = useI18n();
  return (
    <section class="thing">
      <h3>
        <ExternalLink url={document.url} />
      </h3>
      {document.status === "missing" ? (
        <p class="hint">{t("validation.notCreated")}</p>
      ) : document.status === "unreadable" ? (
        <p class="warning">
          {t("validation.unreadable", { reason: unreadableReason(document.reason) })}
        </p>
      ) : subjects.length === 0 ? (
        <p class="hint">{t("validation.noSubjects")}</p>
      ) : (
        <ul>
          {subjects.map((subject) => (
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
        return (
          <>{tx("validation.conforms", { name, shape: subject.shape, version: subject.version })}</>
        );
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
  return lang === undefined ? (
    <>{violationText(violation)}</>
  ) : (
    <span lang={lang}>{violationText(violation)}</span>
  );
}

/**
 * One row per result, a DCAT-AP result saying so before its message: a
 * subject can have any number of results, so at most LIST_LIMIT
 * (bounded), and how many more there are.
 */
function ViolationTable({ violations }: { violations: Violation[] }) {
  const { t, severityLabel } = useI18n();
  const { shown, more } = bounded(violations);
  return (
    <>
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
          {shown.map((violation, index) => (
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
      <MoreResults count={more} />
    </>
  );
}

/** How many more results there are than a list of them shows; nothing when there are none. */
function MoreResults({ count }: { count: number }) {
  const { t } = useI18n();
  return count > 0 ? <p class="hint">{t("dataCheckLists.moreResults", { count })}</p> : null;
}
