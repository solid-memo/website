// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { GrantPublicRead } from "../../client/interface";
import { createLocalPod } from "../../localPod";
import { createMemoryResourceStore } from "../../memoryResourceStore";

const POD = "https://alice.example/";
const RELEASE = `${POD}solid-memo/main/releases/solid/v1.ttl`;
const ACL = "http://www.w3.org/ns/auth/acl#";

/**
 * A pod with Web Access Control (`wac`): each resource's ACL is its URL
 * and `.acl` (rel="acl"), and the root's lets everyone do everything.
 * Without it, the pod has no access control. `sent` is every request
 * made, as method, URL and body.
 */
async function pod({ wac = true }: { wac?: boolean } = {}) {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({ root: POD, store, newEtag: () => `"e${++etags}"` });
  const put = (url: string, body: string) =>
    local(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body });
  await put(RELEASE, "<> a <https://solid-memo.com/ns/vocab/v1.ttl#Deck> .");
  await put(
    `${POD}.acl`,
    `<#all> a <${ACL}Authorization>; <${ACL}agentClass> <http://xmlns.com/foaf/0.1/Agent>; <${ACL}accessTo> <${POD}>; <${ACL}default> <${POD}>; <${ACL}mode> <${ACL}Read>, <${ACL}Write>, <${ACL}Control> .`,
  );
  const sent: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    sent.push(`${method} ${url}${typeof init?.body === "string" ? ` ${init.body}` : ""}`);
    const response = await local(input, init);
    if (!wac || url.endsWith(".acl") || (method !== "GET" && method !== "HEAD")) return response;
    const headers = new Headers(response.headers);
    headers.append("Link", `<${url}.acl>; rel="acl"`);
    const answer = new Response(response.body, { status: response.status, headers });
    Object.defineProperty(answer, "url", { value: url });
    return answer;
  };
  return { fetch, sent, text: async (url: string) => (await local(url)).text() };
}

/**
 * What the app relies on of the public-read grant (client/access.ts),
 * on a pod with Web Access Control held in memory: an implementation
 * passes these, or publishing a release breaks. The release publisher's
 * tests run the grant on an ACP pod too (solidReleasePublisher.test.ts),
 * and the end-to-end tests on real servers (e2e/pod).
 */
export function accessContract(grantPublicRead: GrantPublicRead): void {
  describe("grantPublicRead", () => {
    it("writes the document's own ACL, read for everyone of it alone, and says it is public", async () => {
      const { fetch, sent, text } = await pod();
      await expect(grantPublicRead(RELEASE, { fetch })).resolves.toBe(true);
      const acl = await text(`${RELEASE}.acl`);
      expect(acl).toContain(`<${ACL}accessTo> <${RELEASE}>`);
      const named = [
        ...acl.matchAll(/<http:\/\/www\.w3\.org\/ns\/auth\/acl#(?:accessTo|default)> <([^>]+)>/g),
      ].map((match) => match[1]);
      expect(new Set(named)).toEqual(new Set([RELEASE]));
      // Every write is of that ACL, its statements ended as node-solid-server takes them.
      const writes = sent.filter((one) => !one.startsWith("GET ") && !one.startsWith("HEAD "));
      expect(writes.map((one) => one.split(" ").slice(0, 2).join(" "))).toEqual([
        `PATCH ${RELEASE}.acl`,
      ]);
      expect(writes[0]).not.toMatch(/>\.(\s|\})/);
    });

    it("says a pod without access control did not make the document public", async () => {
      const { fetch, sent } = await pod({ wac: false });
      await expect(grantPublicRead(RELEASE, { fetch })).resolves.toBe(false);
      expect(sent.filter((one) => !one.startsWith("GET ") && !one.startsWith("HEAD "))).toEqual([]);
    });
  });
}
