// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What the journeys check every screen for (docs/accessibility.md): axe's
 * rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA, in the light and
 * the dark theme of the standard palette, and its contrast rules in both
 * themes of every other palette. A violation fails the journey, unless
 * it is one of the known exceptions below. Then, at the largest text
 * size, that the screen reflows at 320px.
 */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** axe's rules that a palette's colors alone can break: the others hold or fail in every palette alike. */
export const CONTRAST_RULES = ["color-contrast", "link-in-text-block"];

/**
 * The palettes (docs/theme.md, Palettes), as the root's data-palette
 * names them; Standard is no attribute at all. The domain's palette.ts
 * has the same, which accessibility.test.ts holds palettes.css to.
 */
export const PALETTES = ["standard", "high-contrast", "color-vision", "parchment"] as const;
export type Palette = (typeof PALETTES)[number];

/** The themes (docs/theme.md), as the root's data-theme names them. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** A palette in a theme that a screen is checked in, with axe's every rule or its contrast rules alone. */
export interface Scheme {
  palette: Palette;
  theme: Theme;
  /** All of WCAG_TAGS (Standard), or CONTRAST_RULES alone, and then in Chromium only. */
  full: boolean;
}

/** Every palette in both themes, Standard's first. */
export const SCHEMES: readonly Scheme[] = PALETTES.flatMap((palette) =>
  THEMES.map((theme) => ({ palette, theme, full: palette === "standard" })),
);

/** The width the reflow check narrows the page to, and the text size it shows it at (WCAG 1.4.10). */
export const REFLOW = { width: 320, textSize: "largest" } as const;

/**
 * A box that keeps its text on one line and hides what does not fit, as
 * the page has it at the largest text size, read by the reflow check:
 * where it is, its widths and its title.
 */
export interface OneLineBox {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  title: string;
}

/**
 * The boxes whose text is cut short with no title to read it whole in:
 * a box that is cut short on purpose (the Studio's session line) has
 * the whole line as its title, and one a pixel wide or less is text for
 * screen readers alone (.visually-hidden), not to be seen.
 */
export function clippedBoxes(boxes: readonly OneLineBox[]): string[] {
  return boxes
    .filter(
      (box) =>
        box.clientWidth > 1 && box.scrollWidth > box.clientWidth + 1 && box.title.trim() === "",
    )
    .map((box) => box.selector);
}

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
