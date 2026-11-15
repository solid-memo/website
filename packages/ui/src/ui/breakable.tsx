// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Fragment } from "preact";

/** The most line-break opportunities one text gets (breakable). */
export const MAX_BREAKS = 64;

/** A slash with a character other than a slash or white space on each side. */
const BREAK_AFTER = /[^\s/]\/(?=[^\s/])/g;

/**
 * Card text as rendered, with a line-break opportunity (`<wbr>`) after
 * a slash: browsers do not break after a slash, so a long name like
 * "Fastighetstekniker/Drifttekniker, fastighet" would otherwise wrap in
 * the middle of a word. The text itself, and what it reads as, is
 * unchanged.
 *
 * Only a slash between two other characters, neither white space nor a
 * slash, gets one, and only the first MAX_BREAKS such slashes: the rest
 * of the text stays one string. Each break is two nodes, so a text costs
 * the page a bounded number of nodes however many slashes it holds.
 */
export function breakable(text: string) {
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(BREAK_AFTER)) {
    const end = match.index + 2;
    parts.push(text.slice(start, end));
    start = end;
    if (parts.length === MAX_BREAKS) break;
  }
  if (parts.length === 0) return text;
  return [
    ...parts.map((part, i) => (
      <Fragment key={i}>
        {part}
        <wbr />
      </Fragment>
    )),
    text.slice(start),
  ];
}
