// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { LWS_DESCRIPTION_TYPE, storageRootsOf } from "./lwsStorage";

const STORAGE = "https://pod.example/alice/";

/** A fetch that answers every request with `body` (JSON unless a string). */
function answering(body: unknown, init?: ResponseInit): typeof globalThis.fetch {
  return async () =>
    typeof body === "string" ? new Response(body, init) : Response.json(body, init);
}

const described = (rest: Record<string, unknown>) => ({
  "@context": ["https://www.w3.org/ns/cid/v1", "https://www.w3.org/ns/lws/v1"],
  id: STORAGE,
  type: "Storage",
  ...rest,
});

describe("storageRootsOf", () => {
  it("asks for the storage description and names its StorageRoot services' endpoints", async () => {
    const asked: [string, RequestInit | undefined][] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      asked.push([String(input), init]);
      return Response.json(
        described({
          service: [
            { type: "StorageRoot", serviceEndpoint: STORAGE },
            { type: ["https://www.w3.org/ns/lws#StorageRoot"], serviceEndpoint: "/alice/more" },
            { type: "StorageRoot", serviceEndpoint: STORAGE },
            { type: "NotificationService", serviceEndpoint: "https://pod.example/.notifications/" },
          ],
        }),
      );
    };
    await expect(storageRootsOf(STORAGE, fetch)).resolves.toEqual([
      STORAGE,
      "https://pod.example/alice/more/",
    ]);
    expect(asked).toEqual([[STORAGE, { headers: { Accept: LWS_DESCRIPTION_TYPE } }]]);
  });

  it("takes a type list and the full IRIs of the types", async () => {
    const fetch = answering(
      described({
        type: ["https://www.w3.org/ns/lws#Storage", "Other"],
        service: [{ type: "StorageRoot", serviceEndpoint: STORAGE }],
      }),
    );
    await expect(storageRootsOf(STORAGE, fetch)).resolves.toEqual([STORAGE]);
  });

  it("leaves out services that are not maps, have no endpoint, or a root on another origin", async () => {
    const fetch = answering(
      described({
        service: [
          null,
          "StorageRoot",
          { type: "StorageRoot" },
          { type: "StorageRoot", serviceEndpoint: 7 },
          { type: "StorageRoot", serviceEndpoint: "http://[" },
          { type: "StorageRoot", serviceEndpoint: "https://elsewhere.example/" },
        ],
      }),
    );
    await expect(storageRootsOf(STORAGE, fetch)).resolves.toEqual([]);
  });

  it.each([
    ["an answer that is not ok", answering(described({}), { status: 404 })],
    ["one that is not JSON", answering("<html>")],
    ["JSON that is no map", answering("null")],
    [
      "a description of another storage",
      answering({ ...described({}), id: "https://pod.example/" }),
    ],
    ["one with no id", answering({ type: "Storage", service: [] })],
    ["one that is not a storage's", answering(described({ type: "Container", service: [] }))],
    ["one with no services", answering(described({ service: {} }))],
    ["one past its read limit", answering("x".repeat(64 * 1024 + 1))],
    [
      "a request that fails",
      (async () => {
        throw new Error("offline");
      }) as typeof globalThis.fetch,
    ],
    ["one whose id is no URL", answering({ ...described({ service: [] }), id: "http://[" })],
  ])("can't name the roots for %s", async (_, fetch) => {
    await expect(storageRootsOf(STORAGE, fetch)).resolves.toBeNull();
  });
});
