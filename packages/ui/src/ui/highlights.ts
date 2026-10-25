// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MessageKey } from "./i18n";

/**
 * A highlight of a release, for its users: a sentence of what it brings
 * them, in every app language (docs/releasing.md#highlights-for-users).
 */
export interface Highlight {
  /** Kebab-case, kept by the browsers that have shown it: never reused or renamed. */
  id: string;
  /** whatsNew.highlight.<the id in camelCase>. */
  text: MessageKey;
}

/** Every highlight, newest first. A patch or an internal release adds none. */
export const HIGHLIGHTS: readonly Highlight[] = [];
