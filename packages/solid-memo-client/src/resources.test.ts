// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { resourcesContract } from "@solid-memo/solid/testing/contract/resources";
import * as rdf from "./rdf";
import * as resources from "./resources";

// changesOf as itself, unless a test has it report changes no edit records (one of a blank node).
vi.mock("./rdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rdf")>();
  return { ...actual, changesOf: vi.fn(actual.changesOf) };
});

resourcesContract({ rdf, resources });

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";
const WEBID = "https://pod.example/profile/card#me";

/** A request the pod got. */
interface Sent {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
}

/**
 * A pod that notes every request and answers it with `answer`'s
 * response, given the URL asked: by default a 200 of a Turtle document
 * of one subject.
 */
function pod(answer: (url: string) => Response = () => turtle(`<#a> <${EX}p> "x" .`)) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    sent.push({
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    const response = answer(url);
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  return { fetch, sent };
}

/** A Turtle document's response, or a failure's of `status`. */
function turtle(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/turtle" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("go through the browser's own fetch when none is given", async () => {
    const { fetch, sent } = pod();
    vi.stubGlobal("fetch", fetch);
    const dataset = await resources.getSolidDataset(URL_);
    expect(sent.map((one) => one.url)).toEqual([URL_]);
    expect(rdf.getThingAll(dataset)).toHaveLength(1);
  });

  it("fail with an empty body where the failure's body cannot be read", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.error(new Error("cut off"));
      },
    });
    const { fetch } = pod(() => new Response(broken, { status: 500, statusText: "Broken" }));
    await expect(resources.getSolidDataset(URL_, { fetch })).rejects.toThrow(
      `Fetching the Resource at [${URL_}] failed: [500] [Broken] .`,
    );
  });
});

describe("reading documents", () => {
  it("refuses a document of no type, or of a type other than Turtle", async () => {
    await expect(
      resources.getSolidDataset(URL_, { fetch: pod(() => new Response(null)).fetch }),
    ).rejects.toThrow(`Could not determine the content type of the Resource at [${URL_}].`);
    const json = () => new Response("{}", { headers: { "Content-Type": "application/json; x=1" } });
    await expect(resources.getSolidDataset(URL_, { fetch: pod(json).fetch })).rejects.toThrow(
      `The Resource at [${URL_}] has a MIME type of [application/json], but the only parsers available are for the following MIME types: [text/turtle].`,
    );
  });
  it("fails as the browser fails a body that cannot be read, past no limit", async () => {
    const broken = new Error("The connection was reset.");
    const failing = () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(broken);
          },
        }),
        { headers: { "Content-Type": "text/turtle" } },
      );
    await expect(
      resources.getSolidDatasetLinear(URL_, { fetch: pod(failing).fetch }),
    ).rejects.toThrow(broken.message);
  });
});

describe("writeDocument", () => {
  it("writes a document read and not edited as an empty update", async () => {
    const { fetch, sent } = pod();
    const dataset = await resources.getSolidDataset(URL_, { fetch });
    await resources.writeDocument(URL_, dataset, { fetch });
    expect(sent[1]).toMatchObject({ method: "PATCH", body: " " });
  });

  it("writes changes patchBody cannot name, of a blank node, in Turtle as the library does", async () => {
    const { fetch, sent } = pod();
    const dataset = await resources.getSolidDataset(URL_, { fetch });
    const [added] = await resources.parseQuads(`<#a> <${EX}p> [] .`, "turtle", URL_);
    vi.mocked(rdf.changesOf).mockReturnValueOnce({ additions: [added!], deletions: [] });
    await resources.writeDocument(URL_, dataset, { fetch });
    expect(sent[1]!.body).toBe(` INSERT DATA {<${URL_}#a> <${EX}p> _:${added!.object.value}.};`);
  });

  it("sends a conflict of no deleted decimal, or of no change, only once", async () => {
    let status = 200;
    const { fetch, sent } = pod(() => turtle(`<#a> <${EX}p> "x" .`, status));
    const dataset = await resources.getSolidDataset(URL_, { fetch });
    const thing = rdf
      .buildThing(rdf.getThing(dataset, `${URL_}#a`)!)
      .setStringNoLocale(`${EX}p`, "y")
      .build();
    status = 409;
    for (const written of [dataset, rdf.setThing(dataset, thing)]) {
      await expect(resources.writeDocument(URL_, written, { fetch })).rejects.toThrow("[409]");
    }
    expect(sent.map((one) => one.method)).toEqual(["GET", "PATCH", "PATCH"]);
  });

  it("gives as saved a subject made by name, and the IRIs pointing to it, at the document written", async () => {
    const { fetch, sent } = pod(() => new Response(null, { status: 201 }));
    const card = rdf
      .buildThing(rdf.createThing({ name: "card" }))
      .addIri(`${EX}next`, rdf.createThing({ name: "other" }))
      .addIri(`${EX}next`, `${URL_}#third`)
      .addStringNoLocale(`${EX}next`, "a text")
      .addStringNoLocale(`${EX}front`, "Sweden")
      .build();
    const dataset = rdf.setThing(rdf.createSolidDataset(), card);
    const { dataset: saved } = await resources.writeDocument(URL_, dataset, { fetch });
    const stored = rdf.getThing(saved, `${URL_}#card`)!;
    expect(rdf.getUrlAll(stored, `${EX}next`)).toEqual([`${URL_}#other`, `${URL_}#third`]);
    expect(rdf.getStringNoLocaleAll(stored, `${EX}next`)).toEqual(["a text"]);
    expect(rdf.getStringNoLocale(stored, `${EX}front`)).toBe("Sweden");
    expect(sent[0]!.body).toContain("<#card>");
  });
});

