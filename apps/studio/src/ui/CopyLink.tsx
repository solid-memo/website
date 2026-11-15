// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";

/**
 * A link to share, a release's address by default: a button (its
 * `text`, "Copy the link" when none) that copies it to the clipboard,
 * and says whether it did. A browser that will not copy it
 * (no clipboard, or permission refused) says so: the address is beside
 * it, to select and copy by hand.
 */
export function CopyLink({ url, label, text }: { url: string; label: string; text?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <button type="button" aria-label={label} onClick={() => void copy()}>
        {text ?? t("studio.releases.copy")}
      </button>{" "}
      <span role="status" class="hint">
        {copied !== null && t(copied ? "studio.releases.copied" : "studio.releases.copyFailed")}
      </span>
    </>
  );
}
