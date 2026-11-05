// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { listContainer } from "./containers";
import { appendToDocument, deleteDataset, readDataset, saveDataset } from "./datasets";
import { buildThing, createSolidDataset, createThing, getThing, setThing } from "./client/rdf";
import { CREATION_REFUSED, lwsBridge } from "./lwsBridge";
import { lwsPod } from "./testing/lwsPod";

const ROOT = "https://pod.example/alice/";
const MAIN = `${ROOT}solid-memo/main/`;
const CATALOG = `${MAIN}catalog.ttl`;
const MONTH = `${MAIN}history/2026-11.ttl`;
const TITLE = "http://purl.org/dc/terms/title";
const STORAGE_LINK = `<${ROOT}>; rel="https://www.w3.org/ns/lws#storage"`;

function titled(url: string, title: string) {
  return buildThing(createThing({ url })).addStringNoLocale(TITLE, title).build();
}

/** A fetch whose answers `answer` gives, each with the URL asked for; every request kept in `asked`. */
function scripted(
  answer: (url: string, init: RequestInit | undefined, n: number) => Response | Promise<Response>,
) {
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    asked.push(`${init?.method ?? "GET"} ${String(input)}`);
    const response = await answer(String(input), init, asked.length);
    if (response.url === "") Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
  return { fetch, asked };
}

const lws = (status: number, headers: Record<string, string> = {}, body: string | null = null) =>
  new Response(body, { status, headers: { Link: STORAGE_LINK, ...headers } });

describe("the app's documents on a server that takes only Linked Web Storage", () => {
  it("makes each folder and document with a POST of its name, edits them whole, lists and deletes them", async () => {
    const pod = lwsPod({ root: ROOT });
    const fetch = lwsBridge(pod.fetch);
    await saveDataset(
      CATALOG,
      setThing(createSolidDataset(), titled(`${CATALOG}#it`, "one")),
      fetch,
    );
    expect(pod.resources.get(CATALOG)?.body).toContain('"one"');
    expect(pod.requests.filter((request) => request.startsWith("POST"))).toEqual([
      `POST ${ROOT}`,
      `POST ${ROOT}solid-memo/`,
      `POST ${MAIN}`,
    ]);

    const read = await readDataset(CATALOG, fetch);
    const changed = buildThing(getThing(read, `${CATALOG}#it`)!)
      .setStringNoLocale(TITLE, "two")
      .build();
    await saveDataset(CATALOG, setThing(read, changed), fetch);
    expect(pod.resources.get(CATALOG)?.body).toContain('"two"');
    expect(pod.resources.get(CATALOG)?.body).not.toContain('"one"');
    expect(pod.requests).toContain(`PATCH ${CATALOG}`);
    expect(pod.requests.at(-1)).toBe(`PUT ${CATALOG}`);

    expect(await listContainer(MAIN, fetch)).toEqual([CATALOG]);
    await deleteDataset(CATALOG, await readDataset(CATALOG, fetch), fetch);
    expect(pod.resources.has(CATALOG)).toBe(false);
    expect(await listContainer(MAIN, fetch)).toEqual([]);
  });

  it("appends to a document not there yet, and keeps every one of several appends made at once", async () => {
    const pod = lwsPod({ root: ROOT });
    const fetch = lwsBridge(pod.fetch);
    await appendToDocument(MONTH, titled(`${MONTH}#a`, "a"), fetch);
    await Promise.all(
      ["b", "c", "d"].map((name) =>
        appendToDocument(MONTH, titled(`${MONTH}#${name}`, name), fetch),
      ),
    );
    for (const name of ["a", "b", "c", "d"])
      expect(pod.resources.get(MONTH)?.body).toContain(`"${name}"`);
    expect(await listContainer(`${MAIN}history/`, fetch)).toEqual([MONTH]);
  });

  it("reads a listing in pages, and one a server gives only in the LWS profile", async () => {
    for (const options of [{ pageSize: 2 }, { profileTurtle: true }]) {
      const pod = lwsPod({ root: ROOT, ...options });
      const fetch = lwsBridge(pod.fetch);
      const documents = ["a", "b", "c", "d", "e"].map((name) => `${MAIN}${name}.ttl`);
      for (const document of documents)
        await saveDataset(
          document,
          setThing(createSolidDataset(), titled(`${document}#it`, "x")),
          fetch,
        );
      expect(await listContainer(MAIN, fetch)).toEqual(documents);
    }
  });

  it("refuses a document the server would name otherwise, and leaves nothing of it", async () => {
    const pod = lwsPod({ root: ROOT, ownNames: true });
    const fetch = lwsBridge(pod.fetch);
    await expect(
      saveDataset(CATALOG, setThing(createSolidDataset(), titled(`${CATALOG}#it`, "one")), fetch),
    ).rejects.toMatchObject({ response: { status: CREATION_REFUSED } });
    expect([...pod.resources.keys()]).toEqual([ROOT]);
  });
});

