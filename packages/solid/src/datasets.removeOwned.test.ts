// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { PreconditionFailedError, removeOwned } from "./datasets";
import { MAX_PATCH_BYTES } from "./client/sparqlUpdate";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { subjectsOfClasses } from "./ownership";

const ROOT = "https://pod.example/";
const DOC = `${ROOT}solid-memo/main/decks/deck-1.ttl`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const SAYS = "https://other.example/says";
const cards = subjectsOfClasses(`${SM}Card`);

/**
 * A pod in memory, every request but a read recorded with its If-Match;
 * `etags` false strips the ETag from every answer, as a pod that gives
 * none; `fail` answers the next requests of a method with a status
 * instead, once each.
 */
async function pod({ etags = true } = {}) {
  const store = createMemoryResourceStore();
  let versions = 0;
  const local = createLocalPod({ root: ROOT, store, newEtag: () => `"e${++versions}"` });
  const sent: { method: string; ifMatch: string | null; body: string }[] = [];
  const failures: { method: string; status: number }[] = [];
  const fetch = (async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const at = failures.findIndex((failure) => failure.method === method);
    if (at >= 0) {
      const [failure] = failures.splice(at, 1);
      return new Response("refused", { status: failure!.status });
    }
    if (method !== "GET" && method !== "HEAD") {
      sent.push({
        method,
        ifMatch: new Headers(init?.headers).get("If-Match"),
        body: typeof init?.body === "string" ? init.body : "",
      });
    }
    const response = await local(String(input), init);
    if (!etags) response.headers.delete("ETag");
    return response;
  }) as typeof globalThis.fetch;
  const put = async (body: string, type = "text/turtle") => {
    const response = await local(DOC, { method: "PUT", headers: { "Content-Type": type }, body });
    expect(response.ok).toBe(true);
  };
  const text = async () => {
    const response = await local(DOC);
    return response.status === 404 ? null : response.text();
  };
  const fail = (method: string, status: number) => failures.push({ method, status });
  return { fetch, put, text, sent, fail };
}

const card = (id: string, version = 6) =>
  `<#${id}> a <${SM}Card> ; <${SM}front> "${id}" ; <${SM}formatVersion> ${version} .`;
const foreign = `<#recipe> <${SAYS}> "kept" .`;

