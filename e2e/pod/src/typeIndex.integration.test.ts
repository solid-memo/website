// @vitest-environment node
/**
 * Where an instance is registered against a real Solid server
 * (docs/data-model.md): a profile without a private type index gets one,
 * made in the storage the instance is in (not at the server's root, which
 * may be another pod's), linked from the WebID document, or, where that
 * cannot be written (as on Inrupt PodSpaces), from an extended profile it
 * names. Runs against each server globalSetup.ts starts. Every run here
 * shares the storage's one type index; a file's tests run one at a time.
 */
import { Parser, Writer } from "n3";
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { aclOf, storageOf } from "./serverTraits";

const SERVERS = inject("solidServers");
const PRIVATE_TYPE_INDEX = "http://www.w3.org/ns/solid/terms#privateTypeIndex";

/** The instance repository as main.tsx wires it. */
function instances() {
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  return createSolidInstanceRepository({ fetch, checkWrite: shapeValidator.checkSubjects, now: () => new Date(), randomId: () => crypto.randomUUID() });
}

async function put(url: string, body: string): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

/** A document as N-Triples: every IRI written out in full. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  return new Writer({ format: "N-Triples" }).quadsToString(new Parser({ baseIRI: url }).parse(turtle));
}

/** A WebID document without a type index in a fresh folder, naming the extended profiles given; and the folder. */
async function profile(server: string, seeAlso: (base: string) => string[] = () => []) {
  const base = new URL(`run-${crypto.randomUUID()}/`, server).href;
  const card = `${base}profile/card`;
  const links = seeAlso(base).map((url) => ` ; <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${url}>`).join("");
  await put(card, `<#me> a <http://xmlns.com/foaf/0.1/Person>${links} .`);
  return { base, card, webId: `${card}#me` };
}

/** Lets anyone read the document and no one write it, as a WebID document on an identity broker; checked. */
async function readOnly(url: string): Promise<void> {
  await put(
    await aclOf(url),
    `<#read> a <http://www.w3.org/ns/auth/acl#Authorization> ; <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent> ;
    <http://www.w3.org/ns/auth/acl#accessTo> <${url}> ; <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .`,
  );
  const write = await fetch(url, { method: "PATCH", headers: { "content-type": "application/sparql-update" }, body: `INSERT DATA { <#x> <#y> "z" . };` });
  expect(write.ok, `${url} is still writable`).toBe(false);
}

describe.each(SERVERS)("registering an instance on $name", ({ url: server }) => {
  it("makes a type index in the instance's storage, linked from a WebID document that has none", async () => {
    const { base, card, webId } = await profile(server);
    const repository = instances();

    const instance = await repository.createInstance({ webId, containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });

    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    expect(await triples(card)).toContain(`<${webId}> <${PRIVATE_TYPE_INDEX}> <${index}> .`);
    expect(await repository.listInstances(webId)).toContainEqual(expect.objectContaining({ url: instance.url }));
  });

  it("links it from an extended profile when the WebID document is read-only", async () => {
    const { base, card, webId } = await profile(server, (base) => [`${base}extended/profile`]);
    await put(`${base}extended/profile`, `<${webId}> <http://xmlns.com/foaf/0.1/name> "Alice" .`);
    await readOnly(card);
    const before = await triples(card);
    const repository = instances();

    const instance = await repository.createInstance({ webId, containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });

    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    expect(await triples(`${base}extended/profile`)).toContain(`<${webId}> <${PRIVATE_TYPE_INDEX}> <${index}> .`);
    expect(await triples(card)).toBe(before);
    expect(await repository.listInstances(webId)).toContainEqual(expect.objectContaining({ url: instance.url }));
  });

  it("refuses, saying where it tried, and keeps no instance, when no profile document can be written", async () => {
    const { base, card, webId } = await profile(server);
    await readOnly(card);

    await expect(
      instances().createInstance({ webId, containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" }),
    ).rejects.toMatchObject({ code: "privateTypeIndexNotLinked", message: expect.stringContaining(card) });
    expect(await fetch(`${base}solid-memo/meta.ttl`).then((response) => response.status)).toBe(404);
  });
});
