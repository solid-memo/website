// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { POD_PROVIDERS } from "../packages/domain/src/podProvider.ts";
import { configurationUrl, main, providerProblems, run } from "./checkProviders.ts";

const PROVIDER = {
  id: "example",
  name: "Example Pods",
  oidcIssuer: "https://login.example/",
  signUpUrl: "https://example/sign-up",
};
const CONFIGURATION = "https://login.example/.well-known/openid-configuration";

/** A fetch that answers each URL from `answers`, in turn: a Response, or an error to throw. */
function fakeFetch(answers: Record<string, (Response | Error)[]>) {
  return vi.fn(async (input: string | URL | Request) => {
    const answer = answers[String(input)]?.shift();
    if (answer === undefined) throw new Error(`nothing for ${String(input)}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("configurationUrl", () => {
  it("puts the discovery document after the issuer, with or without its last slash", () => {
    expect(configurationUrl("https://login.example/")).toBe(CONFIGURATION);
    expect(configurationUrl("https://login.example")).toBe(CONFIGURATION);
  });
});

describe("providerProblems", () => {
  it("finds none when the issuer matches and the sign-up page answers", async () => {
    const fetch = fakeFetch({
      [CONFIGURATION]: [json({ issuer: "https://login.example/" })],
      "https://example/sign-up": [new Response("<html>", { status: 200 })],
    });
    expect(await providerProblems(PROVIDER, fetch)).toEqual([]);
  });

  it("reads no sign-up page for a provider that has none", async () => {
    const fetch = fakeFetch({ [CONFIGURATION]: [json({ issuer: "https://login.example/" })] });
    const { signUpUrl: _, ...withoutSignUp } = PROVIDER;
    expect(await providerProblems(withoutSignUp, fetch)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("names an issuer that differs, even by its last slash, or is missing", async () => {
    const differs = fakeFetch({
      [CONFIGURATION]: [json({ issuer: "https://login.example" })],
      "https://example/sign-up": [new Response("")],
    });
    expect(await providerProblems(PROVIDER, differs)).toEqual([
      'Example Pods: its issuer is "https://login.example", not "https://login.example/".',
    ]);
    const missing = fakeFetch({
      [CONFIGURATION]: [json(null)],
      "https://example/sign-up": [new Response("")],
    });
    expect(await providerProblems(PROVIDER, missing)).toEqual([
      'Example Pods: its issuer is null, not "https://login.example/".',
    ]);
  });

  it("says when the issuer answers no JSON, an error status, or not at all", async () => {
    const html = fakeFetch({
      [CONFIGURATION]: [new Response("<html>")],
      "https://example/sign-up": [new Response("", { status: 404 })],
    });
    expect(await providerProblems(PROVIDER, html)).toEqual([
      `Example Pods: ${CONFIGURATION} does not answer JSON.`,
      "Example Pods: its sign-up page https://example/sign-up answers 404.",
    ]);
    const gone = fakeFetch({
      [CONFIGURATION]: [json({}, 410)],
      "https://example/sign-up": [
        new TypeError("a"),
        new TypeError("b"),
        new TypeError("fetch failed"),
      ],
    });
    expect(await providerProblems(PROVIDER, gone)).toEqual([
      `Example Pods: ${CONFIGURATION} answers 410.`,
      "Example Pods: its sign-up page https://example/sign-up does not answer (fetch failed).",
    ]);
  });

  it("tries a request that fails or answers 5xx again, three times in all", async () => {
    const recovers = fakeFetch({
      [CONFIGURATION]: [
        new TypeError("fetch failed"),
        json({}, 503),
        json({ issuer: "https://login.example/" }),
      ],
      "https://example/sign-up": [new Response("")],
    });
    expect(await providerProblems(PROVIDER, recovers)).toEqual([]);
    const stays = fakeFetch({
      [CONFIGURATION]: [json({}, 502), json({}, 502), json({}, 502)],
      "https://example/sign-up": [new Response("")],
    });
    expect(await providerProblems(PROVIDER, stays)).toEqual([
      `Example Pods: ${CONFIGURATION} answers 502.`,
    ]);
    const down = fakeFetch({
      [CONFIGURATION]: [new TypeError("a"), new TypeError("b"), new TypeError("fetch failed")],
      "https://example/sign-up": [new Response("")],
    });
    expect(await providerProblems(PROVIDER, down)).toEqual([
      `Example Pods: ${CONFIGURATION} does not answer (fetch failed).`,
    ]);
  });

  it("names a thrown value that is not an Error as it is", async () => {
    const fetch = vi.fn(async () => {
      throw "offline";
    }) as unknown as typeof globalThis.fetch;
    const { signUpUrl: _, ...withoutSignUp } = PROVIDER;
    expect(await providerProblems(withoutSignUp, fetch)).toEqual([
      `Example Pods: ${CONFIGURATION} does not answer (offline).`,
    ]);
  });
});

describe("main", () => {
  it("says every provider answers, and exits 0", async () => {
    const logs: string[] = [];
    const fetch = fakeFetch({
      [CONFIGURATION]: [json({ issuer: "https://login.example/" })],
      "https://example/sign-up": [new Response("")],
    });
    expect(await main({ providers: [PROVIDER], fetch, log: (m) => logs.push(m) })).toBe(0);
    expect(logs).toEqual(["All 1 Pod providers answer with the issuer onboarding names."]);
  });

  it("logs each problem, and exits 1", async () => {
    const logs: string[] = [];
    const fetch = fakeFetch({
      [CONFIGURATION]: [json({ issuer: "https://elsewhere/" })],
      "https://example/sign-up": [new Response("")],
    });
    expect(await main({ providers: [PROVIDER], fetch, log: (m) => logs.push(m) })).toBe(1);
    expect(logs).toEqual([
      'Example Pods: its issuer is "https://elsewhere/", not "https://login.example/".',
    ]);
  });
});

describe("run", () => {
  it("checks the providers onboarding suggests, with the global fetch", async () => {
    const issuers = new Map(
      POD_PROVIDERS.map((p) => [configurationUrl(p.oidcIssuer), p.oidcIssuer]),
    );
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const issuer = issuers.get(String(input));
      return issuer === undefined ? new Response("") : json({ issuer });
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const process: { exitCode?: number | string | null } = {};
    await run(process);
    expect(process.exitCode).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(
      POD_PROVIDERS.length + POD_PROVIDERS.filter((p) => p.signUpUrl !== undefined).length,
    );
    fetch.mockRestore();
    log.mockRestore();
  });
});
