import { readFile } from "node:fs/promises";
import { Agent, get } from "node:https";
import { RDF_TYPE, parseTurtle, type TurtleFile } from "@solid-memo/turtle/rdf";
import { SHAPES_POD, VOCAB_POD } from "../src/pods.ts";
import { VOCAB_ROOT } from "./root.ts";

/**
 * The vocabulary and the shapes as the node tooling reads them: from
 * their pods (src/pods.ts), each document once per process, without a
 * login (they are public), over node's own https: the same whether a
 * test runs in node or in a browser-like environment, whose fetch keeps
 * to CORS, and whether or not it stubs the global fetch. The vendored
 * profiles are still this package's vendor/ folder, published with the
 * site at SITE_VENDOR.
 */

export { SHAPES_POD, VOCAB_POD };

/** Where the site publishes this package's vendor/ folder. */
export const SITE_VENDOR = "https://solid-memo.com/vendor/";

const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";
const LDP_CONTAINER = "http://www.w3.org/ns/ldp#Container";

/** Each document's text, read once per process: the pods change between runs, not during one. */
const read = new Map<string, Promise<string>>();

/**
 * One connection pool for every read: a few sockets kept open, and time
 * enough for each address family to connect, rather than node's quarter
 * of a second, which a busy test run on a network without IPv6 misses.
 */
const agent = new Agent({ keepAlive: true, maxSockets: 6, autoSelectFamilyAttemptTimeout: 2_000 });

/** How many times a read that could not reach the pod is tried again. */
const RETRIES = 2;

/**
 * A document as Turtle, by a plain https GET; throws unless the server
 * answers 200. A connection that fails is tried again: an answer is not.
 */
async function getTurtle(url: string, retries = RETRIES): Promise<string> {
  try {
    return await getOnce(url);
  } catch (error) {
    if (retries === 0 || error instanceof NotRead) throw error;
    return getTurtle(url, retries - 1);
  }
}

/** The server answered, with another status than 200. */
class NotRead extends Error {}

function getOnce(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, { agent, headers: { Accept: "text/turtle" } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        response.statusCode === 200
          ? resolve(Buffer.concat(chunks).toString("utf8"))
          : reject(new NotRead(`${url} cannot be read: ${response.statusCode}.`)),
      );
    }).on("error", reject);
  });
}

/** A document of either pod, as Turtle, by `fetch` if one is given; throws when it cannot be read. */
export function readPodTurtle(url: string, fetch?: typeof globalThis.fetch): Promise<string> {
  let text = read.get(url);
  if (text === undefined) {
    text =
      fetch === undefined
        ? getTurtle(url)
        : fetch(url, { headers: { Accept: "text/turtle" } }).then(async (response) => {
            if (!response.ok) throw new Error(`${url} cannot be read: ${response.status}.`);
            return response.text();
          });
    text.catch(() => read.delete(url));
    read.set(url, text);
  }
  return text;
}

/** What a container lists: each member's address, and whether it is a container itself. */
async function membersOf(url: string, fetch?: typeof globalThis.fetch): Promise<{ url: string; container: boolean }[]> {
  const quads = parseTurtle(await readPodTurtle(url, fetch), url);
  const containers = new Set(
    quads.filter((q) => q.predicate.value === RDF_TYPE && q.object.value === LDP_CONTAINER).map((q) => q.subject.value),
  );
  return quads
    .filter((q) => q.subject.value === url && q.predicate.value === LDP_CONTAINS)
    .map((q) => ({ url: q.object.value, container: containers.has(q.object.value) || q.object.value.endsWith("/") }));
}

/** A shape document's place on the shapes pod: <class>/v<N>. */
const SHAPE_PATH = /^[a-z][a-z0-9-]*\/v[1-9][0-9]*$/;

/**
 * Every shape document on the shapes pod, its path relative to it
 * (`card/v1`), sorted: each folder the pod lists, and each document in
 * it whose name is a version. The pod's own folders (its profile) are
 * not shapes and are not read.
 */
export async function readShapeTree(fetch?: typeof globalThis.fetch): Promise<TurtleFile[]> {
  const folders = (await membersOf(SHAPES_POD, fetch)).filter((m) => m.container && m.url !== `${SHAPES_POD}profile/`);
  const listings = await Promise.all(folders.map((folder) => membersOf(folder.url, fetch)));
  const paths = listings
    .flat()
    .filter((member) => !member.container)
    .map((member) => member.url.slice(SHAPES_POD.length))
    .filter((path) => SHAPE_PATH.test(path))
    .sort();
  return Promise.all(paths.map(async (path) => ({ path, turtle: await readPodTurtle(`${SHAPES_POD}${path}`, fetch) })));
}

/**
 * A fetch for tests and tools that check documents the way the app
 * does: the pods' documents as `readPodTurtle` reads them (by `fetch`
 * if one is given), and the vendored profiles at SITE_VENDOR from this
 * package's vendor/ folder.
 */
export function createShapesFetch(fetch?: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = { "content-type": "text/turtle" };
    if (url.startsWith(SITE_VENDOR)) {
      return new Response(await readFile(`${VOCAB_ROOT}vendor/${url.slice(SITE_VENDOR.length)}`, "utf8"), { headers });
    }
    return Object.defineProperty(new Response(await readPodTurtle(url, fetch), { headers }), "url", { value: url });
  };
}

/** `createShapesFetch` reading the pods over https. */
export const shapesFetch = createShapesFetch();

/** What a shape validator is given to find the shapes, the reference data and the profiles. */
export const SHAPE_SOURCES = { shapesBaseUrl: SHAPES_POD, vocabBaseUrl: VOCAB_POD, vendorBaseUrl: SITE_VENDOR } as const;
