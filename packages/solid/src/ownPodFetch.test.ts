// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createOwnPodFetch } from "./ownPodFetch";

const WEB_ID = "https://alice.example/profile/card#me";

/** An own-pod fetch whose user owns `folders`, logged in as `webId`, and the fetches it chooses between. */
function setup(
  webId: string | undefined,
  folders = ["https://alice.example/", "https://shared.example/study/"],
) {
  const fetch = vi.fn(async () => new Response("user"));
  const publicFetch = vi.fn(async () => new Response("no one"));
  const ownFolders = vi.fn(async () => folders);
  const ownPodFetch = createOwnPodFetch({ fetch, publicFetch, webId: () => webId, ownFolders });
  return { ownPodFetch, fetch, publicFetch, ownFolders };
}

describe("createOwnPodFetch", () => {
  it("reads a document in the user's own folders as the user, never following a redirect", async () => {
    const { ownPodFetch, fetch, publicFetch, ownFolders } = setup(WEB_ID);
    const url = "https://alice.example/memo/releases/capitals/v1.ttl";
    expect(await (await ownPodFetch(url, { headers: { Accept: "text/turtle" } })).text()).toBe(
      "user",
    );
    expect(fetch).toHaveBeenCalledWith(url, {
      headers: { Accept: "text/turtle" },
      redirect: "error",
    });
    // An instance registered in another pod is the user's too.
    await ownPodFetch(new Request("https://shared.example/study/releases/capitals/v1.ttl"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(publicFetch).not.toHaveBeenCalled();
    expect(ownFolders).toHaveBeenCalledWith(WEB_ID);
  });

  it.each([
    "https://attacker.example/r.ttl",
    "https://alice.example.attacker.example/r.ttl",
    "https://alice.example@attacker.example/r.ttl",
    "https://alice.example:8443/r.ttl",
    "http://alice.example/r.ttl",
    "https://shared.example/study-evil/r.ttl",
    "https://shared.example/r.ttl",
    "https://alice.example/memo/a%2Fr.ttl",
  ])("reads %s as no one", async (url) => {
    const { ownPodFetch, fetch, publicFetch } = setup(WEB_ID);
    expect(await (await ownPodFetch(url, { method: "HEAD" })).text()).toBe("no one");
    expect(publicFetch).toHaveBeenCalledWith(url, { method: "HEAD" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads everything as no one when logged out, asking for no folders", async () => {
    const { ownPodFetch, fetch, publicFetch, ownFolders } = setup(undefined);
    await ownPodFetch("https://alice.example/memo/releases/capitals/v1.ttl");
    expect(publicFetch).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(ownFolders).not.toHaveBeenCalled();
  });
});