describe("lwsBridge, on a Solid server", () => {
  it("sends every request as it is when the server takes it, or is no LWS server", async () => {
    const { fetch, asked } = scripted((_, init) => {
      if (init?.method === "HEAD") return new Response(null);
      if (init?.method === "PUT" || init?.method === "PATCH")
        return new Response(null, { status: 404 });
      return new Response("", { headers: { "Content-Type": "text/turtle" } });
    });
    const bridged = lwsBridge(fetch);
    expect((await bridged(MAIN)).status).toBe(200);
    expect(
      (await bridged(CATALOG, { method: "PUT", headers: { "If-None-Match": "*" }, body: "" }))
        .status,
    ).toBe(404);
    expect(
      (
        await bridged(CATALOG, {
          method: "PATCH",
          headers: { "Content-Type": "application/sparql-update" },
          body: "",
        })
      ).status,
    ).toBe(404);
    expect((await bridged(CATALOG, { method: "DELETE" })).status).toBe(200);
    expect((await bridged(CATALOG, { method: "PATCH", body: "" })).status).toBe(404);
    const request = new Request(CATALOG);
    expect((await bridged(request)).status).toBe(200);
    expect(asked).toEqual([
      `GET ${MAIN}`,
      `PUT ${CATALOG}`,
      `HEAD ${MAIN}`,
      `PATCH ${CATALOG}`,
      `HEAD ${CATALOG}`,
      `DELETE ${CATALOG}`,
      `PATCH ${CATALOG}`,
      "GET [object Request]",
    ]);
  });

  it("asks nothing more of a server that takes a creation or an update, or refuses it for another reason", async () => {
    for (const status of [201, 412, 403, 400]) {
      const { fetch, asked } = scripted(() => new Response(null, { status }));
      const bridged = lwsBridge(fetch);
      await bridged(CATALOG, { method: "PUT", headers: { "If-None-Match": "*" }, body: "" });
      await bridged(CATALOG, {
        method: "PATCH",
        headers: { "Content-Type": "application/sparql-update" },
        body: "",
      });
      expect(asked).toHaveLength(2);
    }
  });

  it("is no LWS server when no folder up to the root is there, or there are too many", async () => {
    const { fetch, asked } = scripted(() => new Response(null, { status: 404 }));
    await lwsBridge(fetch)("https://pod.example/a/b.ttl", {
      method: "PUT",
      headers: { "If-None-Match": "*" },
    });
    expect(asked).toEqual([
      "PUT https://pod.example/a/b.ttl",
      "HEAD https://pod.example/a/",
      "HEAD https://pod.example/",
    ]);
    const deep = `https://pod.example/${"x/".repeat(40)}d.ttl`;
    const many = scripted(() => new Response(null, { status: 404 }));
    await lwsBridge(many.fetch)(deep, { method: "PUT", headers: { "If-None-Match": "*" } });
    expect(many.asked).toHaveLength(33);
    // The origin's root itself has no container to be made in.
    const root = scripted(() => new Response(null, { status: 404 }));
    await lwsBridge(root.fetch)("https://pod.example/", {
      method: "PUT",
      headers: { "If-None-Match": "*" },
    });
    expect(root.asked).toHaveLength(1);
  });
});

