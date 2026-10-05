import type { ShapeName } from "@solid-memo/vocab/types.generated";
import type { SubjectReport, ValidationReport, Violation } from "./validation";
import { shown } from "./langText";

/**
 * Repairing what an instance check found (see docs/validation.md). A
 * problem with one safe answer is repaired by the app; any other is the
 * user's to decide, and the choice offered is removing the subject.
 */

const DCTERMS = "http://purl.org/dc/terms/";
const SM = "https://pod.solid-memo.com/vocab/v1#";
const FOAF = "http://xmlns.com/foaf/0.1/";

export type RepairKind =
  /** Give a deck without a description the default one. */
  | "describe-deck"
  /** Study a deck without a (known) direction front to back, as format 1 did. */
  | "direct-deck"
  /** Drop a review state's half-written undo snapshot. */
  | "drop-snapshot"
  /** Recompute a malformed due day from the last review and the interval. */
  | "recompute-due"
  /** Name an agent without a name after its IRI. */
  | "name-agent"
  /** Remove the subject: the user's choice, for what cannot be repaired. */
  | "remove-subject";

export interface Repair {
  kind: RepairKind;
  documentUrl: string;
  subjectUrl: string;
  /** The stored format of the subject, which the repair writes in. */
  version: number;
}

/** A subject with problems no repair covers, and what they are: one violation per message. */
export interface Unrepairable {
  documentUrl: string;
  subjectUrl: string;
  violations: Violation[];
}

export interface RepairPlan {
  repairs: Repair[];
  unrepairable: Unrepairable[];
}

/** The repair that answers one violation of a subject of a shape; null when none does. */
function repairFor(shape: ShapeName | null, violation: Violation): RepairKind | null {
  const { path, constraint } = violation;
  if (shape === "deck" && path === `${DCTERMS}description` && constraint === "MinCount") return "describe-deck";
  if (
    shape === "deck" &&
    (path === `${SM}studyDirection` || path === `${SM}direction`) &&
    (constraint === "MinCount" || constraint === "In")
  ) {
    return "direct-deck";
  }
  if (shape === "reviewState" && constraint === "Xone") return "drop-snapshot";
  if (shape === "reviewState" && path === `${SM}due` && constraint === "Pattern") return "recompute-due";
  if (path === `${FOAF}name` && constraint === "MinCount") return "name-agent";
  return null;
}

function problemsOf(subject: SubjectReport): { shape: ShapeName | null; version: number; violations: Violation[] } | null {
  if (subject.status === "checked") {
    return { shape: subject.shape, version: subject.version, violations: subject.violations };
  }
  if (subject.status === "profiled") return { shape: null, version: 1, violations: subject.violations };
  return null;
}

/**
 * What the app can repair of what a check found — one repair per kind
 * and subject — and the subjects left with a problem no repair covers.
 * Warnings are no problem.
 */
export function planRepair(report: ValidationReport): RepairPlan {
  const repairs: Repair[] = [];
  const unrepairable: Unrepairable[] = [];
  for (const document of report.documents) {
    for (const subject of document.subjects) {
      const problems = problemsOf(subject);
      if (problems === null) continue;
      const left = new Map<string, Violation>();
      for (const violation of problems.violations.filter((v) => v.severity === "violation")) {
        const kind = repairFor(problems.shape, violation);
        if (kind === null) {
          const key = shown(violation.message);
          if (!left.has(key)) left.set(key, violation);
          continue;
        }
        if (!repairs.some((r) => r.kind === kind && r.subjectUrl === subject.url)) {
          repairs.push({ kind, documentUrl: document.url, subjectUrl: subject.url, version: problems.version });
        }
      }
      if (left.size > 0) {
        unrepairable.push({ documentUrl: document.url, subjectUrl: subject.url, violations: [...left.values()] });
      }
    }
  }
  return { repairs, unrepairable };
}

/** What a repair does, for the user: "Give the deck a description". */
export function describeRepair(repair: Repair): string {
  switch (repair.kind) {
    case "describe-deck":
      return "Give the deck the default description";
    case "direct-deck":
      return "Study the deck front to back";
    case "drop-snapshot":
      return "Drop the review's half-written undo snapshot";
    case "recompute-due":
      return "Recompute the review's due day";
    case "name-agent":
      return "Name the person or organisation after their address";
    case "remove-subject":
      return "Remove it";
  }
}
