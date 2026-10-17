// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What the journeys check every screen for (docs/testing.md#user-journeys): axe's
 * rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA, in the light and
 * the dark theme. A violation fails the journey, unless it is one of the
 * known exceptions below.
 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The themes each screen is checked in (docs/theme.md). */
export const SCHEMES = ["light", "dark"] as const;
export type Scheme = (typeof SCHEMES)[number];

/**
 * A violation the journeys let pass: an axe rule, on the elements whose
 * CSS selector (as axe names them) matches `target`, or on all of them,
 * and why it is not fixed.
 */
export interface KnownException {
  rule: string;
  target?: RegExp;
  reason: string;
}

/**
 * Every violation the journeys let pass, in one place. Each has its
 * reason; one that no longer fires is removed.
 */
export const KNOWN_EXCEPTIONS: readonly KnownException[] = [];

/** What axe reports of a rule a screen breaks, as far as the journeys read it. */
export interface Violation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

/** The selector axe names an element by, its frames' and shadow roots' joined. */
const selectorOf = (target: unknown[]) => target.flat(Infinity).join(" ");

/**
 * The violations left once the known exceptions are taken out: a rule
 * whose every element is excepted is gone, and one with an element
 * excepted keeps the others.
 */
export function unexcused(
  violations: readonly Violation[],
  exceptions: readonly KnownException[] = KNOWN_EXCEPTIONS,
): Violation[] {
  return violations.flatMap((violation) => {
    const rules = exceptions.filter((exception) => exception.rule === violation.id);
    const nodes = violation.nodes.filter(
      (node) =>
        !rules.some(
          (exception) =>
            exception.target === undefined || exception.target.test(selectorOf(node.target)),
        ),
    );
    return nodes.length === 0 ? [] : [{ ...violation, nodes }];
  });
}

/**
 * The violations as a journey's failure lists them: one line an element,
 * with its rule, the rule's impact and where to read about it.
 */
export function violationLines(violations: readonly Violation[]): string[] {
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? "no impact given"}) on ${selectorOf(node.target)}: ${violation.help} ${violation.helpUrl}`,
    ),
  );
}