describe("lwsBridge, its listing", () => {
  const listing = (body: unknown, headers: Record<string, string> = {}) =>
    lws(200, { "Content-Type": "application/lws+json", ...headers }, JSON.stringify(body));

  it("keeps the members of the container alone, and fails a listing that is not one", async () => {
    const { fetch } = scripted(() =>
      listing({
        items: [{ id: `${MAIN}a.ttl` }, { id: 7 }, null, { id: `${ROOT}other.ttl` }, { id: MAIN }],
      }),
    );
    expect(await (await lwsBridge(fetch)(MAIN)).text()).toBe(
      `<${MAIN}> a <http://www.w3.org/ns/ldp#Container>, <http://www.w3.org/ns/ldp#BasicContainer>;\n  <http://www.w3.org/ns/ldp#contains> <${MAIN}a.ttl> .\n`,
    );
    const broken = scripted(() => listing({ type: "Container" }));
    await expect(lwsBridge(broken.fetch)(MAIN)).rejects.toThrow(
      "is not the listing of a container",
    );
  });

  it("follows a listing's pages on its origin alone, each once, and no further than it reads", async () => {
    const next = (url: string) => ({ Link: `<${url}>; rel="next"` });
    for (const [link, message] of [
      ["https://elsewhere.example/p2", "goes on past"],
      [MAIN, "goes on past"],
    ] as const) {
      const { fetch } = scripted(() => listing({ items: [] }, next(link)));
      await expect(lwsBridge(fetch)(MAIN)).rejects.toThrow(message);
    }
    const endless = scripted((_, __, n) => listing({ items: [] }, next(`${MAIN}?p=${n}`)));
    await expect(lwsBridge(endless.fetch)(MAIN)).rejects.toThrow("goes on past");
    expect(endless.asked).toHaveLength(200);
    const failing = scripted((_, __, n) =>
      n === 1 ? listing({ items: [] }, next(`${MAIN}?p=2`)) : lws(500),
    );
    await expect(lwsBridge(failing.fetch)(MAIN)).rejects.toThrow("answered 500");
  });

  it("refuses a listing of more members than it reads", async () => {
    const items = Array.from({ length: 20_001 }, (_, n) => ({ id: `${MAIN}${n}.ttl` }));
    const { fetch } = scripted(() => listing({ items }));
    await expect(lwsBridge(fetch)(MAIN)).rejects.toThrow("lists more than 20000");
  });

  it("names the listing by the address asked for when the answer has none, and passes on one of no type", async () => {
    const bare: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ items: [{ id: "a.ttl" }] }), {
        headers: { "Content-Type": "application/lws+json" },
      });
    const response = await lwsBridge(bare)(MAIN);
    expect(response.url).toBe(MAIN);
    expect(await response.text()).toContain(`<${MAIN}a.ttl>`);
    const untyped: typeof globalThis.fetch = async () => new Response("x");
    expect(await (await lwsBridge(untyped)(MAIN)).text()).toBe("x");
  });

  it("asks for its listing a server that will not give Turtle, and gives its answer when it has none", async () => {
    const { fetch, asked } = scripted((_, init, n) =>
      n === 1 ? lws(406) : init?.method === "HEAD" ? lws(200) : lws(404),
    );
    expect((await lwsBridge(fetch)(MAIN, { headers: { Accept: "text/turtle" } })).status).toBe(404);
    expect(asked).toEqual([`GET ${MAIN}`, `HEAD ${MAIN}`, `GET ${MAIN}`]);
    const plain = scripted((_, __, n) =>
      n === 1 ? lws(406) : lws(200, { "Content-Type": "text/plain" }),
    );
    expect((await lwsBridge(plain.fetch)(MAIN)).headers.get("Content-Type")).toBe("text/plain");
  });

  it("asks a server that is no LWS server for nothing more, whatever it answers a listing", async () => {
    const { fetch, asked } = scripted((_, init) =>
      init?.method === "HEAD" ? new Response(null) : new Response(null, { status: 406 }),
    );
    expect((await lwsBridge(fetch)(MAIN)).status).toBe(406);
    expect(asked).toEqual([`GET ${MAIN}`, `HEAD ${MAIN}`]);
  });

  it("writes a member whose address holds what an IRI may not as an IRI", async () => {
    const { fetch } = scripted(() =>
      lws(
        200,
        { "Content-Type": "application/lws+json" },
        JSON.stringify({ items: [{ id: `${MAIN}a|b^c.ttl` }] }),
      ),
    );
    expect(await (await lwsBridge(fetch)(MAIN)).text()).toContain(`<${MAIN}a%7Cb%5Ec.ttl>`);
  });
});

