// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MarkdownCheck } from "@solid-memo/domain/release/markdownFields";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { releaseMarkdownCheck } from "@solid-memo/ui/markdownCache";

/** The draft whose Markdown check is kept, and that check. */
let kept: { url: string; check: MarkdownCheck } | undefined;

/**
 * The Markdown check every check of the draft shares, its publishing
 * among them, which remembers the texts it checked within its caches'
 * bound (releaseMarkdownCheck). Only the last
 * draft's is kept: another draft's starts anew, so one draft's texts
 * neither stay in memory nor slow the next one's check.
 */
export function markdownCheckOf(url: string): MarkdownCheck {
  if (kept?.url !== url) kept = { url, check: releaseMarkdownCheck() };
  return kept.check;
}

const revisions = new WeakMap<ReleaseDraft, number>();
let latest = 0;

/** A number for each version of a draft: the editor makes a new draft for each change. */
export function revisionOf(draft: ReleaseDraft): number {
  let revision = revisions.get(draft);
  if (revision === undefined) {
    revision = ++latest;
    revisions.set(draft, revision);
  }
  return revision;
}
