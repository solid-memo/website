// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UseCases } from "@solid-memo/application/useCases";
import { useDraftEditor } from "./draftEditor";
import { ListingPreviewScreen } from "./ListingPreviewScreen";

/** A draft's listing preview, over the draft as its editor keeps it (useDraftEditor). */
export function ListingPreviewContainer({
  useCases,
  draftUrl,
}: {
  useCases: UseCases;
  draftUrl: string;
}) {
  const editor = useDraftEditor(useCases, draftUrl);
  return <ListingPreviewScreen draft={editor.draft!} />;
}