describe("lwsBridge, its creation", () => {
  const creating = {
    method: "PUT",
    headers: { "If-None-Match": "*", "Content-Type": "text/turtle" },
    body: "<#a> <#b> <#c>.",
  };

  it("says why a folder above could not be made, and what the server answered a POST", async () => {
    const forbidden = scripted((url, init) =>
      init?.method === "HEAD" && url === MAIN ? lws(403) : lws(404),
    );
    expect((await lwsBridge(forbidden.fetch)(CATALOG, creating)).status).toBe(403);
    const refused = scripted((url, init) =>
      init?.method === "POST"
        ? lws(400)
        : init?.method === "HEAD" && url === MAIN
          ? lws(200)
          : lws(404),
    );
    expect((await lwsBridge(refused.fetch)(CATALOG, creating)).status).toBe(400);
    const deep = `${ROOT}${"x/".repeat(40)}d.ttl`;
    const tooDeep = scripted((url, init) =>
      init?.method === "HEAD" && url === ROOT ? lws(200) : lws(404),
    );
    expect((await lwsBridge(tooDeep.fetch)(deep, creating)).status).toBe(404);
  });

  it("deletes nothing but what the POST made in the folder, and never tries again what it could not delete", async () => {
    for (const [location, deleteStatus] of [
      [null, 204],
      ["https://elsewhere.example/alice/x.ttl", 204],
      [`${ROOT}x.ttl`, 204],
      [`${MAIN}x.ttl`, 500],
    ] as const) {
      const { fetch, asked } = scripted((url, init) => {
        const method = init?.method ?? "GET";
        if (method === "POST") return lws(201, location === null ? {} : { Location: location });
        if (method === "HEAD") return url === MAIN ? lws(200) : lws(404);
        if (method === "DELETE") return lws(deleteStatus);
        return lws(405);
      });
      const response = await lwsBridge(fetch)(CATALOG, creating);
      expect(response.status).toBe(502);
      expect(response.url).toBe(CATALOG);
      const deletes = asked.filter((request) => request.startsWith("DELETE"));
      expect(deletes).toEqual(location === `${MAIN}x.ttl` ? [`DELETE ${MAIN}x.ttl`] : []);
    }
  });

  it("asks for a name outside ASCII as the address spells it", async () => {
    const pod = lwsPod({ root: ROOT });
    const document = `${ROOT}한국어/카드.ttl`;
    await saveDataset(
      document,
      setThing(createSolidDataset(), titled(`${document}#it`, "x")),
      lwsBridge(pod.fetch),
    );
    expect(pod.resources.has(new URL(document).href)).toBe(true);
  });

  it("makes a folder asked for with a POST that links its type, with no body", async () => {
    const pod = lwsPod({ root: ROOT });
    const response = await lwsBridge(pod.fetch)(`${MAIN}decks/`, {
      method: "PUT",
      headers: {
        "If-None-Match": "*",
        "Content-Type": "text/turtle",
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      },
    });
    expect(response.status).toBe(201);
    expect(response.url).toBe(`${MAIN}decks/`);
    expect(pod.resources.get(`${MAIN}decks/`)).toMatchObject({ body: "" });
  });
});

