// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { CheckPolicy, ReleaseCheck } from "@solid-memo/domain/release/releaseCheck";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { queries } from "./queries";

/**
 * The release check of a draft as the Studio's screens run it (docs/
 * studio.md, The release check): over the draft as its editor keeps it,
 * changes not yet written included, so a problem fixed clears at once.
 * Each version of the draft (each draft the editor makes) is checked
 * once, unless a part of it could not be read (previousUnread,
 * libraryUnread): such a check is checked again whenever it is shown
 * anew, or when asked (refetch). The Markdown of a text is read once by each rule, whatever
 * version it is in.
 */

/** The domain's rules of the draft for the policy, the shapes left out (queries.releaseCheck); no draft (null), no check. */
export function useReleaseCheck(
  useCases: UseCases,
  draft: ReleaseDraft | null,
  policy: CheckPolicy,
) {
  return useQuery(queries.releaseCheck(useCases, useQueryClient(), draft, policy));
}

/**
 * How many of a check's problems keep the draft from being published:
 * the errors of its rules, of what it drops and of its Markdown, as
 * publishing checks them (the library's own, and the shapes, aside).
 */
export function publishErrors(check: Pick<ReleaseCheck, "rules" | "drops" | "markdown">): number {
  return [...check.rules, ...check.drops, ...check.markdown].filter(
    (one) => one.severity === "error",
  ).length;
}

/** What the shapes say of the version of the draft they were asked of (`asked`); nothing until they are. */
export function useShapeCheck(useCases: UseCases, asked: ReleaseDraft | null, policy: CheckPolicy) {
  return useQuery(queries.releaseShapes(useCases, asked, policy));
}
