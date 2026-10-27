// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { ReadLimitError } from "./interface";
import { limitedFetch, limitsOf, refusalOf, RELEASE_LIMITS } from "./readLimits";
import { parseQuads } from "./resources";

const URL_ = "https://other.example/release.ttl";
const LIMITS = { bytes: 10, quads: 5, characters: 100 };

/** A fetch answering with `body`, sent in chunks of `chunk` bytes, and whether it was canceled. */
function serving(body: string | null, { chunk = 4, headers = {} as Record<string, string> } = {}) {
  const sent = { canceled: false, chunks: 0 };
  const bytes = new TextEncoder().encode(body ?? "");
  const fetch: typeof globalThis.fetch = async () => {
    let at = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(at, at + chunk));
        sent.chunks++;
        at += chunk;
      },
      cancel() {
        sent.canceled = true;
      },
    });
    const response = new Response(body === null ? null : stream, {
      status: body === null ? 304 : 200,
      statusText: "As sent",
      headers: { "Content-Type": "text/turtle", ...headers },
    });
    Object.defineProperty(response, "url", { value: URL_ });
    return response;
  };
  return { fetch, sent };
}

describe("RELEASE_LIMITS", () => {
  it("leaves a wide margin over every release in the library: each a quarter of its bytes, triples and characters or less", async () => {
    const releases = readdirSync(DECKS_ROOT, { recursive: true, encoding: "utf8" }).filter((path) =>
      /(^|\/)v[0-9]+\.ttl$/.test(path),
    );
    expect(releases.length).toBeGreaterThan(100);
    const { bytes, quads, characters } = RELEASE_LIMITS;
    const quarter = { bytes: bytes / 4, quads: quads / 4, characters: characters / 4 };
    for (const path of releases) {
      const file = join(DECKS_ROOT, path);
      expect(statSync(file).size, path).toBeLessThan(quarter.bytes);
      const url = `https://solid-memo.example/decks/${path}`;
      await expect(
        parseQuads(readFileSync(file, "utf8"), "turtle", url, quarter),
        path,
      ).resolves.toBeDefined();
    }
  });
});

describe("limitedFetch", () => {
  it("gives a body within the limit as sent, its status, headers and URL kept, with its limits", async () => {
    const { fetch } = serving("0123456789");
    const response = await limitedFetch(fetch, LIMITS)(URL_);
    expect(response).toMatchObject({ status: 200, statusText: "As sent", url: URL_ });
    expect(response.headers.get("Content-Type")).toBe("text/turtle");
    expect(await response.text()).toBe("0123456789");
    expect(limitsOf(response)).toBe(LIMITS);
    expect(refusalOf(response)).toBeUndefined();
  });

  it("fails a body once it is past the limit, and stops reading it", async () => {
    const { fetch, sent } = serving("0123456789".repeat(100));
    const response = await limitedFetch(fetch, LIMITS)(URL_);
    // The browser fails the read as it fails any; why is kept apart.
    await expect(response.text()).rejects.toBeDefined();
    expect(refusalOf(response)).toBeInstanceOf(ReadLimitError);
    expect(refusalOf(response)).toMatchObject({ url: URL_, limits: LIMITS });
    expect(sent.chunks).toBeLessThan(10);
    await vi.waitFor(() => expect(sent.canceled).toBe(true));
  });

  it("fails at once where the Content-Length says the body is past the limit, and reads none of it", async () => {
    const { fetch, sent } = serving("0123456789".repeat(100), {
      headers: { "Content-Length": "1000" },
    });
    await expect(limitedFetch(fetch, LIMITS)(URL_)).rejects.toBeInstanceOf(ReadLimitError);
    expect(sent.canceled).toBe(true);
  });

  it("gives an answer with no body as it is", async () => {
    const { fetch } = serving(null);
    const response = await limitedFetch(fetch, LIMITS)(URL_);
    expect(response.status).toBe(304);
    expect(limitsOf(response)).toBeUndefined();
    expect(refusalOf(undefined)).toBeUndefined();
  });
});
