// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useI18n } from "../i18n";

/** The note's points, in order. */
const POINTS = ["flagship", "learn", "privacy", "free", "openSource"] as const;

/**
 * Why Solid Memo was made, in its maker's own words and signed with the
 * maker's name: the short form for the landing, with a link to the full
 * note on the About page, which is in English only, as the link says
 * with `hreflang` and every other language's label in words. It is the
 * maker's own statement, so a site with a name of its own does not show
 * it (docs/onboarding.md).
 */
export function MakerNote() {
  const { t } = useI18n();
  return (
    <figure class="maker-note">
      <blockquote>
        <ul>
          {POINTS.map((point) => (
            <li key={point}>
              <strong>{t(`makerNote.${point}.title`)}</strong> {t(`makerNote.${point}.text`)}
            </li>
          ))}
        </ul>
      </blockquote>
      <figcaption>
        <span>— Anton Wiklund</span>
        <a href="about/#why" hreflang="en">
          {t("makerNote.readMore")}
        </a>
      </figcaption>
    </figure>
  );
}
