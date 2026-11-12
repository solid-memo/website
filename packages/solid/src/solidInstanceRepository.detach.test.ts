// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createOwnPodGate } from "./ownPodGate";
import { createSolidInstanceRepository } from "./solidInstanceRepository";

const ROOT = "https://pod.example/";
const WEBID = `${ROOT}profile/card#me`;
const INDEX = `${ROOT}settings/privateTypeIndex.ttl`;
const FOREIGN = "https://elsewhere.example/inst/";
const META = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#>.
@prefix dcterms: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
<${FOREIGN}meta.ttl#it> a sm:Instance; dcterms:title "Shared decks";
  dcterms:created "2026-11-01T00:00:00.000Z"^^xsd:dateTime; sm:formatVersion 1.`;
const TURTLE = { "content-type": "text/turtle" };

/** How the other server answers once the instance is attached. */
type Answer = (method: string, url: string) => Response;

const ANSWERS: Record<string, Answer> = {
  "a failed catalog read": () => new Response("no", { status: 500 }),
  "a refused delete": (method, url) => {
    if (method === "DELETE") return new Response("no", { status: 403 });
    if (url === `${FOREIGN}meta.ttl`) return new Response(META, { headers: TURTLE });
    return new Response("no", { status: 404 });
  },
  "a server that is gone": () => {
    throw new TypeError("Failed to fetch");
  },
};

/**
 * The real repository, type index code and credential gate, over a pod
 * in memory and a server elsewhere that answers as `answer` says once
 * the instance is attached; what it was asked is in `asked`.
 */
async function attached(answer: Answer) {
  let etags = 0;
  const pod = createLocalPod({
    root: ROOT,
    store: createMemoryResourceStore(),
    newEtag: () => `"e${++etags}"`,
  });
  await pod(`${ROOT}profile/card`, {
    method: "PUT",
    headers: TURTLE,
    body: `<#me> <http://www.w3.org/ns/pim/space#storage> <${ROOT}>;
      <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${INDEX}>.`,
  });
  await pod(INDEX, {
    method: "PUT",
    headers: TURTLE,
    body: `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument>.`,
  });
  const asked: string[] = [];
  let answering = false;
  const network =
    (as: string): typeof globalThis.fetch =>
    async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(ROOT)) return pod(url, init);
      const method = (init?.method ?? "GET").toUpperCase();
      asked.push(`${method} ${url} as ${as}`);
      if (answering) return answer(method, url);
      return new Response(META, { headers: TURTLE });
    };
  const user = network("the user");
  const noOne = network("no one");
  const repository = createSolidInstanceRepository({
    fetch: user,
    publicFetch: noOne,
    // The app's credential gate (appUseCases.ts).
    dataFetch: createOwnPodGate({
      fetch: user,
      instanceFetch: user,
      publicFetch: noOne,
      webId: () => WEBID,
      ownFolders: async (webId) => ({
        storages: [ROOT],
        instances: (await repository.listInstances(webId)).map(({ url }) => url),
      }),
      revision: () => 0,
    }),
    now: () => new Date(),
    randomId: () => "r1",
  });
  const instance = await repository.attachInstance({
    webId: WEBID,
    instanceUrl: FOREIGN,
    registrationTarget: "private",
  });
  answering = true;
  asked.length = 0;
  return { repository, instance, asked };
}

describe("an instance on a server that fails or refuses the delete", () => {
  const listed = async (repository: Awaited<ReturnType<typeof attached>>["repository"]) =>
    (await repository.listInstances(WEBID)).map(({ url }) => url);

  for (const [name, answer] of Object.entries(ANSWERS)) {
    it(`stays listed after a delete meeting ${name}, and is removed all the same, nothing sent there`, async () => {
      const { repository, instance, asked } = await attached(answer);

      await expect(repository.deleteInstance({ webId: WEBID, instance })).rejects.toBeDefined();
      expect(await listed(repository)).toEqual([FOREIGN]);

      asked.length = 0;
      await repository.detachInstance({ webId: WEBID, instance });

      expect(asked).toEqual([]);
      expect(await listed(repository)).toEqual([]);
      expect(asked).toEqual([]);
    });
  }
});

describe("an instance while one of the user's type indexes fails", () => {
  const PRIVATE = `${ROOT}settings/private.ttl`;
  const PUBLIC = `${ROOT}settings/public.ttl`;
  const NONE = `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>.`;
  const REGISTERED = `${NONE}
    <#memo> a <http://www.w3.org/ns/solid/terms#TypeRegistration>;
      <http://www.w3.org/ns/solid/terms#forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
      <http://www.w3.org/ns/solid/terms#instanceContainer> <${FOREIGN}>.`;

  /**
   * The real repository over a pod in memory, with an index that holds
   * `body`, is missing (null), or answers `failing` until its `status`
   * is cleared.
   */
  async function indexes(
    bodies: { private: string | null; public: string | null },
    failing?: { url: string; status?: number },
  ) {
    let etags = 0;
    const pod = createLocalPod({
      root: ROOT,
      store: createMemoryResourceStore(),
      newEtag: () => `"e${++etags}"`,
    });
    const put = (url: string, body: string) => pod(url, { method: "PUT", headers: TURTLE, body });
    await put(
      `${ROOT}profile/card`,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <${ROOT}>;
        <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${PRIVATE}>;
        <http://www.w3.org/ns/solid/terms#publicTypeIndex> <${PUBLIC}>.`,
    );
    if (bodies.private !== null) await put(PRIVATE, bodies.private);
    if (bodies.public !== null) await put(PUBLIC, bodies.public);
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (failing?.status !== undefined && url === failing.url)
        return new Response("no", { status: failing.status });
      return pod(url, init);
    };
    return createSolidInstanceRepository({
      fetch,
      publicFetch: fetch,
      now: () => new Date(),
      randomId: () => "r1",
    });
  }
  const instance = { url: FOREIGN, name: "Shared decks" };
  const listed = async (repository: Awaited<ReturnType<typeof indexes>>) =>
    (await repository.listInstances(WEBID)).map(({ url }) => url);

  it("says an instance kept after its removal is there, when a new one is made in its folder", async () => {
    const repository = await indexes({ private: NONE, public: NONE });
    const args = {
      webId: WEBID,
      containerUrl: `${ROOT}memo/`,
      name: "Mine",
      registrationTarget: "private" as const,
    };
    const made = await repository.createInstance(args);
    await repository.detachInstance({ webId: WEBID, instance: made });

    await expect(repository.createInstance(args)).rejects.toMatchObject({
      code: "instanceAlreadyThere",
    });
  });

  it("removes it from the public index when the private one is missing", async () => {
    const repository = await indexes({ private: null, public: REGISTERED });

    await repository.detachInstance({ webId: WEBID, instance });

    expect(await listed(repository)).toEqual([]);
  });

  it("removes it from the private index when the public one is missing", async () => {
    const repository = await indexes({ private: REGISTERED, public: null });

    await repository.detachInstance({ webId: WEBID, instance });

    expect(await listed(repository)).toEqual([]);
  });

  it("removes it from the public index, and then says the private one failed", async () => {
    const failing: { url: string; status?: number } = { url: PRIVATE, status: 500 };
    const repository = await indexes({ private: NONE, public: REGISTERED }, failing);

    await expect(repository.detachInstance({ webId: WEBID, instance })).rejects.toBeDefined();

    // The list fails while an index can't be read, rather than leave out what it registers.
    await expect(listed(repository)).rejects.toBeDefined();
    failing.status = undefined;
    expect(await listed(repository)).toEqual([]);
  });

  it("removes it from the private index, and then says the public one failed", async () => {
    const failing: { url: string; status?: number } = { url: PUBLIC, status: 403 };
    const repository = await indexes({ private: REGISTERED, public: NONE }, failing);

    await expect(repository.detachInstance({ webId: WEBID, instance })).rejects.toBeDefined();

    // The list fails while an index can't be read, rather than leave out what it registers.
    await expect(listed(repository)).rejects.toBeDefined();
    failing.status = undefined;
    expect(await listed(repository)).toEqual([]);
  });
});
