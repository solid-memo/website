// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Language tags (BCP 47) as the app stores them with text: lower case,
 * as the pod reads them and as sh:uniqueLang compares them, and naming a
 * language only — no extensions (-u-, -t-) and no private use (x-), which
 * say how to format or where text came from, not what language it is in.
 */

/** The tag of text in no language: codes, numbers, symbols ("404", "Fe"). */
export const NO_LANGUAGE = "zxx";

/** An extension (-u-, -t-, …) or private use (-x-) subtag: one letter or digit between hyphens. */
const SINGLETON = /(^|-)[0-9a-z](-|$)/;

/**
 * A language tag as entered ("PT-br", "iw"), as the app stores it
 * ("pt-br", "he"); null when it names no language: not a
 * well-formed tag, "und" (undetermined), a language of more than three
 * letters (no such one is registered: "Swedish" is a name, not a code),
 * or one with an extension or private use. "zxx", no language, is a tag the app stores.
 */
export function canonicalTag(input: string): string | null {
  let canonical: string;
  try {
    // One tag in, one locale out: Intl throws on an empty or ill-formed one.
    canonical = Intl.getCanonicalLocales(input.trim())[0]!;
  } catch {
    return null;
  }
  const tag = canonical.toLowerCase();
  const language = tag.split("-")[0]!;
  if (language.length > 3 || language === "und" || SINGLETON.test(tag)) return null;
  return tag;
}
