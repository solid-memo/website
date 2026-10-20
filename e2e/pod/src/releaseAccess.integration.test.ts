// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Whose access control a release is made public by, against a real Solid
 * server (docs/studio.md, Publishing a release): an instance attached
 * from another origin, whose server names an access control in a pod on
 * the real server as its release's (`rel="acl"`), leads no write there,
 * by Make public or by Publish. Only the release's own access control,
 * beside it on its origin, is ever written. The other origin is answered
 * in the test's fetch; every other request goes to the real server.
 */
import { describe, expect, inject, it } from "vitest";
import { createReleasePublishingUseCases } from "@solid-memo/application/releasePublishing";
import { createPodFence } from "@solid-memo/solid/podFence";
import { createSolidReleasePublisher } from "@solid-memo/solid/solidReleasePublisher";

const SERVERS = inject("solidServers");
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const OTHER = "https://other.example/";
const INSTANCE = `${OTHER}solid-memo/main/`;
const RELEASE = `${INSTANCE}releases/solid/v1.ttl`;
const RELEASE_FOLDER = `${INSTANCE}releases/solid/`;

async function put(url: string, body: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body,
  });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

/** The access control the server names for a resource (`rel="acl"`). */
async function accessControlOf(url: string): Promise<string> {
  const link = (await fetch(url, { method: "HEAD" })).headers.get("link") ?? "";
  const named = /<([^>]+)>\s*;\s*rel="acl"/.exec(link)?.[1];
  if (named === undefined) throw new Error(`${url} links no access control`);
  return new URL(named, url).href;
}

/** What a resource is now: its status and text, as someone with no login reads it. */
async function contents(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: "text/turtle" } });
  return `${response.status} ${response.ok ? await response.text() : ""}`;
}

/**
 * The other origin: a catalog that lists the release, the release, which
 * names `named` as its access control, and an ACL for its folder that
 * grants everything over `folder` too, which a new ACL would be made of.
 */
function otherOrigin(named: string, folder: string) {
  return (url: string, method: string): Response => {
    const headers = new Headers({ "content-type": "text/turtle" });
    const body = (text: string) => (method === "HEAD" ? null : text);
    if (url === `${INSTANCE}catalog.ttl`)
      return new Response(
        body(
          `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> ; <${SM}publishedRelease> <${RELEASE}> .`,
        ),
        { headers },
      );
    if (url === RELEASE) {
      headers.set("link", `<${named}>; rel="acl"`);
      return new Response(body(`<> a <${SM}Deck> .`), { headers });
    }
    if (method === "PUT") return new Response(null, { status: 201 });
    if (url === RELEASE_FOLDER) {
      headers.set("link", `<${RELEASE_FOLDER}.acl>; rel="acl"`);
      return new Response(body(""), { headers });
    }
    if (url === `${RELEASE_FOLDER}.acl`)
      return new Response(
        body(`@prefix acl: <http://www.w3.org/ns/auth/acl#> .
<#all> a acl:Authorization ; acl:agentClass <http://xmlns.com/foaf/0.1/Agent> ;
  acl:accessTo <${RELEASE_FOLDER}>, <${folder}> ; acl:default <${RELEASE_FOLDER}>, <${folder}> ;
  acl:mode acl:Read, acl:Write, acl:Control .`),
        { headers },
      );
    return new Response("Not found", { status: 404 });
  };
}

describe.each(SERVERS)("making a release public on $name", ({ url: server }) => {
  for (const [whose, how] of [
    ["a document's", "makePublic"],
    ["a folder's", "makePublic"],
    ["a document's", "publish"],
    ["a folder's", "publish"],
  ] as const)
    it(`writes no access control another origin names as its release's: ${whose}, by ${how}`, async () => {
      const base = new URL(`release-access-${crypto.randomUUID()}/`, server).href;
      const diary = `${base}alice/private/diary.ttl`;
      await put(diary, `<#entry> <https://example.org/says> "secret" .`);
      const target = whose === "a folder's" ? new URL(".", diary).href : diary;
      const named = await accessControlOf(target);
      const before = { acl: await contents(named), diary: (await fetch(diary)).status };
      const sent: string[] = [];
      const elsewhere: string[] = [];
      const answer = otherOrigin(named, new URL(".", diary).href);
      const userFetch = (async (input, init) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.startsWith(OTHER)) {
          elsewhere.push(`${method} ${url}`);
          const response = answer(url, method);
          Object.defineProperty(response, "url", { value: url });
          return response;
        }
        sent.push(`${method} ${url}`);
        return fetch(input, init);
      }) as typeof globalThis.fetch;
      // Behind the pod fences, as createAppUseCases wires it.
      const releasePublisher = createSolidReleasePublisher({
        fetch: createPodFence(userFetch),
        shareFetch: createPodFence(userFetch, { accessControl: true }),
        publicFetch: fetch,
      });
      if (how === "publish") {
        await releasePublisher
          .publish(INSTANCE, `<> a <${SM}Deck> .`, RELEASE)
          .catch(() => undefined);
      } else {
        const publishing = createReleasePublishingUseCases({
          drafts: {} as never,
          releaseDraftRepository: {} as never,
          releasePublisher,
          deckLibrary: {} as never,
          fileExchange: {} as never,
          storageGateway: { discoverStorages: async () => [] },
          now: () => new Date(),
        });
        // Refused, or done as the other origin says, which changes nothing but there.
        await publishing
          .makeReleasePublic(INSTANCE, RELEASE, `${base}alice/profile/card#me`)
          .catch(() => undefined);
      }
      // Nothing at all asked of the real server, and what it holds unchanged.
      expect(sent).toEqual([]);
      // On the other origin, no write but the release and its own access control.
      expect(
        elsewhere.filter(
          (one) =>
            !/^(GET|HEAD) /.test(one) &&
            ![`PUT ${RELEASE}`, `PATCH ${RELEASE}.acl`, `PATCH ${RELEASE}.acr`].includes(one),
        ),
      ).toEqual([]);
      expect({ acl: await contents(named), diary: (await fetch(diary)).status }).toEqual(before);
    });
});
