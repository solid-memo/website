import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closingConnections } from "./connections.ts";

interface Seen {
  port: number;
  connection: string | null;
  test: string | null;
}

/** A server answering with the port each request came from and the headers it was sent: one per test, so fetch has no connection to it yet. */
let server: Server;
let url: string;

beforeEach(async () => {
  server = createServer((request, response) => {
    const header = (name: string) => (request.headers[name] as string | undefined) ?? null;
    const seen: Seen = { port: request.socket.remotePort as number, connection: header("connection"), test: header("x-test") };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(seen));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const seenBy = async (send: typeof fetch, input: string | Request, init?: RequestInit) => (await (await send(input, init)).json()) as Seen;

/** Two requests in a row, the first's connection back in the pool, idle, before the second is made. */
async function twoBy(send: typeof fetch) {
  const first = await seenBy(send, url);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return [first, await seenBy(send, url)];
}

describe("a fetch closing its connections", () => {
  it("sends two requests in a row on two connections", async () => {
    const [first, second] = await twoBy(closingConnections(fetch));
    expect(first.connection).toBe("close");
    expect(second.port).not.toBe(first.port);
  });

  it("is needed: fetch alone sends them on one, so the ports above tell", async () => {
    const [first, second] = await twoBy(fetch);
    expect(second.port).toBe(first.port);
  });

  it("keeps the request's own headers, given with it or on a Request", async () => {
    const closing = closingConnections(fetch);
    expect(await seenBy(closing, url, { headers: { "x-test": "init" } })).toMatchObject({ connection: "close", test: "init" });
    expect(await seenBy(closing, new Request(url, { headers: { "x-test": "request" } }))).toMatchObject({ connection: "close", test: "request" });
  });
});
