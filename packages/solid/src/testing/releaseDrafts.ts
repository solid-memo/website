import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toRdfJsDataset } from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { releaseToDraft } from "@solid-memo/domain/release/releaseToDraft";
import { getSolidDatasetLinear } from "../linearDataset";
import { createLocalPod } from "../localPod";
import { createMemoryResourceStore } from "../memoryResourceStore";
import { createShaclShapeValidator } from "../shaclShapeValidator";
import { createSolidReleaseDraftRepository } from "../solidReleaseDraftRepository";

/**
 * A pod for the tests of release drafts: an instance with its catalogue
 * in a pod kept in memory, the deck library's releases read from the
 * repository's decks/, and, when asked, every write checked against the
 * shapes as the app checks it.
 */
export const POD = "https://alice.example/";
export const INSTANCE = `${POD}solid-memo/main/`;
export const DECKS = "https://solid-memo.com/decks/";
const DCAT_CATALOG = "http://www.w3.org/ns/dcat#Catalog";

/** The site's fetch: every address under decks/ answered with its file, the shapes as the site publishes them. */
export const siteFetch: typeof globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith(DECKS)) return shapesFetch(url);
  return turtleFetch(readFileSync(join(DECKS_ROOT, url.slice(DECKS.length)), "utf8"))(url, init);
};

export async function draftPod({ checked = false }: { checked?: boolean } = {}) {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({ root: POD, store, newEtag: () => `"e${++etags}"` });
  const requests: { method: string; url: string; ifMatch: string | null; ifNoneMatch: string | null }[] = [];
  /** Answers to give instead, once each, by method and URL. */
  const failures: { method: string; url: string; status: number | null; before?: () => Promise<void> }[] = [];
  const fetch = (async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    requests.push({ method, url, ifMatch: headers.get("If-Match"), ifNoneMatch: headers.get("If-None-Match") });
    const failure = failures.findIndex((one) => one.method === method && one.url === url);
    if (failure !== -1) {
      const [{ status, before }] = failures.splice(failure, 1);
      await before?.();
      if (status !== null) return new Response(status === 412 ? null : "failed", { status });
    }
    return local(input, init);
  }) as typeof globalThis.fetch;
  const put = async (url: string, body: string) => {
    const response = await local(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`PUT ${url}: ${response.status}`);
  };
  await put(`${INSTANCE}catalog.ttl`, `<#catalog> a <${DCAT_CATALOG}> .`);
  const validator = createShaclShapeValidator({ fetch, shapesFetch: siteFetch, ...SHAPE_SOURCES });
  const repository = createSolidReleaseDraftRepository({ fetch, releaseFetch: siteFetch, ...(checked ? { checkWrite: validator.checkSubjects } : {}) });
  return {
    store,
    fetch,
    local,
    put,
    requests,
    repository,
    validator,
    /**
     * The next request of that method to that URL is answered with
     * `status`, as a changed document is with 412, or (null) as the pod
     * answers it; `before` runs first.
     */
    failNext(method: string, url: string, status: number | null, before?: () => Promise<void>) {
      failures.push({ method, url, status, ...(before === undefined ? {} : { before }) });
    },
    /** The resources kept, by URL. */
    async urls() {
      return (await store.urls()).sort();
    },
    async text(url: string) {
      return (await local(url)).text();
    },
  };
}

/** The releases of the deck library, `<name>/v<N>.ttl`. */
export function libraryReleases(): string[] {
  return readdirSync(DECKS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readdirSync(join(DECKS_ROOT, entry.name))
        .filter((file) => /^v[1-9][0-9]*\.ttl$/.test(file))
        .map((file) => `${entry.name}/${file}`),
    )
    .sort();
}

/** A Turtle document's triples, read as the app reads documents, relative IRIs against `url`. */
export async function quadsOfTurtle(turtle: string, url: string): Promise<Quad[]> {
  return [...toRdfJsDataset(await getSolidDatasetLinear(url, { fetch: turtleFetch(turtle) }))] as Quad[];
}

const XSD_DATE_TIME = "http://www.w3.org/2001/XMLSchema#dateTime";
const FORMAT_VERSION = "https://solid-memo.com/ns/vocab/v1.ttl#formatVersion";

/**
 * The triples as lines to compare: a blank node as what it says (its
 * triples, sorted), a time as its instant, a language tag in lower case;
 * every format version, and the root's time of change, left out, which
 * a draft and its release write as theirs.
 */
export function comparable(quads: readonly Quad[], root: string): string[] {
  const bySubject = new Map<string, Quad[]>();
  for (const quad of quads) {
    if (quad.subject.termType !== "BlankNode") continue;
    const statements = bySubject.get(quad.subject.value);
    if (statements === undefined) bySubject.set(quad.subject.value, [quad]);
    else statements.push(quad);
  }
  const term = (one: Quad["object"], seen: ReadonlySet<string>): string => {
    if (one.termType === "BlankNode") {
      if (seen.has(one.value)) return "[cycle]";
      const inner = new Set([...seen, one.value]);
      return `[${(bySubject.get(one.value) ?? []).map((quad) => `${quad.predicate.value} ${term(quad.object, inner)}`).sort().join("; ")}]`;
    }
    if (one.termType === "Literal") {
      const value = one.datatype.value === XSD_DATE_TIME ? new Date(one.value).toISOString() : one.value;
      return `${JSON.stringify(value)}@${one.language.toLowerCase()}^^${one.datatype.value}`;
    }
    return `<${one.value}>`;
  };
  return quads
    .filter((quad) => quad.subject.termType !== "BlankNode")
    .filter((quad) => quad.predicate.value !== FORMAT_VERSION)
    .filter((quad) => !(quad.subject.value === root && quad.predicate.value === "http://purl.org/dc/terms/modified"))
    .map((quad) => `<${quad.subject.value}> <${quad.predicate.value}> ${term(quad.object, new Set())}`)
    .sort();
}

/**
 * A library release made a draft in the pod as it is (an import), then
 * published again at its own address (assemble): the release's triples
 * and the assembled ones, comparable.
 */
export async function roundTrip(pod: Awaited<ReturnType<typeof draftPod>>, path: string): Promise<{ release: string[]; assembled: string[]; turtle: string }> {
  const url = `${DECKS}${path}`;
  const text = readFileSync(join(DECKS_ROOT, path), "utf8");
  const release = await pod.repository.readRelease(url);
  const name = path.split("/")[0]!;
  const summary = await pod.repository.create(INSTANCE, releaseToDraft(release, draftUrlOf(INSTANCE, name, Number(release.root.version))));
  const turtle = await pod.repository.assemble(summary.url, url, release.root.issued!);
  return {
    release: comparable(await quadsOfTurtle(text, url), url),
    assembled: comparable(await quadsOfTurtle(turtle, url), url),
    turtle,
  };
}
