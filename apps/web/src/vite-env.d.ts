/// <reference types="vite/client" />

/** The commit the site was built from (vite.config.ts); null when unknown. */
declare const __COMMIT_SHA__: string | null;

/** A hash of the shapes documents are checked by (vite.config.ts). */
declare const __SHAPES_RULESET__: string;

interface ImportMetaEnv {
  /** The deck library's index, passed to createAppUseCases; the site's own, decks/index.ttl, when unset (docs/deck-library.md). */
  readonly VITE_LIBRARY_INDEX_URL?: string;
}