describe("containers and files", () => {
  it("creates a container at its URL with a trailing slash, and refuses to delete one without", async () => {
    const { fetch, sent } = pod(() => new Response(null, { status: 201 }));
    await resources.createContainerAt("https://pod.example/decks", { fetch });
    expect(sent[0]!.url).toBe("https://pod.example/decks/");
    await expect(resources.deleteContainer("https://pod.example/decks", { fetch })).rejects.toThrow(
      "You're trying to delete the Container at [https://pod.example/decks], but Container URLs should end in a `/`.",
    );
  });

  it("reads a file at its URL without a trailing slash, and names a File it writes", async () => {
    const { fetch, sent } = pod(() => new Response("bytes"));
    await resources.getFile("https://pod.example/files/a.txt/", { fetch });
    await resources.overwriteFile("https://pod.example/files/a.txt", new Blob(["x"]), {
      fetch,
      contentType: "text/plain",
    });
    await resources.overwriteFile("https://pod.example/files/b.txt", new File(["x"], "b.txt"), {
      fetch,
      contentType: "text/plain",
    });
    expect(sent.map((one) => [one.url, one.headers.get("Slug")])).toEqual([
      ["https://pod.example/files/a.txt", null],
      ["https://pod.example/files/a.txt", null],
      ["https://pod.example/files/b.txt", "b.txt"],
    ]);
  });

  it("lists nothing for a container that says nothing of itself", async () => {
    const { fetch } = pod(() => turtle(`<#a> <${EX}p> "x" .`));
    const container = await resources.getSolidDataset("https://pod.example/decks/", { fetch });
    expect(resources.getContainedResourceUrlAll(container)).toEqual([]);
  });
});

describe("solidDatasetAsTurtle", () => {
  it("writes the library's prefixes when it is given none", async () => {
    const dataset = rdf.setThing(
      rdf.createSolidDataset(),
      rdf
        .buildThing(rdf.createThing({ url: `${URL_}#a` }))
        .addIri(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "http://xmlns.com/foaf/0.1/Person",
        )
        .build(),
    );
    const text = await resources.solidDatasetAsTurtle(dataset);
    expect(text).toContain("@prefix foaf: <http://xmlns.com/foaf/0.1/>.");
    expect(text).toContain("foaf:Person");
  });
});

describe("getProfileStorages", () => {
  const PROFILE = "https://pod.example/profile/card";

  it("asks the storages of every document the WebID document names as more of the profile, and of those it can read", async () => {
    const documents: Record<string, string> = {
      [PROFILE]: `@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<> foaf:primaryTopic <#me> .
<#more> foaf:primaryTopic <#me> .
<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://pod.example/settings/a> ;
  foaf:isPrimaryTopicOf <https://pod.example/settings/b>, <https://pod.example/settings/missing> ;
  <http://www.w3.org/ns/pim/space#storage> <https://pod.example/> .`,
      "https://pod.example/settings/a": `<${WEBID}> <http://www.w3.org/ns/pim/space#storage> <https://other.example/> .`,
      "https://pod.example/settings/b": `<#nobody> <${EX}p> "x" .`,
    };
    const { fetch, sent } = pod((url) =>
      url in documents ? turtle(documents[url]!) : turtle("", 404),
    );
    const webIdProfile = await resources.getSolidDataset(PROFILE, { fetch });
    expect(await resources.getProfileStorages(WEBID, { fetch, webIdProfile })).toEqual([
      "https://pod.example/",
      "https://other.example/",
    ]);
    expect(sent.map((one) => one.url)).toEqual([
      PROFILE,
      `${PROFILE}#more`,
      "https://pod.example/settings/a",
      "https://pod.example/settings/b",
      "https://pod.example/settings/missing",
    ]);
  });

  it("finds none in a WebID document that says nothing of the WebID", async () => {
    const { fetch } = pod(() => turtle(`<#other> <${EX}p> "x" .`));
    const webIdProfile = await resources.getSolidDataset(PROFILE, { fetch });
    expect(await resources.getProfileStorages(WEBID, { fetch, webIdProfile })).toEqual([]);
  });
});

describe("parseQuads", () => {
  it("does not fetch a JSON-LD context named by URL", async () => {
    await expect(
      resources.parseQuads(
        JSON.stringify({ "@context": "https://context.example/", "@id": "#a" }),
        "jsonld",
        URL_,
      ),
    ).rejects.toThrow("The JSON-LD context at [https://context.example/] is not fetched.");
  });
});
