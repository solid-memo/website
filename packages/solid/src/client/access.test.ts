// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { accessContract } from "../testing/contract/access";
import { accessFetch, grantPublicRead } from "./access";

accessContract(grantPublicRead);

const RELEASE = "https://alice.example/solid-memo/main/releases/solid/v1.ttl";

describe("accessFetch", () => {
  it('puts a space before each "." that ends a statement in a PATCH, after an IRI or a string', async () => {
    const fetch = vi.fn(async () => new Response(null));
    const spaced = accessFetch(fetch);
    await spaced(RELEASE, {
      method: "PATCH",
      body: 'INSERT DATA {<#a> <#b> <#c>.\n<#a> <#d> "x.y\\".", "z".}',
    });
    expect(fetch).toHaveBeenLastCalledWith(RELEASE, {
      method: "PATCH",
      body: 'INSERT DATA {<#a> <#b> <#c> .\n<#a> <#d> "x.y\\".", "z" .}',
    });
    await spaced(RELEASE, { method: "PUT", body: "<#a> <#b> <#c>." });
    expect(fetch).toHaveBeenLastCalledWith(RELEASE, { method: "PUT", body: "<#a> <#b> <#c>." });
  });

  it("asks for Turtle on a read that asks for nothing, as the app reads a folder, and leaves an Accept given be", async () => {
    const fetch = vi.fn(async () => new Response(null));
    await accessFetch(fetch)(RELEASE, { method: "HEAD" });
    expect(fetch).toHaveBeenLastCalledWith(RELEASE, {
      method: "HEAD",
      headers: { accept: "text/turtle, */*;q=0.1" },
    });
    await accessFetch(fetch)(RELEASE, { headers: { Accept: "application/ld+json" } });
    expect(fetch).toHaveBeenLastCalledWith(RELEASE, { headers: { Accept: "application/ld+json" } });
  });

  it("reads an Access Control Resource not written yet as one that says only what it is, and leaves every other answer be", async () => {
    const ACR = `${RELEASE}.acr`;
    const type = '<http://www.w3.org/ns/solid/acp#AccessControlResource>; rel="type"';
    const answers: Record<string, Response> = {
      [ACR]: new Response("Not found", { status: 404, headers: { Link: type } }),
      [RELEASE]: new Response("Not found", { status: 404 }),
    };
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const answer = answers[String(input)]!;
      Object.defineProperty(answer, "url", { value: String(input) });
      return answer;
    });
    const read = await accessFetch(fetch)(ACR);
    expect(read.status).toBe(200);
    expect(read.url).toBe(ACR);
    expect(read.headers.get("Link")).toBe(type);
    expect(await read.text()).toBe("<> a <http://www.w3.org/ns/solid/acp#AccessControlResource> .");
    expect((await accessFetch(fetch)(RELEASE)).status).toBe(404);
    answers[ACR] = new Response(null, { status: 404, headers: { Link: type } });
    const head = await accessFetch(fetch)(ACR, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    answers[ACR] = new Response(null, { status: 404, headers: { Link: type } });
    expect((await accessFetch(fetch)(ACR, { method: "PUT", body: "" })).status).toBe(404);
  });

  it("drops a Link header past its bound from every answer, so the library never parses it", async () => {
    const long = `<a>; rel="x"${"\t".repeat(250_000)}x`;
    const fetch = vi.fn(async () => new Response(null, { headers: { Link: long } }));
    expect((await accessFetch(fetch)(RELEASE)).headers.get("Link")).toBeNull();
    const patched = await accessFetch(fetch)(RELEASE, { method: "PATCH", body: "" });
    expect(patched.headers.get("Link")).toBeNull();
    expect(await grantPublicRead(RELEASE, { fetch })).toBe(false);
  }, 5_000);
});
