import { universalAccess } from "@inrupt/solid-client";
import type { Quad, Term } from "@rdfjs/types";
import type { ReleasePublisher } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { DCTERMS_NS } from "@solid-memo/domain/release/releaseModel";
import { addCatalogLink, catalogLinks } from "./catalogLinks";
import { parseDeckFile } from "./solidDeckArchive";
import { SM } from "./vocab";

/**
 * The ReleasePublisher over the pod (docs/studio.md, Publishing a
 * release): a release is one Turtle document, written as `assemble`
 * made it, once, where nothing is (If-None-Match: *), then made
 * readable by everyone, then linked from the instance's catalogue
 * (`sm:publishedRelease`). A release there already that states what
 * this one does, its time of issue aside, is this one, written by a
 * publishing cut short: it is made public and linked as if just written,
 * so publishing again finishes it.
 *
 * This is the only place the app changes who may read something. It
 * asks `@inrupt/solid-client`'s universal access (`setPublicAccess`),
 * which writes the release's own ACL on a server with Web Access Control
 * and its ACR on one with Access Control Policies, for that document
 * alone: read for everyone, nothing else, and nothing for its folder or
 * any other document. A pod that will not (it has neither, or refuses
 * the write) leaves the release readable by its owner alone. So does a
 * pod that names the folder's access control as the release's
 * (`rel="acl"`): writing it would change who may use the whole folder,
 * so it is not written.
 *
 * Whether a release is public is asked as someone with no login would
 * ask: with `publicFetch`, which sends no credentials.
 */
export function createSolidReleasePublisher({
  fetch,
  publicFetch,
}: {
  fetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
}): ReleasePublisher {
  /** The access control a resource's server names for it (`rel="acl"`), by its URL; null when it names none. */
  async function accessControlOf(url: string): Promise<string | null> {
    const link = (await fetch(url, { method: "HEAD" })).headers.get("Link") ?? "";
    const named = /<([^>]*)>\s*;\s*rel="acl"/.exec(link)?.[1];
    return named === undefined ? null : new URL(named, url).href;
  }

  /**
   * Make the release readable by everyone: whether the pod says it now
   * is. Not when its access control is its folder's, which the write
   * would change for every document in it.
   */
  async function share(url: string): Promise<boolean> {
    try {
      const own = await accessControlOf(url);
      if (own !== null && own === (await accessControlOf(new URL(".", url).href))) return false;
      const access = await universalAccess.setPublicAccess(url, { read: true }, { fetch: accessFetch(fetch) });
      return access?.read === true;
    } catch {
      return false;
    }
  }

  /** Whether the document at `url` states what `turtle` does, its time of issue aside; not when it cannot be read. */
  async function isThisRelease(url: string, turtle: string): Promise<boolean> {
    try {
      const response = await fetch(url, { headers: { Accept: "text/turtle" } });
      if (!response.ok) return false;
      const [there, here] = await Promise.all([parseDeckFile(await response.text(), "turtle", url), parseDeckFile(turtle, "turtle", url)]);
      return statementsOf(there, url) === statementsOf(here, url);
    } catch {
      return false;
    }
  }

  return {
    async publish(instanceUrl, turtle, targetUrl) {
      const response = await fetch(targetUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/turtle", "If-None-Match": "*" },
        body: turtle,
      });
      if (response.status === 412) {
        if (!(await isThisRelease(targetUrl, turtle))) throw new AppError("releaseTaken", { url: targetUrl });
      } else if (!response.ok) throw new AppError("addFailed", { url: targetUrl, status: response.status });
      const shared = await share(targetUrl);
      await addCatalogLink(instanceUrl, SM.publishedRelease, targetUrl, fetch);
      return { public: shared };
    },

    async makePublic(url) {
      if (!(await share(url))) throw new AppError("publicAccessRefused", { url });
    },

    async isPublic(url) {
      try {
        return (await publicFetch(url, { method: "HEAD" })).ok;
      } catch {
        return false;
      }
    },

    listPublished(instanceUrl) {
      return catalogLinks(instanceUrl, SM.publishedRelease, fetch);
    },
  };
}

/** A release's times of issue and of change, which differ each time it is made. */
const TIMES = new Set([`${DCTERMS_NS}issued`, `${DCTERMS_NS}modified`]);

/**
 * A release's statements as text to compare, in order, its times left
 * out: every blank node alike, as each server names them afresh.
 */
function statementsOf(quads: readonly Quad[], url: string): string {
  const term = (one: Term) =>
    one.termType === "BlankNode" ? "_:" : one.termType === "Literal" ? JSON.stringify([one.value, one.language, one.datatype.value]) : `<${one.value}>`;
  return quads
    .filter((quad) => !(quad.subject.value === url && TIMES.has(quad.predicate.value)))
    .map((quad) => `${term(quad.subject)} ${term(quad.predicate)} ${term(quad.object)}`)
    .sort()
    .join("\n");
}

const ACCESS_CONTROL_RESOURCE = "http://www.w3.org/ns/solid/acp#AccessControlResource";

/**
 * The fetch the access write is made with, so that it is made as the
 * Solid servers tested take it:
 *
 * - a space is put before each "." that ends a statement in a PATCH
 *   body, right after an IRI or a string. @inrupt/solid-client writes an
 *   ACL's PATCH with that "." touching the term before it
 *   (`<…#Agent>.}`), which node-solid-server's parser takes for a path
 *   and refuses (400), as it does every PATCH of the library's
 *   (datasets.ts, patchBody); an ACL holds no other kind of term;
 * - an Access Control Resource not written yet, which the Community
 *   Solid Server answers 404 (its Link saying what it is), is read as
 *   one that says only that it is one, which the write then makes. The
 *   library would otherwise take the server for one without ACP, and
 *   change nothing.
 */
export function accessFetch(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.method === "PATCH") {
      // The library sends a PATCH's body as text.
      return fetch(input, { ...init, body: (init.body as string).replace(/(>|(?<!\\)")\.(?=\s|\})/g, "$1 .") });
    }
    const response = await fetch(input, init);
    const link = response.headers.get("Link") ?? "";
    const method = init?.method ?? "GET";
    if ((method !== "GET" && method !== "HEAD") || response.status !== 404 || !link.includes(`<${ACCESS_CONTROL_RESOURCE}>`)) return response;
    const body = method === "HEAD" ? null : `<> a <${ACCESS_CONTROL_RESOURCE}> .`;
    const empty = new Response(body, { status: 200, headers: { "Content-Type": "text/turtle", Link: link } });
    Object.defineProperty(empty, "url", { value: response.url });
    return empty;
  };
}

/** A fetch as someone with no login: no cookie, no credentials of any kind. */
export const anonymousFetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, { ...init, credentials: "omit" });
