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
          `Solid Memo is moving your study in this browser into your Pod and saves nothing to it until that is done. Wait for it to finish, then try again.\ncontainer: ${MAIN}`,
        );
      }
      await expect(fetch(new Request(`${MAIN}meta.ttl`, { method: "DELETE" }))).rejects.toThrow("method: DELETE");
      await expect(fetch(new URL(`${MAIN}meta.ttl`), { method })).rejects.toThrow();
      expect(inner).not.toHaveBeenCalled();
    },
  );

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
});
