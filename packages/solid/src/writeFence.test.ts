import { describe, expect, it, vi } from "vitest";
import { createWriteFence } from "./writeFence";

const MAIN = "https://pod.example/solid-memo/main/";

function fence() {
  const inner = vi.fn(async () => new Response("ok"));
  return { inner, ...createWriteFence(inner as unknown as typeof globalThis.fetch) };
}

describe("createWriteFence", () => {
  it("passes every request through while nothing is held", async () => {
    const { inner, fetch } = fence();
    await fetch(`${MAIN}meta.ttl`, { method: "PUT" });
    expect(inner).toHaveBeenCalledWith(`${MAIN}meta.ttl`, { method: "PUT" });
  });

  it.each(["PUT", "POST", "PATCH", "DELETE", "put"])(
    "refuses a %s under a held container, however the URL is spelled",
    async (method) => {
      const { inner, fetch, hold } = fence();
      hold(MAIN);
      for (const url of [MAIN, `${MAIN}decks/deck-1.ttl`, `${MAIN}.acl`, "https://POD.example:443/solid-memo/main/meta.ttl", "https://pod.example/solid-memo/%6Dain/x.ttl"]) {
        await expect(fetch(url, { method })).rejects.toThrow(
          `Solid Memo is updating this instance and saves nothing to it until the update is done. Wait for the update to finish, then try again.\ncontainer: ${MAIN}`,
        );
      }
      await expect(fetch(new Request(`${MAIN}meta.ttl`, { method: "DELETE" }))).rejects.toThrow("method: DELETE");
      await expect(fetch(new URL(`${MAIN}meta.ttl`), { method })).rejects.toThrow();
      expect(inner).not.toHaveBeenCalled();
    },
  );

  it("refuses writes to a held document, naming it, but not to its neighbours", async () => {
    const { inner, fetch, hold } = fence();
    const cards = `${MAIN}decks/deck-1.ttl`;
    hold(cards);
    await expect(fetch(cards, { method: "PATCH" })).rejects.toThrow(
      `Solid Memo is updating this deck and saves nothing to it until the update is done. Wait for the update to finish, then try again.\ndocument: ${cards}\nmethod: PATCH\nurl: ${cards}`,
    );
    await fetch(cards);
    await fetch(`${MAIN}decks/deck-1-0f3a.ttl`, { method: "PUT" });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("still reads a held container, and writes beside it", async () => {
    const { inner, fetch, hold } = fence();
    hold(MAIN);
    await fetch(`${MAIN}meta.ttl`);
    await fetch(new Request(`${MAIN}meta.ttl`));
    await fetch(`${MAIN}meta.ttl`, { method: "HEAD" });
    await fetch(`${MAIN}`, { method: "OPTIONS" });
    await fetch("https://pod.example/solid-memo/main-0f3a/meta.ttl", { method: "PUT" });
    await fetch("https://pod.example/settings/privateTypeIndex.ttl", { method: "PATCH" });
    await fetch("https://pod.example/solid-memo/%E0%A4%A/x.ttl", { method: "PUT" });
    expect(inner).toHaveBeenCalledTimes(7);
  });

  it("lets writes through again once every hold is released, each release counting once", async () => {
    const { inner, fetch, hold } = fence();
    const first = hold(MAIN);
    const second = hold(MAIN);
    first();
    first();
    await expect(fetch(`${MAIN}meta.ttl`, { method: "PUT" })).rejects.toThrow();
    second();
    await fetch(`${MAIN}meta.ttl`, { method: "PUT" });
    expect(inner).toHaveBeenCalledOnce();
  });

  describe("passes", () => {
    it("let an update's writes through a hold, under a container or to a document, until released", async () => {
      const { inner, fetch, hold, pass } = fence();
      hold(MAIN);
      const backups = pass(`${MAIN}backups/20261009T100000Z-0f3a1b2c/`);
      const meta = pass(`${MAIN}meta.ttl`);
      await fetch(`${MAIN}backups/20261009T100000Z-0f3a1b2c/decks/deck-1.ttl`, { method: "PUT" });
      await fetch(`${MAIN}meta.ttl`, { method: "PATCH" });
      await expect(fetch(`${MAIN}catalog.ttl`, { method: "PATCH" })).rejects.toMatchObject({ code: "instanceBeingUpdated" });
      backups();
      meta();
      await expect(fetch(`${MAIN}meta.ttl`, { method: "PATCH" })).rejects.toThrow("container:");
      expect(inner).toHaveBeenCalledTimes(2);
    });

    it("hold the first accepted write to the document to an ETag, whatever the writer read, and none after it", async () => {
      const responses = [new Response(null, { status: 412 }), new Response(null, { status: 205 }), new Response("ok")];
      const inner = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => responses.shift()!);
      const { fetch, hold, pass } = createWriteFence(inner as unknown as typeof globalThis.fetch);
      hold(MAIN);
      pass(`${MAIN}meta.ttl`, '"v1"');
      expect((await fetch(`${MAIN}meta.ttl`, { method: "PATCH", headers: { "If-Match": '"v0"' } })).status).toBe(412);
      await fetch(new Request(`${MAIN}meta.ttl`, { method: "PUT", headers: { "Content-Type": "text/turtle" } }));
      await fetch(`${MAIN}meta.ttl`, { method: "PATCH", headers: { "If-Match": '"v2"' } });
      const sent = inner.mock.calls.map(([, init]) => new Headers(init?.headers));
      expect(sent.map((headers) => headers.get("If-Match"))).toEqual(['"v1"', '"v1"', '"v2"']);
      expect(sent[1]!.get("Content-Type")).toBe("text/turtle");
    });

    it("check a version that is no strong ETag just before the write, and answer 412 when it moved", async () => {
      const versions = ["Last-Modified: Fri, 09 Oct 2026 10:00:00 GMT", "Last-Modified: Fri, 09 Oct 2026 10:00:05 GMT"];
      const inner = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === undefined) {
          return new Response("x", { headers: { "Last-Modified": versions.shift()!.slice("Last-Modified: ".length) } });
        }
        return new Response("ok");
      });
      const { fetch, hold, pass } = createWriteFence(inner as unknown as typeof globalThis.fetch);
      hold(MAIN);
      pass(`${MAIN}meta.ttl`, "Last-Modified: Fri, 09 Oct 2026 10:00:00 GMT");
      expect((await fetch(`${MAIN}meta.ttl`, { method: "PATCH" })).status).toBe(200);
      expect(new Headers(inner.mock.calls[1]![1]?.headers).get("If-Match")).toBeNull();
      const other = pass(`${MAIN}catalog.ttl`, "Last-Modified: Fri, 09 Oct 2026 10:00:00 GMT");
      expect((await fetch(`${MAIN}catalog.ttl`, { method: "PATCH" })).status).toBe(412);
      other();
      expect(inner.mock.calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "PATCH", "GET"]);
    });
  });
});