describe("removeOwned", () => {
  it("deletes a document that holds only what is Solid Memo's, If-Match its read", async () => {
    const p = await pod();
    await p.put(`${card("c1")}\n${card("c2")}`);
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("deleted");
    expect(p.sent).toEqual([{ method: "DELETE", ifMatch: '"e1"', body: "" }]);
    expect(await p.text()).toBeNull();
  });

  it("takes only Solid Memo's subjects out of a document that holds another app's too, If-Match its read", async () => {
    const p = await pod();
    await p.put(`${card("c1")}\n${foreign}`);
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    expect(p.sent.map(({ method, ifMatch }) => [method, ifMatch])).toEqual([["PATCH", '"e1"']]);
    expect(p.sent[0]!.body).toMatch(/^DELETE DATA \{/);
    const left = await p.text();
    expect(left).toContain(SAYS);
    expect(left).not.toContain(`${SM}Card`);
  });

  it("writes what is left whole, If-Match, when a blank node goes, and keeps one another app's subject names", async () => {
    const p = await pod();
    await p.put(
      `<#c1> a <${SM}Card> ; <${SM}front> "c1" ; <${SM}note> [ <${SM}text> "gone with it" ] .
${foreign}
<#recipe> <${SAYS}-step> [ <${SAYS}-text> "stays" ] .`,
    );
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    expect(p.sent.map(({ method, ifMatch }) => [method, ifMatch])).toEqual([["PUT", '"e1"']]);
    const left = (await p.text())!;
    expect(left).toContain("stays");
    expect(left).not.toContain("gone with it");
    expect(left).not.toContain(`${SM}Card`);
  });

  it("deletes a blank node only Solid Memo's subjects name with them, and the document when that is all", async () => {
    const p = await pod();
    await p.put(
      `<#c1> a <${SM}Card> ; <${SM}note> _:shared , [ <${SM}text> [ <${SM}more> "deep" ] ] .
<#c2> a <${SM}Card> ; <${SM}note> _:shared ; <http://purl.org/dc/terms/creator> <https://elsewhere.example/#me> .
_:shared <${SM}text> "named by both" .`,
    );
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("deleted");
    expect(p.sent.map(({ method }) => method)).toEqual(["DELETE"]);
  });

  it("keeps a document that is not RDF, sending nothing", async () => {
    const p = await pod();
    await p.put("not turtle at all", "text/plain");
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    expect(p.sent).toEqual([]);
  });

  it("keeps a document with nothing of Solid Memo's in it, sending nothing", async () => {
    const p = await pod();
    await p.put(foreign);
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    expect(p.sent).toEqual([]);
  });

  it("keeps a document outside the user's own pod, which the app's fetch never writes to", async () => {
    const p = await pod();
    await p.put(card("c1"));
    const gated = (async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") throw new AppError("writeOutsidePod", { host: "pod.example" });
      return p.fetch(input, init);
    }) as typeof globalThis.fetch;
    await expect(removeOwned(DOC, cards, gated)).resolves.toBe("kept");
    expect(await p.text()).toContain("c1");
    // Any other refusal is the caller's.
    const refused = (async () => {
      throw new AppError("writeRefused", { method: "GET", url: DOC });
    }) as typeof globalThis.fetch;
    await expect(removeOwned(DOC, cards, refused)).rejects.toMatchObject({ code: "writeRefused" });
  });

  it("finds a document that is gone absent, sending nothing, and throws on a read that fails", async () => {
    const p = await pod();
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("absent");
    expect(p.sent).toEqual([]);
    await p.put(card("c1"));
    p.fail("GET", 500);
    await expect(removeOwned(DOC, cards, p.fetch)).rejects.toThrow();
    expect(p.sent).toEqual([]);
  });

  it("counts a document gone between its read and its delete as deleted", async () => {
    const p = await pod();
    await p.put(card("c1"));
    p.fail("DELETE", 404);
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("deleted");
    p.fail("DELETE", 500);
    await expect(removeOwned(DOC, cards, p.fetch)).rejects.toThrow();
  });

  it("reads again and removes again on a 412, and throws PreconditionFailedError on a second", async () => {
    const p = await pod();
    await p.put(`${card("c1")}\n${foreign}`);
    p.fail("PATCH", 412);
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    expect(p.sent.map(({ method }) => method)).toEqual(["PATCH"]);
    expect(await p.text()).not.toContain(`${SM}Card`);

    await p.put(card("c2"));
    p.fail("DELETE", 412);
    p.fail("DELETE", 412);
    const error = await removeOwned(DOC, cards, p.fetch).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(PreconditionFailedError);
    expect(error).toMatchObject({ code: "changedElsewhere", vars: { url: DOC } });
    expect(await p.text()).toContain(`${SM}Card`);
  });

  it("never removes a subject a newer version of the app wrote", async () => {
    const p = await pod();
    await p.put(`${card("c1")}\n${card("c2", 99)}`);
    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    const left = (await p.text())!;
    expect(left).toContain('"c2"');
    expect(left).not.toContain('"c1"');

    await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
    expect(p.sent).toHaveLength(1);
  });

  describe("on a pod that gives no ETag", () => {
    it("deletes and takes subjects out without If-Match", async () => {
      const p = await pod({ etags: false });
      await p.put(`${card("c1")}\n${foreign}`);
      await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
      await p.put(card("c1"));
      await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("deleted");
      expect(p.sent.map(({ method, ifMatch }) => [method, ifMatch])).toEqual([
        ["PATCH", null],
        ["DELETE", null],
      ]);
    });

    it("keeps a document whose blank nodes would need a whole PUT, sending nothing", async () => {
      const p = await pod({ etags: false });
      await p.put(`<#c1> a <${SM}Card> ; <${SM}note> [ <${SM}text> "x" ] .\n${foreign}`);
      await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
      expect(p.sent).toEqual([]);
      expect(await p.text()).toContain(`${SM}Card`);
    });

    it("keeps a document whose removal is too large for one PATCH, sending nothing", async () => {
      const p = await pod({ etags: false });
      const many = Array.from({ length: Math.ceil(MAX_PATCH_BYTES / 100) }, (_, n) =>
        card(`c${n}-${"x".repeat(40)}`),
      );
      await p.put(`${many.join("\n")}\n${foreign}`);
      await expect(removeOwned(DOC, cards, p.fetch)).resolves.toBe("kept");
      expect(p.sent).toEqual([]);
    });
  });
});
