// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { liveLink } from "@solid-memo/markdown/links";
import { visibleControls } from "@solid-memo/markdown/parse";
import { WebLink } from "./Markdown";

/** A URL in running text, minus any punctuation that closes the sentence. */
const URL_IN_TEXT = /(https?:\/\/[^\s]*[^\s.,;:!?)])/;

/**
 * The text with its web addresses as links, so a source can be visited.
 * The text comes from deck data, so an address is followed by the rule
 * Markdown links follow (liveLink: `https:` only, no `user@`) and is
 * otherwise left as text; it shows its hidden characters (visibleControls),
 * and the host it leads to when it does not name that host itself
 * (WebLink).
 */
export function linkify(text: string) {
  return text.split(URL_IN_TEXT).map((part, i) => {
    const link = i % 2 === 1 ? liveLink(part) : null;
    if (link === null) return part;
    const shown = visibleControls(part);
    return (
      <WebLink key={i} link={link} written={part} shown={shown}>
        {shown}
      </WebLink>
    );
  });
}