describe("lwsBridge, its update", () => {
  const PATCH = (body: string, headers: Record<string, string> = {}) => ({
    method: "PATCH",
    headers: { "Content-Type": "application/sparql-update", ...headers },
    body,
  });
  const INSERT = `INSERT DATA { <${CATALOG}#a> <${TITLE}> "a" . };`;

  it("does not write an update the app does not make, or one of a document with no version", async () => {
    const pod = lwsPod({ root: ROOT });
    const fetch = lwsBridge(pod.fetch);
    expect((await fetch(CATALOG, PATCH("DELETE WHERE { ?s ?p ?o }"))).status).toBe(415);
    await saveDataset(
      CATALOG,
      setThing(createSolidDataset(), titled(`${CATALOG}#it`, "one")),
      fetch,
    );
    expect((await fetch(CATALOG, PATCH("DELETE WHERE { ?s ?p ?o }"))).status).toBe(415);
    const unversioned = scripted((_, init) =>
      (init?.method ?? "GET") === "GET"
        ? lws(200, { "Content-Type": "text/turtle" }, "")
        : lws(415),
    );
    expect((await lwsBridge(unversioned.fetch)(CATALOG, PATCH(INSERT))).status).toBe(415);
  });

  it("says another write came first to an edit of a document as read that is gone, or changed", async () => {
    const pod = lwsPod({ root: ROOT });
    const fetch = lwsBridge(pod.fetch);
    expect((await fetch(CATALOG, PATCH(INSERT, { "If-Match": '"1"' }))).status).toBe(412);
    await fetch(CATALOG, PATCH(INSERT));
    expect((await fetch(CATALOG, PATCH(INSERT, { "If-Match": '"0"' }))).status).toBe(412);
  });

  it("gives up after a few tries, and passes on a read that fails", async () => {
    const busy = scripted((_, init) =>
      (init?.method ?? "GET") === "GET"
        ? lws(200, { "Content-Type": "text/turtle", ETag: '"1"' }, "")
        : init?.method === "PUT"
          ? lws(412)
          : lws(415),
    );
    expect((await lwsBridge(busy.fetch)(CATALOG, PATCH(INSERT))).status).toBe(412);
    expect(busy.asked.filter((request) => request.startsWith("PUT"))).toHaveLength(5);
    const failing = scripted((_, init) =>
      (init?.method ?? "GET") === "GET" ? lws(403) : lws(415),
    );
    expect((await lwsBridge(failing.fetch)(CATALOG, PATCH(INSERT))).status).toBe(403);
  });

  it("writes nothing against a weak ETag, and fails an update whose deletion is not there", async () => {
    const weak = scripted((_, init) =>
      (init?.method ?? "GET") === "GET"
        ? lws(200, { "Content-Type": "text/turtle", ETag: 'W/"1"' }, "")
        : lws(415),
    );
    expect((await lwsBridge(weak.fetch)(CATALOG, PATCH(INSERT))).status).toBe(415);
    expect(weak.asked.some((request) => request.startsWith("PUT"))).toBe(false);
    const pod = lwsPod({ root: ROOT });
    const fetch = lwsBridge(pod.fetch);
    const DELETE = `DELETE DATA { <${CATALOG}#b> <${TITLE}> "b" . }; ${INSERT}`;
    expect((await fetch(CATALOG, PATCH(DELETE))).status).toBe(409);
    expect(pod.resources.has(CATALOG)).toBe(false);
    await fetch(CATALOG, PATCH(INSERT));
    expect((await fetch(CATALOG, PATCH(DELETE))).status).toBe(409);
  });

  it("says another write came first, not that a deletion isn't there, to an edit of a document changed since it was read", async () => {
    const pod = lwsPod({ root: ROOT });
    const fetch = lwsBridge(pod.fetch);
    await fetch(CATALOG, PATCH(INSERT));
    const DELETE = `DELETE DATA { <${CATALOG}#b> <${TITLE}> "b" . }; ${INSERT}`;
    expect((await fetch(CATALOG, PATCH(DELETE, { "If-Match": '"0"' }))).status).toBe(412);
  });

  it("changes the document another tab made first by the same name", async () => {
    let made = false;
    const { fetch } = scripted((url, init) => {
      const method = init?.method ?? "GET";
      if (method === "PATCH") return lws(404);
      if (method === "HEAD") return url === MAIN || url === `${MAIN}history/` ? lws(200) : lws(404);
      if (method === "GET")
        return made ? lws(200, { "Content-Type": "text/turtle", ETag: '"1"' }, "") : lws(404);
      if (method === "POST") {
        made = true;
        return lws(201, { Location: `${MAIN}history/2026-11-2.ttl` });
      }
      return lws(204);
    });
    expect((await lwsBridge(fetch)(MONTH, PATCH(INSERT))).status).toBe(204);
  });
});
