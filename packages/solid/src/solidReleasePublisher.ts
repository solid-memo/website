// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import type { ReleasePublisher } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { DCTERMS_NS } from "@solid-memo/domain/release/releaseModel";
import { isPublishedReleaseUrl } from "@solid-memo/domain/release/releasePlace";
import { addCatalogLink, catalogLinks } from "./catalogLinks";
import type { GrantPublicRead } from "./client/access";
import { parseDeckFile } from "./solidDeckArchive";
import { RDF, SM } from "./vocab";

/**
 * The ReleasePublisher over the pod (docs/studio.md, Publishing a
 * release): a release is one Turtle document, written as `assemble`
 * made it, once, where nothing is (If-None-Match: *), then made
 * readable by everyone, then linked from the instance's catalog
 * (`sm:publishedRelease`). A release there already that states what
 * this one does, its time of issue aside, is this one, written by a
 * publishing cut short: it is made public and linked as if just written,
 * so publishing again finishes it.
 *
 * This is the only place the app changes who may read something. It
 * asks `grantPublicRead` (client/access.ts), which writes the release's
 * own ACL on a server with Web Access Control and its ACR on one with
 * Access Control Policies, for that document alone: read for everyone,
 * nothing else, and nothing for its folder or any other document.
 * Whatever grant it is given, the fence around it (accessControlFetch)
 * keeps it to that. A pod that will not (it has neither, or refuses
 * the write) leaves the release readable by its owner alone. So does a
 * server that names any other access control as the release's
 * (`rel="acl"`): only the release's own, beside it (`<release>.acl` or
 * `<release>.acr`), is written, and nothing is asked of another origin
 * (accessControlFetch). The folder's would change who may use the whole
 * folder; another document's, or one in another pod, is not the
 * release's to change, whatever a server says.
 *
 * The access control is written with `shareFetch`, the user's fetch
 * that the pod fence lets write a document's own access control
 * (podFence.ts), which `fetch` never does; it is used for nothing else.
 * Whether a release is public is asked as someone with no login would
 * ask: with `publicFetch`, which sends no credentials. The releases an
 * instance's catalog links are listed, and linked, with `dataFetch`, as
 * the instance's data is read and written: the Studio lists them for
 * any instance it shows, one outside the user's storages too, which is
 * read under limits and as no one (docs/boundaries.md).
 */
export function createSolidReleasePublisher({
  fetch,
  dataFetch,
  shareFetch,
  publicFetch,
  grantPublicRead,
}: {
  fetch: typeof globalThis.fetch;
  dataFetch: typeof globalThis.fetch;
  shareFetch: typeof globalThis.fetch;
  publicFetch: typeof globalThis.fetch;
  grantPublicRead: GrantPublicRead;
}): ReleasePublisher {
  /**
   * Make the release readable by everyone: whether the pod says it now
   * is. Only its own access control is written (accessControlFetch).
   */
  async function share(url: string): Promise<boolean> {
    try {
      return await grantPublicRead(url, { fetch: accessControlFetch(shareFetch, url) });
    } catch {
      return false;
    }
  }

  /** Whether the document at `url` states what `turtle` does, its time of issue aside; not when it cannot be read. Both are the user's own, read with no limits. */
  async function isThisRelease(url: string, turtle: string): Promise<boolean> {
    try {
      const response = await fetch(url, { headers: { Accept: "text/turtle" } });
      if (!response.ok) return false;
      const [there, here] = await Promise.all([
        parseDeckFile(await response.text(), "turtle", url, null),
        parseDeckFile(turtle, "turtle", url, null),
      ]);
      return statementsOf(there, url) === statementsOf(here, url);
    } catch {
      return false;
    }
  }

  /** The releases the catalog links (`sm:publishedRelease`) at an address a release may have (isPublishedReleaseUrl). */
  async function listPublished(instanceUrl: string): Promise<string[]> {
    return (await catalogLinks(instanceUrl, SM.publishedRelease, dataFetch)).filter(
      isPublishedReleaseUrl,
    );
  }

  /** Whether the document at `url` is a release: its own subject a deck (`<> a sm:Deck`); not when it cannot be read. It is the user's own, read with no limits. */
  async function isRelease(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { headers: { Accept: "text/turtle" } });
      if (!response.ok) return false;
      return (await parseDeckFile(await response.text(), "turtle", url, null)).some(
        (quad) =>
          quad.subject.value === url &&
          quad.predicate.value === RDF.type &&
          quad.object.value === SM.Deck,
      );
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
        if (!(await isThisRelease(targetUrl, turtle)))
          throw new AppError("releaseTaken", { url: targetUrl });
      } else if (!response.ok)
        throw new AppError("addFailed", { url: targetUrl, status: response.status });
      const shared = await share(targetUrl);
      // Through the fetch listPublished reads the catalog with, so that the write forgets the read it kept (datasets.ts).
      await addCatalogLink(instanceUrl, SM.publishedRelease, targetUrl, dataFetch);
      return { public: shared };
    },

    async makePublic(instanceUrl, url) {
      // Only a release the instance's catalog lists, whose document is one: a link anyone may have written leads nothing else to everyone.
      if (
        !(await listPublished(instanceUrl)).includes(url) ||
        !(await isRelease(url)) ||
        !(await share(url))
      )
        throw new AppError("publicAccessRefused", { url });
    },

    async isPublic(url) {
      try {
        return (await publicFetch(url, { method: "HEAD" })).ok;
      } catch {
        return false;
      }
    },

    listPublished,
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
    one.termType === "BlankNode"
      ? "_:"
      : one.termType === "Literal"
        ? JSON.stringify([one.value, one.language, one.datatype.value])
        : `<${one.value}>`;
  return quads
    .filter((quad) => !(quad.subject.value === url && TIMES.has(quad.predicate.value)))
    .map((quad) => `${term(quad.subject)} ${term(quad.predicate)} ${term(quad.object)}`)
    .sort()
    .join("\n");
}

/**
 * The fetch that makes the release at `release` public, kept to what
 * that may touch, whatever the servers' answers name (`rel="acl"`, a
 * redirect): a request to another origin than the release's is refused,
 * and so is any but a read (GET, HEAD) of another resource than the
 * release's own access control, beside it (`<release>.acl`, its ACL; or
 * `<release>.acr`, its ACR), which every Solid server tested names. A
 * write is not followed to another address (`redirect: "error"`, as
 * the user's fetch already asks of every request, authFetch.ts), and a
 * read answered from another origin is refused. Each check is of the
 * request itself, so an answer that names one access control first and
 * another after leads to no other write.
 */
function accessControlFetch(
  fetch: typeof globalThis.fetch,
  release: string,
): typeof globalThis.fetch {
  const { origin } = new URL(release);
  const own = new Set([`${release}.acl`, `${release}.acr`]);
  return async (input, init) => {
    // The grant asks by URL (client/access.ts): a Request, whose text is no URL, is refused.
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const read = method === "GET" || method === "HEAD";
    if (url.origin !== origin || (!read && !own.has(url.href)))
      throw new TypeError(`Not the release's to change: ${method} ${url.href}`);
    const response = await fetch(input, read ? init : { ...init, redirect: "error" });
    if (response.url !== "" && new URL(response.url).origin !== origin)
      throw new TypeError(`Answered from another origin: ${response.url}`);
    return response;
  };
}
