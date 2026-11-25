// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import type { ReleasePublisher } from "@solid-memo/application/ports/library";
import { AppError } from "@solid-memo/domain/appError";
import { DCTERMS_NS } from "@solid-memo/domain/release/releaseModel";
import { isPublishedReleaseUrl } from "@solid-memo/domain/release/releasePlace";
import { addCatalogLink, catalogLinks, refuseFullCatalog } from "./catalogLinks";
import type { GrantPublicRead } from "./client/access";
import { accessControlFetch } from "./accessControlFetch";
import { limitedFetch, RELEASE_LIMITS } from "./client/readLimits";
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
 * their triples, their characters, their base and prefix declarations
 * and how deep they nest, and an access control's subjects, to
 * MAX_ACCESS_CONTROL_SUBJECTS (accessControlFetch).
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
      return await grantPublicRead(url, {
        fetch: accessControlFetch(shareFetch, url, RELEASE_LIMITS),
      });
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
      // Before the release is written: one the catalog has no room to link, or whose node a newer version wrote, would be listed nowhere.
      await refuseFullCatalog(instanceUrl, SM.publishedRelease, targetUrl, dataFetch);
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
      // Listed before it is made public: a link refused leaves no release public that the app cannot find.
      // Through the fetch listPublished reads the catalog with, so that the write forgets the read it kept (datasets.ts).
      await addCatalogLink(instanceUrl, SM.publishedRelease, targetUrl, dataFetch);
      return { public: await share(targetUrl) };
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
 * out: every blank node alike, as each server names them afresh. Both
 * sides are read by n3, whose literals all name a direction ("" for none).
 */
function statementsOf(quads: readonly Quad[], url: string): string {
  const term = (one: Term) =>
    one.termType === "BlankNode"
      ? "_:"
      : one.termType === "Literal"
        ? JSON.stringify([one.value, one.language, one.direction, one.datatype.value])
        : `<${one.value}>`;
  return quads
    .filter((quad) => !(quad.subject.value === url && TIMES.has(quad.predicate.value)))
    .map((quad) => `${term(quad.subject)} ${term(quad.predicate)} ${term(quad.object)}`)
    .sort()
    .join("\n");
}
