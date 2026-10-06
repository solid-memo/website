import { join } from "node:path";

/**
 * This package's folder, ending in a slash: where vendor/ and fixtures/
 * are, for the node tooling of any package (the generator, the build's
 * validators, the site's publishing) wherever it runs from.
 */
export const VOCAB_ROOT = join(import.meta.dirname, "../");

/** The repository's ns/ folder, ending in a slash: the vocabulary (vocab/) and the shapes (shapes/), as the site publishes them. */
export const NS_ROOT = join(VOCAB_ROOT, "../../ns/");

/** The repository's decks/ folder, ending in a slash: the deck library, as the site publishes it. */
export const DECKS_ROOT = join(VOCAB_ROOT, "../../decks/");
