// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import { ReleaseDiffScreen, type ReleaseDiffLinks } from "./ReleaseDiffScreen";
import { queries } from "./queries";

/**
 * A draft against the release it follows, over the draft as its editor
 * keeps it (useDraftEditor): each version of the draft compared once,
 * the last one's diff shown while a newer one is made.
 */
export function ReleaseDiffContainer({
  useCases,
  draftUrl,
  links,
}: {
  useCases: UseCases;
  draftUrl: string;
  links: ReleaseDiffLinks;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  const draft = editor.draft!;
  const diff = useQuery({
    ...queries.releaseDiff(useCases, draft),
    placeholderData: keepPreviousData,
  });
  return <ReleaseDiffScreen draft={draft} diff={diff.data} error={diff.error} links={links} />;
}
