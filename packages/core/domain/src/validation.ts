// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LangText } from "./langText";
import type { Deck } from "./deck";
import type { InvalidDataPolicy } from "./invalidDataPolicy";
import type { ShapeName } from "@solid-memo/vocab/types.generated";

/**
 * What checking an instance's documents against Solid Memo's shapes and
 * the DCAT-AP profile found (see docs/validation.md). The app checks an
 * instance whenever it opens it and acts on what it finds according to
 * the user's invalid data policy. What another app wrote — a subject
 * that is not Solid Memo's (the adapter's ownership.ts says which are),
 * or a catalog's link to such a member — has its results reported as
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

/**
 * How many results of one check Solid Memo keeps: of one subject against
 * one shape, or of one node in a check of a whole graph. A constraint on
 * each value gives a result for each, and data another app wrote may
 * hold any number of values; past this, one result (resultsNotShown)
 * says there are more, and the subject still does not conform.
 */
export const MAX_RESULTS_PER_CHECK = 1000;

/** How severe a result is, least first. */
const SEVERITY_RANK: Record<Violation["severity"], number> = { info: 0, warning: 1, violation: 2 };

/** The most severe of two severities. */
export function moreSevere(
  a: Violation["severity"],
  b: Violation["severity"],
): Violation["severity"] {
  return SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

/**
 * The result that stands for those of a check past MAX_RESULTS_PER_CHECK,
 * as severe as the most severe of them: a subject with more warnings than
 * are shown still conforms.
 */
export function resultsNotShown(severity: Violation["severity"]): Violation {
  return {
    message: {
      en: `There are more results than Solid Memo shows: it lists the ${MAX_RESULTS_PER_CHECK} most severe of a check.`,
    },
    builtIn: true,
    severity,
    constraint: "ResultLimit",
  };
}

/** Whether a result is resultsNotShown's: it says how many more there are, not what is wrong. */
export function isResultLimit(result: Violation): boolean {
  return result.constraint === "ResultLimit" && result.builtIn === true;
}

/**
 * A check's results: MAX_RESULTS_PER_CHECK of them, the most severe
 * first kept (a violation is never left out for a warning), in the
 * order given; then resultsNotShown when there are more, as severe as
 * the most severe of those left out and of `dropped`, the severity of
 * results the check left out before they were made, if any. A
 * resultsNotShown already among them is folded into the one added, so
 * results limited twice say so once. How severe a result counts as is
 * `rank`'s, its own severity unless the caller will report it as less
 * severe (a violation on another app's value, which it shows as a
 * warning): such results cannot make the one added a violation.
 */
export function limitResults<T extends Violation>(
  results: readonly T[],
  dropped?: Violation["severity"],
  rank: (result: T) => Violation["severity"] = (result) => result.severity,
): Violation[] {
  let severity = dropped;
  const plain: T[] = [];
  for (const result of results) {
    if (isResultLimit(result))
      severity = severity === undefined ? result.severity : moreSevere(severity, result.severity);
    else plain.push(result);
  }
  if (plain.length <= MAX_RESULTS_PER_CHECK && severity === undefined) return plain;
  const ranks = plain.map((result) => SEVERITY_RANK[rank(result)]);
  // The indices of those kept: the most severe first, in the order given among the equally severe.
  const order = plain.map((_, index) => index).sort((a, b) => ranks[b] - ranks[a] || a - b);
  const kept = new Set(order.slice(0, MAX_RESULTS_PER_CHECK));
  let left = severity ?? "info";
  for (const index of order.slice(MAX_RESULTS_PER_CHECK)) {
    left = moreSevere(left, rank(plain[index]));
  }
  const limited: Violation[] = plain.filter((_, index) => kept.has(index));
  limited.push(resultsNotShown(left));
  return limited;
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
  /** Not a Solid Memo subject, but one the DCAT-AP profile checks (a license, say). */
  | {
      url: string;
      status: "profiled";
      violations: Violation[];
      /** Another app's subject (a dcat:Dataset it listed, say), whose results are all warnings. */
      foreign?: true;
    };

export type DocumentReport =
  | {
      url: string;
      /** "missing" is a document the instance has not created yet: not a problem. */
      status: "missing" | "checked";
      subjects: SubjectReport[];
    }
  /**
   * A document the check could not read (refused, or not data it can
   * read): what it holds is not known, so it counts as a violation
   * (summarize), and the decks naming it are set aside.
   */
  | {
      url: string;
      status: "unreadable";
      subjects: SubjectReport[];
      /** Why it could not be read, as the read said. */
      reason: string;
    };

/** The report on a document the check could not read, for `reason`. */
export function unreadableDocument(url: string, reason: string): DocumentReport {
  return { url, status: "unreadable", subjects: [], reason };
}

/**
 * A deck whose documents do not say they are its own, outside the
 * instance's own folder (docs/data-model.md, "Where an instance's
 * documents are"): read and studied from, never written to or deleted,
 * until the user claims them. They are not checked until then.
 */
export interface UnclaimedDeck {
  deckUrl: string;
  title: LangText;
  /** The documents that do not say so, as the catalog names them. */
  documents: string[];
  /**
   * Those of them outside the instance's folder and not in a storage of
   * the user's found to hold the instance too: never claimed, so the
   * deck's documents are not claimed while there is any
   * (InstanceCheckUseCases.claimDeckDocuments).
   */
  outsidePod: string[];
}

/**
 * Another spelling of the address of a document in a report, as a deck
 * names it (`url`), and the address it is reported under (`of`): the
 * document is checked and reported once, however many spellings name it.
 */
export interface DocumentSpelling {
  url: string;
  of: string;
}

export interface ValidationReport {
  instanceUrl: string;
  documents: DocumentReport[];
  /**
   * The other spellings decks name of the documents' addresses, when
   * there are any: each has the report of the document it spells, and is
   * held back with it, but is not a document of its own.
   */
  spellings?: DocumentSpelling[];
  /** The decks whose documents are unclaimed, when there are any; not a violation: they block nothing. */
  unclaimed?: UnclaimedDeck[];
  /** Results of severity "violation" across every document, and each document the check could not read. */
  violationCount: number;
  conforms: boolean;
}

/** How many results of severity "violation" each list of subjects holds, counted once per list (violationsIn). */
const VIOLATIONS = new WeakMap<readonly SubjectReport[], number>();

/**
 * How many results of severity "violation" the subjects hold, counted
 * once per list: a document's report is shared by every report made of
 * it (a deck's, the instance's with a deck's in place, withDeckReport),
 * so summing those again passes over its subjects only the first time.
 * Reports are never changed once made.
 */
function violationsIn(subjects: readonly SubjectReport[]): number {
  let count = VIOLATIONS.get(subjects);
  if (count === undefined) {
    count = 0;
    for (const subject of subjects) {
      if (subject.status !== "checked" && subject.status !== "profiled") continue;
      for (const violation of subject.violations) if (violation.severity === "violation") count++;
    }
    VIOLATIONS.set(subjects, count);
  }
  return count;
}

/** The report on these documents, and on the other spellings of their addresses (`spellings`), counting each document once. */
export function summarize(
  instanceUrl: string,
  documents: DocumentReport[],
  spellings: readonly DocumentSpelling[] = [],
): ValidationReport {
  let violationCount = 0;
  for (const document of documents)
    violationCount += violationsIn(document.subjects) + (document.status === "unreadable" ? 1 : 0);
  return {
    instanceUrl,
    documents,
    ...(spellings.length === 0 ? {} : { spellings: [...spellings] }),
    violationCount,
    conforms: violationCount === 0,
  };
}

/** The report, naming the decks whose documents are unclaimed when there are any (`unclaimed`), else none. */
export function withUnclaimed(
  report: ValidationReport,
  unclaimed: readonly UnclaimedDeck[],
): ValidationReport {
  const { unclaimed: _, ...rest } = report;
  return unclaimed.length === 0 ? rest : { ...rest, unclaimed: [...unclaimed] };
}

function failing(subject: SubjectReport): boolean {
  return (
    (subject.status === "checked" || subject.status === "profiled") &&
    subject.violations.some((violation) => violation.severity === "violation")
  );
}

/**
 * The deck entries and documents with a violation, by URL, a document
 * the check could not read among them, and whether one of them is the
 * arrangement of the deck list (the catalog's own document unread too).
 * An entry or the arrangement counts only from the catalog's document,
 * where the deck list reads them: a subject that another document states
 * of the same IRI counts only through that document.
 */
interface Failing {
  entries: ReadonlySet<string>;
  documents: ReadonlySet<string>;
  arrangement: boolean;
}

/** An address as a request sends it, as instanceLayout's canonicalUrlOf gives it; null for text that is none. */
function hrefOf(text: string): string | null {
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

/** Each report's failing subjects and documents; assumes a report is never changed in place, since reports are rebuilt immutably. */
const failingOfReport = new WeakMap<ValidationReport, Failing>();

/** What fails in the report, so that asking about each of many decks, on each render, does not walk the whole report again. */
function failingOf(report: ValidationReport): Failing {
  let found = failingOfReport.get(report);
  if (found === undefined) {
    const { documents } = report;
    // The catalog's document, as instanceLayout's catalogUrlOf names it, not imported:
    // Node's scripts run this module, and load only what is named with its extension.
    const catalog = hrefOf(`${report.instanceUrl.replace(/\/?$/, "/")}catalog.ttl`);
    const isCatalog = (url: string) => catalog !== null && hrefOf(url) === catalog;
    const subjects = documents.flatMap((document) => {
      const inCatalog = isCatalog(document.url);
      return document.subjects
        .filter(failing)
        .map((subject) => ({ document: document.url, inCatalog, subject }));
    });
    const unread = documents
      .filter((document) => document.status === "unreadable")
      .map((document) => document.url);
    const ofCatalog = subjects.filter(({ inCatalog }) => inCatalog);
    const failingDocuments = new Set([...subjects.map(({ document }) => document), ...unread]);
    // Another spelling a deck names of a failing document's address fails with it.
    for (const { url, of } of report.spellings ?? []) {
      if (failingDocuments.has(of)) failingDocuments.add(url);
    }
    found = {
      entries: new Set(ofCatalog.map(({ subject }) => subject.url)),
      documents: failingDocuments,
      arrangement:
        unread.some(isCatalog) ||
        ofCatalog.some(
          ({ subject }) =>
            subject.status === "checked" &&
            (subject.shape === "catalog" || subject.shape === "deckGroup"),
        ),
    };
    failingOfReport.set(report, found);
  }
  return found;
}

/**
 * Whether the deck has invalid data — its catalog entry, or anything in
 * its cards or reviews document, or one of them the check could not
 * read — which the "set invalid data aside"
 * policy leaves out until it is repaired. The report is walked once,
 * however many decks are asked about.
 */
export function deckSetAside(report: ValidationReport, deck: Deck): boolean {
  const { entries, documents } = failingOf(report);
  return (
    entries.has(deck.url) ||
    documents.has(deck.cardsDocumentUrl) ||
    documents.has(deck.reviewsDocumentUrl)
  );
}

/**
 * Whether the arrangement of the deck list — the catalog itself or one
 * of its deck groups — has invalid data, which the "set invalid data
 * aside" policy leaves read-only until it is repaired.
 */
export function arrangementSetAside(report: ValidationReport): boolean {
  return failingOf(report).arrangement;
}

/**
 * Why nothing may be written to a target while the data check holds it
 * back (docs/validation.md, The invalid data policy): "checking" until
 * the check is in (a policy that sets data aside may yet set it aside),
 * "unchecked" while it could not be made, "blocked" under "block the
 * instance" with invalid data, "setAside" for data set aside.
 */
export type HoldReason = "checking" | "unchecked" | "blocked" | "setAside";

/** The check of an instance as far as it has come, and the policy it is held to. */
export interface CheckState {
  readonly policy: InvalidDataPolicy;
  /** "pending" until the check is in, "failed" while it could not be made; else its report. */
  readonly status: "pending" | "failed" | ValidationReport;
}

/**
 * What a write is to: the instance's own documents alone (a draft's,
 * say), which nothing sets aside one by one; the catalog, which its
 * arrangement holds (the instance's name and catalog, an import, the
 * drafts, publishing a release, starting a next version); a list of
 * decks, held when any of them is set aside; or one deck.
 */
export type HoldTarget =
  | { readonly kind: "instance" }
  | { readonly kind: "catalogue" }
  | { readonly kind: "decks"; readonly decks: readonly Deck[] }
  | { readonly kind: "deck"; readonly deck: Deck };

/**
 * Why the check holds back a write to `target`, or null when it may be
 * made. Under "only warn" nothing waits. What another app wrote only
 * warns, and sets nothing aside (the report marks it `foreign`).
 */
export function holdOf(state: CheckState, target: HoldTarget): HoldReason | null {
  if (state.policy === "warn-only") return null;
  if (state.status === "failed") return "unchecked";
  if (state.status === "pending") return "checking";
  const report = state.status;
  if (report.conforms) return null;
  if (state.policy === "block-instance") return "blocked";
  const setAside =
    target.kind === "catalogue"
      ? arrangementSetAside(report)
      : target.kind === "decks"
        ? target.decks.some((deck) => deckSetAside(report, deck))
        : target.kind === "deck" && deckSetAside(report, target.deck);
  return setAside ? "setAside" : null;
}
