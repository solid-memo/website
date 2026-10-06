import { readFile } from "node:fs/promises";
import { readTurtleTree, type TurtleFile } from "@solid-memo/turtle/rdf";
import { SHAPES_BASE, SITE, VOCAB_BASE } from "../src/ns.ts";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "./root.ts";

/**
 * The documents the site publishes from this repository, as the node
 * tooling reads them: from disk, at their own address. ns/ (the
 * vocabulary and the shapes) and decks/ (the deck library) are published
 * under the same path, this package's vendor/ folder (the vendored
 * profiles) at SITE_VENDOR. Nothing here needs the network.
 */

export { SHAPES_BASE, SITE, VOCAB_BASE };

/** Where the site publishes this package's vendor/ folder. */
export const SITE_VENDOR = `${SITE}vendor/`;

/** The folder each published path prefix is read from. */
const FOLDERS: readonly [prefix: string, dir: string][] = [
  [`${SITE}ns/`, NS_ROOT],
  [`${SITE}decks/`, DECKS_ROOT],
  [SITE_VENDOR, `${VOCAB_ROOT}vendor/`],
];

/** The file a document of the site is read from (its fragment left out), or undefined for one this repository does not publish. */
export function fileOf(url: string): string | undefined {
  const document = url.split("#")[0];
  for (const [prefix, dir] of FOLDERS) {
    if (document.startsWith(prefix)) return `${dir}${document.slice(prefix.length)}`;
  }
  return undefined;
}

/** A document of the site as Turtle, read from this repository; throws when it has none. */
export async function readSiteTurtle(url: string): Promise<string> {
  const file = fileOf(url);
  if (file === undefined) throw new Error(`${url} is not published from this repository.`);
  return readFile(file, "utf8");
}

/** Every shape document (ns/shapes/<class>/v<N>.ttl), its path relative to SHAPES_BASE (`card/v1.ttl`), sorted. */
export function readShapeTree(): Promise<TurtleFile[]> {
  return readTurtleTree(`${NS_ROOT}shapes`);
}

/**
 * A fetch for tests and tools that check documents the way the app
 * does: the site's documents read from this repository, at their own
 * address; 404 for any other, or one it does not have.
 */
export const shapesFetch: typeof globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const turtle = await readSiteTurtle(url).catch(() => undefined);
  const response =
    turtle === undefined
      ? new Response(`${url} is not published from this repository.`, { status: 404 })
      : new Response(turtle, { headers: { "content-type": "text/turtle" } });
  return Object.defineProperty(response, "url", { value: url });
};

/** What a shape validator is given to find the shapes, the reference data and the profiles. */
export const SHAPE_SOURCES = { shapesBaseUrl: SHAPES_BASE, vocabBaseUrl: VOCAB_BASE, vendorBaseUrl: SITE_VENDOR } as const;
