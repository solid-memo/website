// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Catalogs } from "@solid-memo/ui/i18n";
import en from "../i18n/en.json";

// The Studio's keys are messages `t` takes wherever the Studio's code is.
declare module "@solid-memo/ui/i18n" {
  interface EnglishCatalogs {
    studio: typeof en;
  }
}

/**
 * The Studio's own text, under `studio.*`, which comes with its chunk
 * and is added to `ui`'s when it is fetched (addCatalogs, from
 * apps/web/src/App.tsx), so a learner who never opens the Studio never
 * downloads it (docs/studio.md). The few messages the page says before
 * then (the Studio's name, that it is opening) are `ui`'s.
 */
export const STUDIO_CATALOGS: Catalogs = {
  en,
  others: {
    sv: () => import("../i18n/sv.json"),
    ko: () => import("../i18n/ko.json"),
    de: () => import("../i18n/de.json"),
    es: () => import("../i18n/es.json"),
    fr: () => import("../i18n/fr.json"),
  },
};
