// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash, createPublicKey, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dpopProof, newDpopKey, sessionClient, type Session } from "./signedIn.ts";

const decode = <T = object>(part: string) =>
  JSON.parse(Buffer.from(part, "base64url").toString()) as T;

describe("dpopProof", () => {
  const key = newDpopKey();
  const proof = (token?: string) =>
    dpopProof(key, "PUT", "https://pod.example/a.ttl?x=1#y", token).split(".");

  it("names the request without its query or fragment", () => {
    expect(decode(proof()[1]!)).toMatchObject({ htu: "https://pod.example/a.ttl", htm: "PUT" });
  });

  it("carries its public key alone", () => {
    const { typ, alg, jwk } = decode<{ typ: string; alg: string; jwk: object }>(proof()[0]!);
    expect({ typ, alg }).toEqual({ typ: "dpop+jwt", alg: "ES256" });
    expect(jwk).toEqual(key.jwk);
    expect(jwk).not.toHaveProperty("d");
  });

  it("is signed by that key", () => {
    const [header, payload, signature] = proof();
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        {
          key: createPublicKey({ key: key.jwk as never, format: "jwk" }),
          dsaEncoding: "ieee-p1363",
        },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  });

  it("names the token only when a request sends one", () => {
    expect(decode(proof()[1]!)).not.toHaveProperty("ath");
    expect(decode(proof("token")[1]!)).toMatchObject({
      ath: createHash("sha256").update("token").digest("base64url"),
    });
  });

  it("is never the same twice", () => {
    expect(decode<{ jti: string }>(proof()[1]!).jti).not.toBe(
      decode<{ jti: string }>(proof()[1]!).jti,
    );
  });
});

describe("sessionClient", () => {
  const session: Session = {
    webId: "https://pod.example/card#me",
    issuer: "https://pod.example/",
    accessToken: "token",
    key: newDpopKey(),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sent() {
    const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response());
    vi.stubGlobal("fetch", send);
    return send;
  }

  it("adds the token and a proof of this request to what the caller made", async () => {
    const send = sent();
    await sessionClient(session).fetch("https://pod.example/a.ttl", {
      method: "patch",
      headers: { "content-type": "text/n3" },
    });
    const headers = new Headers(send.mock.calls[0]![1]!.headers);
    expect(headers.get("content-type")).toBe("text/n3");
    expect(headers.get("authorization")).toBe("DPoP token");
    expect(decode(headers.get("dpop")!.split(".")[1]!)).toMatchObject({
      htm: "PATCH",
      htu: "https://pod.example/a.ttl",
    });
  });

  it("reads a Request as well as a URL", async () => {
    const send = sent();
    await sessionClient(session).fetch(new Request("https://pod.example/b.ttl", { method: "PUT" }));
    const headers = new Headers(send.mock.calls[0]![1]!.headers);
    expect(decode(headers.get("dpop")!.split(".")[1]!)).toMatchObject({
      htm: "PUT",
      htu: "https://pod.example/b.ttl",
    });
  });

  it("says who is signed in, and where", async () => {
    const client = sessionClient(session);
    expect(client.webId()).toBe(session.webId);
    await expect(client.sessionIssuer()).resolves.toBe(session.issuer);
  });

  it("does no login of its own", () => {
    expect(() => sessionClient(session).restore()).toThrow("keeps it");
  });
});
