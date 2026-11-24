// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { buildThing, createSolidDataset, createThing, type Dataset, setThing } from "./client/rdf";
import { editDocument, PreconditionFailedError, readDataset, statusOf } from "./datasets";
import { fakePod } from "./testing/fakePod";

const DOC = "https://pod.example/doc.ttl";
const N = "https://example.com/ns#n";

/** The dataset with `<#it>` saying `n`, in place of what it said. */
const withN = (dataset: Dataset, n: string) =>
  setThing(
    dataset,
    buildThing(createThing({ url: `${DOC}#it` }))
      .addStringNoLocale(N, n)
      .build(),
  );

async function podWithDoc() {
  const pod = fakePod();
  await pod.put(DOC, `<#it> <${N}> "1" .`);
  return pod;
}

const writesOf = (pod: ReturnType<typeof fakePod>) =>
  pod.requests.filter(({ method }) => method !== "GET" && method !== "HEAD");

describe("editDocument", () => {
  it("writes nothing for an edit that changes nothing, and gives what it says", async () => {
    const pod = await podWithDoc();
    const result = await editDocument(DOC, pod.fetch, () => ({ result: "same" }));
    expect(result).toBe("same");
    expect(writesOf(pod)).toEqual([]);
  });

  it("saves the edit If-Match the read, and gives what it says", async () => {
    const pod = await podWithDoc();
    const etag = pod.etag(DOC);
    const result = await editDocument(DOC, pod.fetch, (read) => ({
      dataset: withN(read!, "2"),
      result: "saved",
    }));
    expect(result).toBe("saved");
    expect(writesOf(pod)).toEqual([expect.objectContaining({ method: "PATCH", ifMatch: etag })]);
    expect(pod.triples(DOC)).toEqual([`<${DOC}#it> <${N}> "2" .`]);
  });

  it("saves a whole edit as one PUT", async () => {
    const pod = await podWithDoc();
    await editDocument(DOC, pod.fetch, (read) => ({
      dataset: withN(read!, "2"),
      whole: true,
      result: undefined,
    }));
    expect(writesOf(pod)).toEqual([expect.objectContaining({ method: "PUT" })]);
  });

  it("reads a document not there as null, and makes it only where there is none", async () => {
    const pod = fakePod();
    await editDocument(DOC, pod.fetch, (read) => {
      expect(read).toBeNull();
      return { dataset: withN(createSolidDataset(), "1"), result: undefined };
    });
    expect(writesOf(pod)).toEqual([expect.objectContaining({ ifNoneMatch: "*" })]);
  });

  it("checks the subjects an edit names, as an instance's, before it saves", async () => {
    const pod = await podWithDoc();
    const checkWrite = vi.fn(async () => undefined);
    await editDocument(
      DOC,
      pod.fetch,
      (read) => ({ dataset: withN(read!, "2"), subjects: [`${DOC}#it`], result: undefined }),
      { checkWrite },
    );
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [`${DOC}#it`], "pod");
  });

  it("checks nothing for an edit that names no subjects", async () => {
    const pod = await podWithDoc();
    const checkWrite = vi.fn(async () => undefined);
    await editDocument(DOC, pod.fetch, (read) => ({ dataset: withN(read!, "2"), result: 1 }), {
      checkWrite,
    });
    expect(checkWrite).not.toHaveBeenCalled();
  });

  it("sends nothing an edit's check refuses, and throws what it refused with", async () => {
    const pod = await podWithDoc();
    const refused = new Error("refused");
    await expect(
      editDocument(
        DOC,
        pod.fetch,
        (read) => ({ dataset: withN(read!, "2"), subjects: [`${DOC}#it`], result: undefined }),
        {
          checkWrite: async () => {
            throw refused;
          },
        },
      ),
    ).rejects.toBe(refused);
    expect(writesOf(pod)).toEqual([]);
  });

  it("reads the document again and makes the edit again when it changed meanwhile, so the change is kept", async () => {
    const pod = await podWithDoc();
    // Someone else writes the document between the read and the save.
    pod.failNext("PATCH", DOC, 412, () => pod.touch(DOC));
    const seen: number[] = [];
    await editDocument(DOC, pod.fetch, (read) => {
      seen.push(seen.length + 1);
      return { dataset: withN(read!, "2"), result: undefined };
    });
    expect(seen).toEqual([1, 2]);
    expect(pod.triples(DOC)).toEqual([`<${DOC}#it> <${N}> "2" .`]);
  });

  it("throws the last 412 once every attempt met one, three by default", async () => {
    const pod = await podWithDoc();
    for (let i = 0; i < 3; i++) pod.failNext("PATCH", DOC, 412);
    const edit = vi.fn((read: Dataset | null) => ({ dataset: withN(read!, "2"), result: 1 }));
    await expect(editDocument(DOC, pod.fetch, edit)).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
    expect(edit).toHaveBeenCalledTimes(3);
  });

  it("makes as many attempts as asked, waiting before each one after the first", async () => {
    const pod = await podWithDoc();
    for (let i = 0; i < 4; i++) pod.failNext("PATCH", DOC, 412);
    const pause = vi.fn(async () => undefined);
    const result = await editDocument(
      DOC,
      pod.fetch,
      (read) => ({ dataset: withN(read!, "2"), result: "fifth" }),
      { attempts: 5, pause },
    );
    expect(result).toBe("fifth");
    expect(pause.mock.calls).toEqual([[2], [3], [4], [5]]);
  });

  it("throws what the edit throws at once, a PreconditionFailedError too, and tries nothing again", async () => {
    const pod = await podWithDoc();
    const taken = new PreconditionFailedError(DOC, "absent");
    const edit = vi.fn(() => {
      throw taken;
    });
    await expect(editDocument(DOC, pod.fetch, edit)).rejects.toBe(taken);
    expect(edit).toHaveBeenCalledTimes(1);
    expect(writesOf(pod)).toEqual([]);
  });

  it("throws any other failure of the write at once", async () => {
    const pod = await podWithDoc();
    pod.failNext("PATCH", DOC, 500);
    const edit = vi.fn((read: Dataset | null) => ({ dataset: withN(read!, "2"), result: 1 }));
    const error = await editDocument(DOC, pod.fetch, edit).catch((e: unknown) => e);
    expect(statusOf(error)).toBe(500);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("throws what `failure` makes of a write that fails for good, the last 412 among them", async () => {
    const pod = await podWithDoc();
    pod.failNext("PATCH", DOC, 412);
    const failure = vi.fn((error: unknown) => ({ wrapped: error }));
    const thrown = await editDocument(
      DOC,
      pod.fetch,
      (read) => ({ dataset: withN(read!, "2"), result: 1 }),
      { attempts: 1, failure },
    ).catch((e: unknown) => e);
    expect(thrown).toEqual({ wrapped: expect.any(PreconditionFailedError) });
  });

  it("reads the document with `read`, which may throw where it is not there", async () => {
    const pod = fakePod();
    const edit = vi.fn();
    const error = await editDocument(DOC, pod.fetch, edit, { read: readDataset }).catch(
      (e: unknown) => e,
    );
    expect(statusOf(error)).toBe(404);
    expect(edit).not.toHaveBeenCalled();
  });
});
