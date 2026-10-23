// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A heading's id on the docs' pages, as GitHub makes it for the same
 * heading, so a link written for one leads to the same place on the
 * other (`configuration.md#vite_repo_url`): the heading's text in lower
 * case, without what is neither a letter, a mark, a digit, `_`, `-` nor a
 * space, each space a `-`. `1. Fork or clone` is `1-fork-or-clone`.
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/**
 * The ids of one page's headings. GitHub numbers a second heading of
 * the same text (`-1`); the docs never repeat one, as a link to either
 * would then depend on the order, so a repeated id is refused.
 */
export class Slugger {
  private readonly taken = new Set<string>();

  /** The id of a heading, or null when the page already has it. */
  take(text: string): string | null {
    const id = slug(text);
    if (this.taken.has(id)) return null;
    this.taken.add(id);
    return id;
  }
}

/**
 * The ids of a file's headings as GitHub gives them, in order: a heading
 * whose id is taken gets the first free `-1`, `-2` and so on (two
 * `Features` headings are `features` and `features-1`). For Markdown
 * outside the docs, whose links GitHub resolves; the docs' own pages
 * never repeat one (Slugger).
 */
export function numberedIds(texts: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return texts.map((text) => {
    const base = slug(text);
    let id = base;
    while (counts.has(id)) {
      const count = counts.get(base)! + 1;
      counts.set(base, count);
      id = `${base}-${count}`;
    }
    counts.set(id, 0);
    return id;
  });
}
