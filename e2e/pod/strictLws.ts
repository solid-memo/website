// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run lws:strict -w @solid-memo/e2e-pod -- <server> <port>`: a proxy
 * on 127.0.0.1:<port> in front of a Linked Web Storage server that also
 * takes the Solid Protocol's requests (the Community Solid Server with
 * LWS, css-lws-only), which refuses what LWS Protocol 1.0 does not ask a
 * server to take, so that the end-to-end tests show what the app does
 * on a server that takes only LWS (docs/lws.md): a container listed in
 * Turtle (406; an LWS server lists one as `application/lws+json`), a
 * PUT of a resource not there (404; LWS makes one with a POST to its
 * container), and any PATCH (415; LWS requires only JSON Patch, which
 * the app does not send). The server must be told the proxy's URL as
 * its base URL. For a contributor's own runs; CI runs none.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/** What the proxy does with a request: send it on (with this Accept, if given), ask first whether it is there, or refuse it. */
export type Rule =
  | { send: true; accept?: string }
  | { sendIfThere: true }
  | { refuse: 404 | 406 | 415 };

const LWS_JSON = "application/lws+json";

/** The rule for a request: its method, its path, and its Accept header. */
export function ruleFor(method: string, path: string, accept: string | undefined): Rule {
  if ((method === "GET" || method === "HEAD") && path.endsWith("/")) {
    const asked = accept ?? "*/*";
    // A storage's description, at its URI, which is its root container's too, is sent on as asked for.
    if (asked.includes("application/lws+cid")) return { send: true };
    if (asked.includes(LWS_JSON) || asked.includes("*/*")) return { send: true, accept: LWS_JSON };
    return { refuse: 406 };
  }
  if (method === "PATCH") return { refuse: 415 };
  if (method === "PUT") return { sendIfThere: true };
  return { send: true };
}

/** The headers of a response a proxy may pass on as they are (fetch has undone its encoding and length). */
const DROPPED = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

async function bodyOf(request: IncomingMessage): Promise<Blob | undefined> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for await (const chunk of request) chunks.push(new Uint8Array(chunk as Buffer));
  return chunks.length === 0 ? undefined : new Blob(chunks);
}

function headersOf(request: IncomingMessage, accept?: string): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers))
    if (value !== undefined && name !== "host" && name !== "connection")
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  // The server names its resources by the host it is asked at, the proxy's (its base URL).
  headers.set("x-forwarded-host", request.headers.host ?? "");
  headers.set("x-forwarded-proto", "http");
  if (accept !== undefined) headers.set("accept", accept);
  return headers;
}

async function proxy(server: string, request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? "GET";
  const target = new URL(request.url ?? "/", server).href;
  const rule = ruleFor(method, new URL(target).pathname, request.headers.accept);
  const body = await bodyOf(request);
  if ("refuse" in rule) {
    response.writeHead(rule.refuse, { "access-control-allow-origin": "*" }).end();
    return;
  }
  if ("sendIfThere" in rule) {
    const there = await fetch(target, { method: "HEAD", headers: headersOf(request) });
    if (there.status === 404) {
      response.writeHead(404).end();
      return;
    }
  }
  const answer = await fetch(target, {
    method,
    headers: headersOf(request, "accept" in rule ? rule.accept : undefined),
    body,
    redirect: "manual",
  });
  const headers: Record<string, string[]> = {};
  answer.headers.forEach((value, name) => {
    if (!DROPPED.has(name)) headers[name] = [...(headers[name] ?? []), value];
  });
  response.writeHead(answer.status, headers);
  response.end(method === "HEAD" ? undefined : Buffer.from(await answer.arrayBuffer()));
}

if (import.meta.main) {
  const [server, port] = process.argv.slice(2);
  if (server === undefined || port === undefined) {
    console.error("Usage: node strictLws.ts <server URL> <port>");
    process.exit(2);
  }
  createServer((request, response) => {
    proxy(server, request, response).catch((error: Error) => {
      response.writeHead(502).end(error.message);
    });
  }).listen(Number(port), "127.0.0.1", () =>
    console.log(
      `A server that takes only LWS, in front of ${server}, at http://127.0.0.1:${port}/`,
    ),
  );
}
