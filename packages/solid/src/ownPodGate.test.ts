// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createOwnPodGate } from "./ownPodGate";

const WEB_ID = "https://alice.example/profile/card#me";

/** A gate whose user owns `folders`, logged in as `user.webId`, and the fetches it chooses between. */
function setup(
  user: { webId: string | undefined },
  folders = ["https://alice.example/", "https://shared.example/study/"],
) {
  const fetch = vi.fn(async () => new Response("user"));
  const publicFetch = vi.fn(async () => new Response("no one"));
  const ownFolders = vi.fn(async (_webId: string) => [...folders]);
  /** The page's changes to the folders, and the clock. */
  const page = { revision: 0, now: 0 };
  const gate = createOwnPodGate({
    fetch,
    publicFetch,
    webId: () => user.webId,
    ownFolders,
    revision: () => page.revision,
    now: () => page.now,
  });
  return { gate, fetch, publicFetch, ownFolders, page };
}

describe("createOwnPodGate", () => {
  it("sends a request in the user's own folders as the user, reads and writes alike", async () => {
    const { gate, fetch, publicFetch, ownFolders } = setup({ webId: WEB_ID });
    const cards = "https://alice.example/memo/decks/deck-1.ttl";
    expect(await (await gate(cards, { headers: { Accept: "text/turtle" } })).text()).toBe("user");
    expect(fetch).toHaveBeenCalledWith(cards, { headers: { Accept: "text/turtle" } });
    await gate(cards, { method: "PATCH" });
    // A folder is the user's too, the instance's own among them.
    await gate(new Request("https://shared.example/study/", { method: "HEAD" }));
    await gate("https://shared.example/study/history/", { method: "DELETE" });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(publicFetch).not.toHaveBeenCalled();
    // Asked once, then kept.
    expect(ownFolders).toHaveBeenCalledOnce();
    expect(ownFolders).toHaveBeenCalledWith(WEB_ID);
  });

  it.each([
    "https://attacker.example/cards.ttl",
    "https://alice.example.attacker.example/cards.ttl",
    "https://alice.example@attacker.example/cards.ttl",
    "https://alice.example:8443/cards.ttl",
    "http://alice.example/cards.ttl",
    "https://shared.example/study-evil/cards.ttl",
    "https://shared.example/cards.ttl",
    "https://shared.example/study/a%2F..%2F..%2Fcards.ttl",
  ])("reads %s as no one, and writes nothing there", async (url) => {
    const { gate, fetch, publicFetch } = setup({ webId: WEB_ID });
    expect(await (await gate(url, { method: "HEAD" })).text()).toBe("no one");
    expect(publicFetch).toHaveBeenCalledWith(url, { method: "HEAD" });
    for (const method of ["PUT", "patch", "DELETE", "POST"]) {
      await expect(gate(url, { method })).rejects.toMatchObject({
        code: "writeOutsidePod",
        vars: { host: new URL(url).host },
      });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(publicFetch).toHaveBeenCalledOnce();
  });

  it("keeps the folders until the page changes them", async () => {
    const folders = ["https://alice.example/"];
    const { gate, fetch, ownFolders, page } = setup({ webId: WEB_ID }, folders);
    await gate("https://alice.example/memo/catalog.ttl");
    // An instance registered on this page, on another server.
    folders.push("https://shared.example/study/");
    page.revision++;
    const catalog = "https://shared.example/study/catalog.ttl";
    await gate(catalog, { method: "PUT" });
    expect(fetch).toHaveBeenLastCalledWith(catalog, { method: "PUT" });
    expect(ownFolders).toHaveBeenCalledTimes(2);
    // And one removed.
    folders.pop();
    page.revision++;
    await expect(gate(catalog, { method: "PUT" })).rejects.toMatchObject({
      code: "writeOutsidePod",
    });
    expect(ownFolders).toHaveBeenCalledTimes(3);
  });

  it("asks for the folders again for an address outside them at most once a minute", async () => {
    const folders = ["https://alice.example/"];
    const { gate, fetch, publicFetch, ownFolders, page } = setup({ webId: WEB_ID }, folders);
    const cards = "https://attacker.example/cards.ttl";
    await gate(cards);
    await gate(cards);
    page.now = 59_999;
    await gate(cards);
    expect(publicFetch).toHaveBeenCalledTimes(3);
    expect(ownFolders).toHaveBeenCalledOnce();
    // An instance registered elsewhere, another tab's, counts once they are asked again.
    folders.push("https://shared.example/study/");
    const catalog = "https://shared.example/study/catalog.ttl";
    await gate(catalog);
    expect(publicFetch).toHaveBeenLastCalledWith(catalog, undefined);
    page.now = 60_000;
    await gate(catalog);
    expect(fetch).toHaveBeenLastCalledWith(catalog, undefined);
    expect(ownFolders).toHaveBeenCalledTimes(2);
    await gate(cards);
    expect(ownFolders).toHaveBeenCalledTimes(2);
  });

  it("asks once for requests sent together before the folders are known", async () => {
    const { gate, fetch, ownFolders } = setup({ webId: WEB_ID });
    await Promise.all([
      gate("https://alice.example/memo/decks/deck-1.ttl"),
      gate("https://alice.example/memo/reviews/deck-1.ttl"),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ownFolders).toHaveBeenCalledOnce();
  });

  it("fails a request when the folders cannot be found, and asks again on the next", async () => {
    const { gate, fetch, ownFolders } = setup({ webId: WEB_ID });
    ownFolders.mockRejectedValueOnce(new Error("offline"));
    await expect(gate("https://alice.example/memo/catalog.ttl")).rejects.toThrow("offline");
    await gate("https://alice.example/memo/catalog.ttl");
    expect(fetch).toHaveBeenCalledOnce();
    expect(ownFolders).toHaveBeenCalledTimes(2);
  });

  it("keeps another user's folders when an earlier user's ask fails after they logged in", async () => {
    const user = { webId: WEB_ID as string | undefined };
    const { gate, fetch, ownFolders } = setup(user);
    let fail = (_error: Error) => undefined as void;
    ownFolders.mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject)));
    const first = gate("https://alice.example/memo/catalog.ttl");
    user.webId = "https://bob.example/profile/card#me";
    ownFolders.mockResolvedValueOnce(["https://bob.example/"]);
    await gate("https://bob.example/memo/catalog.ttl");
    fail(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    await gate("https://bob.example/memo/catalog.ttl");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(ownFolders).toHaveBeenCalledTimes(2);
  });

  it("asks for another user's folders once they log in", async () => {
    const user = { webId: WEB_ID as string | undefined };
    const { gate, fetch, publicFetch, ownFolders } = setup(user);
    await gate("https://alice.example/memo/catalog.ttl");
    user.webId = "https://bob.example/profile/card#me";
    ownFolders.mockResolvedValueOnce(["https://bob.example/"]);
    await gate("https://alice.example/memo/catalog.ttl");
    expect(ownFolders).toHaveBeenLastCalledWith(user.webId);
    expect(fetch).toHaveBeenCalledOnce();
    expect(publicFetch).toHaveBeenCalledOnce();
  });

  it("reads everything as no one and writes nothing when logged out, asking for no folders", async () => {
    const { gate, fetch, publicFetch, ownFolders } = setup({ webId: undefined });
    await gate("https://alice.example/memo/catalog.ttl");
    await expect(
      gate("https://alice.example/memo/catalog.ttl", { method: "PUT" }),
    ).rejects.toMatchObject({ code: "writeOutsidePod" });
    expect(publicFetch).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(ownFolders).not.toHaveBeenCalled();
  });
});
