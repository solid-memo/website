// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useI18n } from "../i18n";

/**
 * Why Solid Memo was made, in its maker's own words and signed with the
 * maker's name: the same paragraph as on the About page and in the
 * README, in the reader's language. It is the maker's own statement, so
 * a site with a name of its own does not show it (docs/onboarding.md).
 */
export function MakerNote() {
  const { t } = useI18n();
  return (
    <figure class="maker-note">
      <blockquote>
        <p>{t("makerNote.text")}</p>
      </blockquote>
      <figcaption>— Anton Wiklund</figcaption>
    </figure>
  );
}
