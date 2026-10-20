// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createPodFence } from "./podFence";

const MAIN = "https://pod.example/solid-memo/main/";

function fenced(options?: { accessControl?: boolean }) {
  const inner = vi.fn(async () => new Response("ok"));
  return { inner, fetch: createPodFence(inner as unknown as typeof globalThis.fetch, options) };
}

/** Addresses a write may go to: documents and folders, anywhere, in canonical form. */
const SAFE = [
  MAIN,
  `${MAIN}meta.ttl`,
  `${MAIN}decks/deck-1.ttl`,
  "https://pod.example/profile/card",
  "https://pod.example/kort/spanish.ttl",
  "https://pod.example/settings/privateTypeIndex.ttl",
  `${MAIN}history/2026-10.ttl`,
  "https://pod.example/caf%C3%A9/deck.ttl",
  "http://localhost:3000/alice/deck.ttl",
];

/** Addresses no write goes to, and why. */
const UNSAFE: [string, string][] = [
  ["an access control", `${MAIN}decks/deck-1.ttl.acl`],
  ["an access control, in upper case", `${MAIN}decks/deck-1.ttl.ACL`],
  ["an access control resource", `${MAIN}decks/deck-1.ttl.acr`],
  ["a folder's access control", `${MAIN}.acl`],
  ["metadata", `${MAIN}decks/deck-1.ttl.meta`],
  ["metadata, in mixed case", `${MAIN}.Meta`],
  ["an access control spelled with an encoded letter", `${MAIN}deck-1.ttl.ac%6C`],
  ["a dot segment", `${MAIN}decks/../../profile/card`],
  ["an encoded dot segment", `${MAIN}decks/%2e%2e/%2e%2e/profile/card`],
  ["an encoded dot segment, in upper case", `${MAIN}decks/%2E%2E/profile/card`],
  ["an empty segment", `${MAIN}decks//deck-1.ttl`],
  ["an encoded slash", `${MAIN}decks/..%2fprofile/card`],
  ["an encoded backslash", `${MAIN}decks/..%5Cprofile`],
  ["an encoded percent sign", `${MAIN}decks/%252e%252e/x.ttl`],
  ["an overlong byte", `${MAIN}decks/%c0%ae%c0%ae/x.ttl`],
  ["a path parameter", `${MAIN}decks/..;/profile/card`],
  ["a segment that begins with a dot", `${MAIN}.hidden`],
  ["an upper-case host", "https://POD.example/solid-memo/main/meta.ttl"],
  ["a default port", "https://pod.example:443/solid-memo/main/meta.ttl"],
  ["a backslash", "https://pod.example/solid-memo\\main/meta.ttl"],
  ["a query", `${MAIN}meta.ttl?x`],
  ["a fragment", `${MAIN}meta.ttl#it`],
  ["another scheme", "ftp://pod.example/x.ttl"],
  ["no address", "meta.ttl"],
];

describe("createPodFence", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])("lets a %s through to any address", async (method) => {
    const { inner, fetch } = fenced();
    for (const [, url] of UNSAFE) await fetch(url, { method });
    await fetch(`${MAIN}.acl`);
    await fetch(new Request(`${MAIN}decks/deck-1.ttl.acl`));
    expect(inner).toHaveBeenCalledTimes(UNSAFE.length + 2);
  });

  it.each(["PUT", "POST", "PATCH", "DELETE", "patch"])(
    "lets a %s through to a safe address, as a URL or a Request",
    async (method) => {
      const { inner, fetch } = fenced();
      for (const url of SAFE) await fetch(url, { method });
      await fetch(new Request(`${MAIN}meta.ttl`, { method }));
      expect(inner).toHaveBeenCalledTimes(SAFE.length + 1);
    },
  );

  describe.each(["PUT", "POST", "PATCH", "DELETE", "PROPPATCH", "delete"])("a %s", (method) => {
    it.each(UNSAFE)("to %s is refused, nothing sent", async (_, url) => {
      const { inner, fetch } = fenced();
      await expect(fetch(url, { method })).rejects.toMatchObject({
        code: "writeRefused",
        vars: { method: method.toUpperCase(), url },
      });
      expect(inner).not.toHaveBeenCalled();
    });
  });

  it("refuses a Request that writes by its own method, and an init's method over a Request's", async () => {
    const { inner, fetch } = fenced();
    await expect(
      fetch(new Request(`${MAIN}decks/deck-1.ttl.acl`, { method: "PUT" })),
    ).rejects.toMatchObject({ code: "writeRefused" });
    await expect(fetch(new Request(`${MAIN}.acl`), { method: "DELETE" })).rejects.toMatchObject({
      code: "writeRefused",
    });
    expect(inner).not.toHaveBeenCalled();
  });

  describe("for access control", () => {
    it("lets a write through to a document's own ACL or ACR, and anything the fence lets through", async () => {
      const { inner, fetch } = fenced({ accessControl: true });
      for (const url of [
        `${MAIN}releases/solid/v1.ttl.acl`,
        `${MAIN}releases/solid/v1.ttl.acr`,
        `${MAIN}releases/solid/v1.ttl`,
      ])
        await fetch(url, { method: "PATCH" });
      expect(inner).toHaveBeenCalledTimes(3);
    });

    it("refuses a folder's, metadata, and an access control at an unsafe address, nothing sent", async () => {
      const { inner, fetch } = fenced({ accessControl: true });
      for (const url of [
        `${MAIN}.acl`,
        `${MAIN}releases/.acr`,
        `${MAIN}releases/solid/v1.ttl.meta`,
        `${MAIN}releases/solid/v1.ttl.acl.acl`,
        `${MAIN}releases/%2e%2e/v1.ttl.acl`,
        `${MAIN}releases//v1.ttl.acl`,
        "https://POD.example/v1.ttl.acl",
      ]) {
        await expect(fetch(url, { method: "PUT" }), url).rejects.toMatchObject({
          code: "writeRefused",
        });
      }
      expect(inner).not.toHaveBeenCalled();
    });
  });
});
