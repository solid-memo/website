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
import { ACCESS_CONTROL_LIMITS, limitedFetch, RELEASE_LIMITS } from "./client/readLimits";
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
 *
 * A release already at an address is read, after a write refused there
 * and before one is made public, under RELEASE_LIMITS, as any release
 * is: an instance the user registered may be on anyone's server, and
 * the release being published was made under those limits already.
 * Its access control, which the grant reads before writing it, is read
 * under ACCESS_CONTROL_LIMITS for the same reason, and the release
 * itself, should the grant read it, under RELEASE_LIMITS: their bytes,
 * their triples, their characters and their base and prefix
 * declarations (accessControlFetch).
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
  /** The release at `url`, as `fetch` reads it, under RELEASE_LIMITS: its triples; throws when it cannot be read. */
  async function readRelease(url: string): Promise<Quad[]> {
    const response = await limitedFetch(fetch, RELEASE_LIMITS)(url, {
      headers: { Accept: "text/turtle" },
    });
    if (!response.ok) throw new AppError("releaseUnreadable", { url });
    return parseDeckFile(await response.text(), "turtle", url, RELEASE_LIMITS);
  }

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

  /** Whether the document at `url` states what `turtle` does, its time of issue aside; not when it cannot be read, or is larger than a release may be (readRelease). */
  async function isThisRelease(url: string, turtle: string): Promise<boolean> {
    try {
      const [there, here] = await Promise.all([
        readRelease(url),
        parseDeckFile(turtle, "turtle", url, RELEASE_LIMITS),
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

  /** Whether the document at `url` is a release: its own subject a deck (`<> a sm:Deck`); not when it cannot be read, or is larger than a release may be (readRelease). */
  async function isRelease(url: string): Promise<boolean> {
    try {
      return (await readRelease(url)).some(
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
 * another after leads to no other write. The release's server may be
 * anyone's, and the grant's library parses what it reads with no
 * limits, so every answer is read under limits: its body on its bytes,
 * and the body of a read that succeeds is parsed first under them, on
 * its triples, their characters and its base and prefix declarations,
 * then handed on as it was. A read of the release itself, or of a
 * folder above it, which a grant may make when its server answers no
 * HEAD, is held to RELEASE_LIMITS, as any release is; every other read,
 * of an access control, to ACCESS_CONTROL_LIMITS, far smaller. The
 * library takes a failed read of the release's access control for one
 * not written yet, and writes another from its folder's, so once a
 * request throws (refused here, past a limit, or not answered), every
 * one after is refused, and the grant fails. An answer that is not ok,
 * such as a 404, is handed on, and locks nothing.
 */
function accessControlFetch(
  fetch: typeof globalThis.fetch,
  release: string,
): typeof globalThis.fetch {
  const { origin } = new URL(release);
  const own = new Set([`${release}.acl`, `${release}.acr`]);
  const accessControl = limitedFetch(fetch, ACCESS_CONTROL_LIMITS);
  const document = limitedFetch(fetch, RELEASE_LIMITS);
  /** Whether `href` is the release or a folder above it, not an access control. */
  const isDocument = (href: string) =>
    href === release || (href.endsWith("/") && release.startsWith(href));
  let failed = false;
  return async (input, init) => {
    // The grant asks by URL (client/access.ts): a Request, whose text is no URL, is refused.
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const read = method === "GET" || method === "HEAD";
    if (failed || url.origin !== origin || (!read && !own.has(url.href)))
      throw new TypeError(`Not the release's to change: ${method} ${url.href}`);
    try {
      const [limited, limits] =
        read && isDocument(url.href)
          ? [document, RELEASE_LIMITS]
          : [accessControl, ACCESS_CONTROL_LIMITS];
      const response = await limited(input, read ? init : { ...init, redirect: "error" });
      if (response.url !== "" && new URL(response.url).origin !== origin)
        throw new TypeError(`Answered from another origin: ${response.url}`);
      if (method !== "GET" || !response.ok) return response;
      const text = await response.text();
      await parseDeckFile(text, "turtle", response.url || url.href, limits);
      const checked = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      Object.defineProperty(checked, "url", { value: response.url });
      return checked;
    } catch (error) {
      failed = true;
      throw error;
    }
  };
}
