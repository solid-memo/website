// @vitest-environment node
/**
 * What each blocking server does, pinned (serverTraits.ts): the tests skip
 * some checks where a server does without something the app copes with,
 * so a new release that changes what it does must show here, not as
 * tests quietly starting or stopping to skip. The pin moves with the
 * release, by hand, once the change is understood (docs/testing.md).
 */
import { describe, expect, inject, it } from "vitest";
import { traitsOf } from "./serverTraits";

const SERVERS = inject("solidServers");

type Traits = Awaited<ReturnType<typeof traitsOf>>;

/** The Community Solid Server enforces every precondition and takes both PATCH formats; 6 stamps its ETags in whole seconds. */
const CSS: Traits = { etag: true, etagEveryEdit: true, edits: true, creations: true, sparqlUpdate: true, n3: true };
/** node-solid-server gives no ETag on a read, so no edit can be conditional; 5.8.8 and 6.0.0 enforce If-None-Match: *. */
const NSS: Traits = { etag: false, etagEveryEdit: false, edits: false, creations: true, sparqlUpdate: true, n3: true };

const PINNED: Record<string, Traits> = {
  "css-7": CSS,
  "css-6": { ...CSS, etagEveryEdit: false },
  "nss-6": NSS,
  "nss-5": NSS,
  // css-7 with Access Control Policies.
  "css-acp": CSS,
};

describe.each(SERVERS)("what $name does", ({ id, url: server }) => {
  it("is what the tests were written against", async (context) => {
    if (!(id in PINNED)) context.skip("nothing is pinned for this server: only the blocking servers' are");
    expect(await traitsOf(server)).toEqual(PINNED[id]);
  });
});
