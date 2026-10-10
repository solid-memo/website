import type { LangText } from "./langText";
import type { Deck } from "./deck";
import type { ShapeName } from "@solid-memo/vocab/types.generated";

/**
 * What checking an instance's documents against Solid Memo's shapes and
 * the DCAT-AP profile found (see docs/validation.md). The app checks an
 * instance whenever it opens it and acts on what it finds according to
 * the user's invalid data policy. What another app wrote — a subject
 * that is not Solid Memo's (the adapter's ownership.ts says which are),
 * or a catalogue's link to such a member — has its results reported as
 * warnings, the subject marked `foreign`, so it never sets a deck aside
 * or blocks the instance.
 */

export interface Violation {
  /** The predicate the result is about; absent for a rule on the subject itself. */
  path?: string;
  /**
   * What is wrong, in every language the shape says it in (sh:message,
   * English and Swedish), English first; the validator's own English when
   * the shape says nothing, which `builtIn` marks.
   */
  message: LangText;
  /** The message is the validator's own English: the app may say it by its constraint instead. */
  builtIn?: true;
  /** The offending value, when the result names one. */
  value?: string;
  severity: "violation" | "warning" | "info";
  /** The SHACL constraint component, e.g. "MinCount", "NodeKind", "Xone". */
  constraint: string;
  /** The published profile the result comes from, when not Solid Memo's own shapes. */
  profile?: "dcat-ap" | "skos";
}

export type SubjectReport =
  /** Checked against the shape of its class and stored version. */
  | {
      url: string;
      status: "checked";
      shape: ShapeName;
      version: number;
      violations: Violation[];
      /** Another app's subject (a foaf:Agent it described, say), whose results are all warnings. */
      foreign?: true;
    }
  /** Stored in a format newer than this app knows: left alone. */
  | { url: string; status: "newer"; shape: ShapeName; version: number; latest: number }
  /** Not a Solid Memo subject: listed so strays are visible, not checked. */
  | { url: string; status: "untyped" }
  /** Not a Solid Memo subject, but one the DCAT-AP profile checks (a licence, say). */
  | {
      url: string;
      status: "profiled";
      violations: Violation[];
      /** Another app's subject (a dcat:Dataset it listed, say), whose results are all warnings. */
      foreign?: true;
    };

export interface DocumentReport {
  url: string;
  /** "missing" is a document the instance has not created yet: not a problem. */
  status: "missing" | "checked";
  subjects: SubjectReport[];
}

export interface ValidationReport {
  instanceUrl: string;
  documents: DocumentReport[];
  /** Results of severity "violation" across every document. */
  violationCount: number;
  conforms: boolean;
}

export function summarize(instanceUrl: string, documents: DocumentReport[]): ValidationReport {
  const violationCount = documents
    .flatMap((document) => document.subjects)
    .flatMap((subject) =>
      subject.status === "checked" || subject.status === "profiled" ? subject.violations : [],
    )
    .filter((violation) => violation.severity === "violation").length;
  return { instanceUrl, documents, violationCount, conforms: violationCount === 0 };
}

function failing(subject: SubjectReport): boolean {
  return (
    (subject.status === "checked" || subject.status === "profiled") &&
    subject.violations.some((violation) => violation.severity === "violation")
  );
}

/** The subjects with a violation, by URL. */
export function failingSubjectUrls(report: ValidationReport): Set<string> {
  return new Set(
    report.documents.flatMap((document) => document.subjects.filter(failing).map((s) => s.url)),
  );
}

/** The documents with a violation, by URL. */
export function failingDocumentUrls(report: ValidationReport): Set<string> {
  return new Set(
    report.documents.filter((document) => document.subjects.some(failing)).map((d) => d.url),
  );
}

/**
 * The decks with invalid data — their catalog entry, or anything in
 * their cards or reviews document — which the "set invalid data aside"
 * policy leaves out until they are repaired. By deck URL.
 */
export function setAsideDecks(report: ValidationReport, decks: readonly Deck[]): Set<string> {
  const subjects = failingSubjectUrls(report);
  const documents = failingDocumentUrls(report);
  return new Set(
    decks
      .filter(
        (deck) =>
          subjects.has(deck.url) ||
          documents.has(deck.cardsDocumentUrl) ||
          documents.has(deck.reviewsDocumentUrl),
      )
      .map((deck) => deck.url),
  );
}

/**
 * Whether the arrangement of the deck list — the catalogue itself or one
 * of its deck groups — has invalid data, which the "set invalid data
 * aside" policy leaves read-only until it is repaired.
 */
export function arrangementSetAside(report: ValidationReport): boolean {
  return report.documents.some((document) =>
    document.subjects.some(
      (subject) => failing(subject) && subject.status === "checked" && (subject.shape === "catalog" || subject.shape === "deckGroup"),
    ),
  );
}
