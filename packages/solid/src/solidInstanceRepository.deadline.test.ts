// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it } from "vitest";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { withReadDeadline } from "./readDeadline";
import { createSolidInstanceRepository } from "./solidInstanceRepository";

const ROOT = "https://pod.example/";
const WEBID = `${ROOT}profile/card#me`;
const PROFILE = `${ROOT}profile/card`;
const EXTENDED = `${ROOT}profile/extended`;
const PREFERENCES = `${ROOT}settings/prefs.ttl`;
const INDEX = `${ROOT}settings/privateTypeIndex.ttl`;
const INSTANCE = `${ROOT}memo/`;
const TURTLE = { "content-type": "text/turtle" };
const SOLID = "http://www.w3.org/ns/solid/terms#";
const STORAGE = `<#me> <http://www.w3.org/ns/pim/space#storage> <${ROOT}>`;
const INDEX_LINK = `<${WEBID}> <${SOLID}privateTypeIndex> <${INDEX}>.`;

/** Where the profile names the private type index: itself, an extended profile or the preferences file. */
const PROFILES = {
  profile: { [PROFILE]: `${STORAGE}; <${SOLID}privateTypeIndex> <${INDEX}>.` },
  "extended profile": {
    [PROFILE]: `${STORAGE}; <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${EXTENDED}>.`,
    [EXTENDED]: INDEX_LINK,
  },
  "preferences file": {
    [PROFILE]: `${STORAGE}; <http://www.w3.org/ns/pim/space#preferencesFile> <${PREFERENCES}>.`,
    [PREFERENCES]: INDEX_LINK,
  },
};

/**
 * The real repository and type index code over a pod in memory that
 * holds one instance, registered in the private type index, read under
 * the app's read deadline (shortened here): a read of `silent` is never
 * answered until `silent` is cleared, one of `stalling` is answered but
 * its body never ends, one of `failing` fails with `failure`, and
 * `missing` is not there.
 */
async function pod(
  profile: Record<string, string>,
  stalled: {
    silent?: string;
    stalling?: string;
    failing?: string;
    failure?: unknown;
    missing?: string;
  },
) {
  const store = createMemoryResourceStore();
  let etags = 0;
  const local = createLocalPod({
    root: ROOT,
    store,
    newEtag: () => `"e${++etags}"`,
  });
  const put = (url: string, body: string) => local(url, { method: "PUT", headers: TURTLE, body });
  for (const [url, body] of Object.entries(profile)) await put(url, body);
  await put(
    INDEX,
    `<> a <${SOLID}TypeIndex>.
    <#memo> a <${SOLID}TypeRegistration>;
      <${SOLID}forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
      <${SOLID}instanceContainer> <${INSTANCE}>.`,
  );
  await put(
    `${INSTANCE}meta.ttl`,
    `<#it> a <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
      <http://purl.org/dc/terms/title> "Mine".`,
  );
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === stalled.silent) return new Promise<Response>(() => {});
    if (url === stalled.missing) return new Response("", { status: 404 });
    if (url === stalled.failing) throw stalled.failure;
    if (url === stalled.stalling) return stallingAfter("@prefix s: <", TURTLE);
    return local(url, init);
  };
  const deadlined = withReadDeadline(fetch, 20);
  const repository = createSolidInstanceRepository({
    fetch: deadlined,
    publicFetch: deadlined,
    now: () => new Date(),
    randomId: () => "r1",
  });
  /** Every resource in the pod, as it is stored: a container without its version, which its members change. */
  const contents = async () =>
    Object.fromEntries(
      await Promise.all(
        (await store.urls()).map(async (url) => {
          const resource = await store.get(url);
          return [url, resource?.kind === "container" ? "container" : resource];
        }),
      ),
    );
  return Object.assign(repository, { contents });
}

/** A 200 whose body starts with `text` and then never sends another part. */
function stallingAfter(text: string, headers: Record<string, string>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
    },
  });
  return new Response(body, { status: 200, headers });
}

describe("listInstances while a document it is found by does not answer in time", () => {
  it.each([
    ["the private type index", PROFILES.profile, INDEX],
    ["an extended profile", PROFILES["extended profile"], EXTENDED],
    ["the preferences file", PROFILES["preferences file"], PREFERENCES],
  ])("fails, rather than list none, when %s does not answer", async (_, profile, url) => {
    const stalled: { silent?: string } = { silent: url };
    const repository = await pod(profile, stalled);

    await expect(repository.listInstances(WEBID)).rejects.toMatchObject({ code: "podNoAnswer" });

    stalled.silent = undefined;
    expect((await repository.listInstances(WEBID)).map(({ url }) => url)).toEqual([INSTANCE]);
  });

  it.each([
    ["the private type index", PROFILES.profile, INDEX],
    ["the preferences file", PROFILES["preferences file"], PREFERENCES],
  ])("fails when %s answers but its body does not come in time", async (_, profile, url) => {
    const repository = await pod(profile, { stalling: url });

    await expect(repository.listInstances(WEBID)).rejects.toMatchObject({ code: "podNoAnswer" });
  });

  it.each([
    ["an abort with a plain Error as its reason", new Error("cancelled")],
    [
      "a plain Error whose cause is no answer in time",
      new Error("wrapped", { cause: new AppError("podNoAnswer", { url: INDEX }) }),
    ],
    [
      "a plain Error whose cause is a network failure",
      new Error("wrapped", { cause: new TypeError("x") }),
    ],
  ])("fails when the private type index read fails with %s", async (_, failure) => {
    const repository = await pod(PROFILES.profile, { failing: INDEX, failure });

    await expect(repository.listInstances(WEBID)).rejects.toBe(failure);
  });

  it.each([
    ["the private type index", PROFILES.profile, INDEX],
    ["the preferences file", PROFILES["preferences file"], PREFERENCES],
  ])("lists none when %s is not there", async (_, profile, url) => {
    const repository = await pod(profile, { missing: url });

    await expect(repository.listInstances(WEBID)).resolves.toEqual([]);
  });

  it("makes no instance, type index or profile link while the preferences file does not answer", async () => {
    const repository = await pod(PROFILES["preferences file"], { silent: PREFERENCES });
    const before = await repository.contents();

    await expect(
      repository.createInstance({
        webId: WEBID,
        containerUrl: `${ROOT}other/`,
        name: "Other",
        registrationTarget: "private",
      }),
    ).rejects.toMatchObject({ code: "podNoAnswer" });
    // No second type index, no link to one, and no meta.ttl for the instance: what was written is taken back.
    const after = await repository.contents();
    expect(after).toEqual(before);
    expect(Object.keys(after)).not.toContain(`${ROOT}other/meta.ttl`);
  });
});
