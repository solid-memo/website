// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { triplesOf } from "../ntriples";

/**
 * A pod for tests: Turtle documents kept as sets of N-Triples lines, so
 * PUTs (any Turtle) and Solid Memo's PATCHes (one N-Triples line per
 * triple, see patchBody) apply as on a server. It answers as a Solid
 * server does: ETags that change on every write, 304 for If-None-Match
 * naming the current one, 412 for If-Match naming another or for
 * If-None-Match: * where a document is. Every request is recorded.
 */
export function fakePod() {
  const documents = new Map<string, { triples: Set<string>; etag: string }>();
  const requests: {
    method: string;
    url: string;
    ifMatch: string | null;
    ifNoneMatch: string | null;
    status: number;
  }[] = [];
  let versions = 0;
  const nextEtag = () => `"v${++versions}"`;
  /** Answers to give instead, once each, by method and URL. */
  const failures: { method: string; url: string; status: number; before?: () => void }[] = [];
  /** While set, reads wait for it. */
  let held: Promise<void> | null = null;

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const answer = (
      status: number,
      body: string | null = null,
      extra: Record<string, string> = {},
    ) => {
      requests.push({
        method,
        url,
        ifMatch: headers.get("If-Match"),
        ifNoneMatch: headers.get("If-None-Match"),
        status,
      });
      const response = new Response(
        status === 304 || status === 204 || status === 205 ? null : body,
        { status, headers: extra },
      );
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    const failure = failures.findIndex((f) => f.method === method && f.url === url);
    if (failure !== -1) {
      const [{ status, before }] = failures.splice(failure, 1);
      before?.();
      if (status !== 412) return answer(status, "failed");
      if (headers.get("If-Match") !== null || headers.get("If-None-Match") === "*")
        return answer(412);
    }
    if ((method === "GET" || method === "HEAD") && held !== null) await held;
    const doc = documents.get(url);
    if (method === "GET" || method === "HEAD") {
      if (doc === undefined) return answer(404, "");
      if (headers.get("If-None-Match") === doc.etag) return answer(304, null, { ETag: doc.etag });
      return answer(200, [...doc.triples].join("\n"), {
        "Content-Type": "text/turtle",
        ETag: doc.etag,
      });
    }
    const ifMatch = headers.get("If-Match");
    if (ifMatch !== null && ifMatch !== doc?.etag) return answer(412);
    if (headers.get("If-None-Match") === "*" && doc !== undefined) return answer(412);
    const body = String(init?.body ?? "");
    if (method === "PUT") {
      documents.set(url, { triples: await triplesOf(url, body), etag: nextEtag() });
      return answer(201);
    }
    if (method === "PATCH") {
      const triples = new Set(doc?.triples);
      let mode: "insert" | "delete" | null = null;
      for (const line of body.split("\n")) {
        if (line.startsWith("INSERT DATA")) mode = "insert";
        else if (line.startsWith("DELETE DATA")) mode = "delete";
        else if (line.endsWith(" .")) {
          const triple = resolved(url, line);
          if (mode === "insert") triples.add(triple);
          else triples.delete(triple);
        }
      }
      documents.set(url, { triples, etag: nextEtag() });
      return answer(205);
    }
    if (method === "DELETE") {
      documents.delete(url);
      return answer(205);
    }
    return answer(405);
  }) as typeof globalThis.fetch;

  return {
    fetch,
    requests,
    async put(url: string, turtle: string) {
      documents.set(url, { triples: await triplesOf(url, turtle), etag: nextEtag() });
    },
    /** The document as N-Triples lines; undefined when there is none. */
    triples(url: string): string[] | undefined {
      const doc = documents.get(url);
      return doc === undefined ? undefined : [...doc.triples].sort();
    },
    etag(url: string): string | undefined {
      return documents.get(url)?.etag;
    },
    /** Someone else writes the document: it gets a new version. */
    touch(url: string) {
      documents.get(url)!.etag = nextEtag();
    },
    /** The next request of that method to that URL is answered with `status` (412: as a changed document would be); `before` runs first. */
    failNext(method: string, url: string, status: number, before?: () => void) {
      failures.push({ method, url, status, before });
    },
    /** Reads wait until the returned function lets them go. */
    holdReads(): () => void {
      let release!: () => void;
      held = new Promise((resolve) => (release = resolve));
      return () => {
        held = null;
        release();
      };
    },
    clearRequests() {
      requests.length = 0;
    },
  };
}

/** A PATCH line with its relative IRIs (`<#x>`) made absolute. */
function resolved(url: string, line: string): string {
  return line.replace(/<(#[^>]*)>/g, (_, fragment: string) => `<${url}${fragment}>`);
}
