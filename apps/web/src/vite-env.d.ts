// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/// <reference types="vite/client" />

/** The commit the site was built from (vite.config.ts); null when unknown. */
declare const __COMMIT_SHA__: string | null;

/** A hash of the shapes documents are checked by (vite.config.ts). */
declare const __SHAPES_RULESET__: string;

/** The address of the Client ID Document the build wrote on the domain in CNAME (vite.config.ts); null without one. */
declare const __CLIENT_ID__: string | null;

interface ImportMetaEnv {
  /** The deck library's index, read by src/config.ts; the site's own, decks/index.ttl, when unset (docs/deck-library.md). */
  readonly VITE_LIBRARY_INDEX_URL?: string;
  /** What the site calls itself, read by src/config.ts (docs/configuration.md). */
  readonly VITE_APP_NAME?: string;
  /** The repository the footer links to, read by src/config.ts (docs/configuration.md). */
  readonly VITE_REPO_URL?: string;
  /** The Pod providers suggested at login, as JSON, read by src/config.ts (docs/configuration.md). */
  readonly VITE_POD_PROVIDERS?: string;
}
