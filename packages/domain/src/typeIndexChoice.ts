// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** The kind of type index a profile links: private (solid:privateTypeIndex) or public (solid:publicTypeIndex). */
export type TypeIndexKind = "private" | "public";

/**
 * A type index of the user's an instance may be registered in
 * (docs/data-model.md "Choosing a type index"): one their profile links,
 * in their own places, that they can read.
 */
export interface TypeIndexChoice {
  url: string;
  /** What the profile links it as: both kinds when one document is linked as both. */
  kinds: TypeIndexKind[];
  /** Whether the preferences file links it, as the specification says a private index is. */
  fromPreferences: boolean;
  /**
   * What the document says it is, by the kind it is linked as:
   * `match` when it is typed as that kind (solid:UnlistedDocument for a
   * private one, solid:ListedDocument for a public one), `other` when it
   * is typed as the other kind alone, `none` when it says neither, or it
   * is linked as both.
   */
  typeFit: "match" | "other" | "none";
  /** Whether it already holds a registration of a Solid Memo instance. */
  holdsInstances: boolean;
  /** Whether anyone may read it without logging in; null when that could not be told. */
  readableByAnyone: boolean | null;
}

/**
 * Whether a public index cannot be read by anyone but the user: other
 * apps, and other people, won't find what it registers.
 */
export function isHiddenPublicIndex(choice: TypeIndexChoice): boolean {
  return choice.kinds.includes("public") && choice.readableByAnyone === false;
}

/** Whether a private index can be read by anyone: everything it registers can be seen by anyone. */
export function isExposedPrivateIndex(choice: TypeIndexChoice): boolean {
  return choice.kinds.includes("private") && choice.readableByAnyone === true;
}

/**
 * The indexes of `kind`, best first: one whose type is the other kind's
 * comes last, then one linked as both kinds, then a public one no one
 * else can read; of the rest, one that already holds Solid Memo's
 * instances, then one the preferences file links, then one typed as its
 * kind before one that says neither, and otherwise by address, never by
 * the order of a profile's triples.
 */
export function rankedFor(
  choices: readonly TypeIndexChoice[],
  kind: TypeIndexKind,
): TypeIndexChoice[] {
  const key = (choice: TypeIndexChoice): number[] => [
    choice.typeFit === "other" ? 1 : 0,
    choice.kinds.length > 1 ? 1 : 0,
    kind === "public" && isHiddenPublicIndex(choice) ? 1 : 0,
    choice.holdsInstances ? 0 : 1,
    choice.fromPreferences ? 0 : 1,
    choice.typeFit === "match" ? 0 : 1,
  ];
  return choices
    .filter((choice) => choice.kinds.includes(kind))
    .map((choice) => ({ choice, key: key(choice) }))
    .sort((a, b) => compareKeys(a.key, b.key) || compareUrls(a.choice.url, b.choice.url))
    .map(({ choice }) => choice);
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function compareUrls(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Every choice once, the private ones best first (rankedFor), one linked
 * as both kinds among them, then the public ones best first.
 */
export function rankedChoices(choices: readonly TypeIndexChoice[]): TypeIndexChoice[] {
  const privateOnes = rankedFor(choices, "private");
  return [
    ...privateOnes,
    ...rankedFor(choices, "public").filter((choice) => !privateOnes.includes(choice)),
  ];
}
