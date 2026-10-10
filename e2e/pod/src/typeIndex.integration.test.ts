// @vitest-environment node
/**
 * Where an instance is registered against a real Solid server
 * (docs/data-model.md): a profile without a private type index gets one,
 * made in the storage the instance is in (not at the server's root, which
 * may be another pod's), linked from the WebID document, or, where that
 * cannot be written (as on Inrupt PodSpaces), from an extended profile it
 * names. Beside the instance, each class of its data is registered, its
 * review states, answers and drafts in the private index alone, read back from
 * the index as written, and every registration goes when the instance is
 * deleted. Runs against each server globalSetup.ts starts. Every run here
 * shares the storage's one type index; a file's tests run one at a time.
 */
import { Parser, Writer } from "n3";
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { aclOf, ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, storageOf } from "./serverTraits";

const SERVERS = inject("solidServers");
const PRIVATE_TYPE_INDEX = "http://www.w3.org/ns/solid/terms#privateTypeIndex";
const SOLID_TERMS = "http://www.w3.org/ns/solid/terms#";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** The instance repository as createAppUseCases wires it. */
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

/**
 * A WebID document in a fresh folder, naming the extended profiles given
 * and, when asked, a private type index in the folder, which is made
 * (else it names none); and the folder.
 */
async function profile(server: string, seeAlso: (base: string) => string[] = () => [], { privateIndex = false } = {}) {
  const base = new URL(`run-${crypto.randomUUID()}/`, server).href;
  const card = `${base}profile/card`;
  const index = `${base}settings/privateTypeIndex.ttl`;
  if (privateIndex) await put(index, `<> a <${SOLID_TERMS}TypeIndex>, <${SOLID_TERMS}UnlistedDocument> .`);
  // A statement each: Solid-Nextcloud stores `<#me> a <Person> ; <p> <o>` as `<#me> <Person> <p>`.
  const links = [
    ...seeAlso(base).map((url) => `\n<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${url}> .`),
    ...(privateIndex ? [`\n<#me> <${PRIVATE_TYPE_INDEX}> <${index}> .`] : []),
  ].join("");
  await put(card, `<#me> a <http://xmlns.com/foaf/0.1/Person> .${links}`);
  return { base, card, webId: `${card}#me` };
}

/**
 * Lets anyone read the document and no one write it, as a WebID document
 * on an identity broker; checked. Its own ACL says so on a server with
 * Web Access Control; its ACR, denying writes, on one with Access
 * Control Policies (whose rules for the folders above still allow them).
 */
async function readOnly(url: string): Promise<void> {
  const control = await aclOf(url);
  const acp = /<http:\/\/www\.w3\.org\/ns\/solid\/acp#AccessControlResource>;\s*rel="type"/.test((await fetch(control, { method: "HEAD" })).headers.get("link") ?? "");
  const ACL = "http://www.w3.org/ns/auth/acl#";
  const ACP = "http://www.w3.org/ns/solid/acp#";
  await put(
    control,
    acp
      ? `<> a <${ACP}AccessControlResource> ; <${ACP}resource> <${url}> ; <${ACP}accessControl> <#readOnly> .
    <#readOnly> a <${ACP}AccessControl> ; <${ACP}apply> <#policy> .
    <#policy> a <${ACP}Policy> ; <${ACP}allow> <${ACL}Read> ; <${ACP}deny> <${ACL}Write>, <${ACL}Append> ; <${ACP}anyOf> <#everyone> .
    <#everyone> a <${ACP}Matcher> ; <${ACP}agent> <${ACP}PublicAgent> .`
      : `<#read> a <${ACL}Authorization> ; <${ACL}agentClass> <http://xmlns.com/foaf/0.1/Agent> ;
    <${ACL}accessTo> <${url}> ; <${ACL}mode> <${ACL}Read> .`,
  );
  const write = await fetch(url, { method: "PATCH", headers: { "content-type": "application/sparql-update" }, body: `INSERT DATA { <#x> <#y> "z" . };` });
  expect(write.ok, `${url} is still writable`).toBe(false);
}


/** The registrations in a type index of what lies in `container`: each one's class, predicate, what it names, and title; sorted. */
async function registrationsIn(index: string, container: string) {
  const turtle = await fetch(index, { headers: { accept: "text/turtle" } }).then((response) => response.text());
  const quads = new Parser({ baseIRI: index }).parse(turtle);
  const of = (subject: (typeof quads)[number]["subject"], predicate: string) =>
    quads.filter((quad) => quad.subject.equals(subject) && quad.predicate.value === predicate).map((quad) => quad.object.value);
  return quads
    .filter((quad) => [`${SOLID_TERMS}instance`, `${SOLID_TERMS}instanceContainer`].includes(quad.predicate.value))
    .filter((quad) => quad.object.value.startsWith(container))
    .map((quad) => ({
      subject: quad.subject.value,
      forClass: of(quad.subject, `${SOLID_TERMS}forClass`),
      predicate: quad.predicate.value.slice(SOLID_TERMS.length),
      target: quad.object.value,
      title: of(quad.subject, "http://purl.org/dc/terms/title"),
    }))
    .sort((a, b) => a.target.localeCompare(b.target));
}

/** What each class of an instance's data is registered as, in the order registrationsIn sorts them. */
function registered(container: string, classes: ("instance" | "catalog" | "deck" | "card" | "reviewState" | "answer" | "draft")[]) {
  const all = {
    instance: { forClass: [`${SM}Instance`], predicate: "instanceContainer", target: container },
    catalog: { forClass: ["http://www.w3.org/ns/dcat#Catalog"], predicate: "instance", target: `${container}catalog.ttl#catalog` },
    deck: { forClass: [`${SM}Deck`], predicate: "instance", target: `${container}catalog.ttl` },
    card: { forClass: [`${SM}Card`], predicate: "instanceContainer", target: `${container}decks/` },
    reviewState: { forClass: [`${SM}ReviewState`], predicate: "instanceContainer", target: `${container}reviews/` },
    answer: { forClass: [`${SM}Answer`], predicate: "instanceContainer", target: `${container}history/` },
    draft: { forClass: [`${SM}Deck`], predicate: "instanceContainer", target: `${container}drafts/` },
  };
  return classes
    .map((dataClass) => ({ ...all[dataClass], subject: expect.any(String), title: ["Main"] }))
    .sort((a, b) => a.target.localeCompare(b.target));
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

  it("registers each class of the instance's data in it, where Solid Memo still finds the instance by its own", async () => {
    const { base, webId } = await profile(server);
    const repository = instances();

    const instance = await repository.createInstance({ webId, containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });

    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    const all = ["instance", "catalog", "deck", "card", "reviewState", "answer", "draft"] as const;
    expect(await registrationsIn(index, instance.url)).toEqual(registered(instance.url, [...all]));
    expect(await repository.listInstances(webId)).toContainEqual({ url: instance.url, name: "Main" });
    expect(await repository.readDataClassRegistrations({ webId, instanceUrl: instance.url })).toEqual({
      registrations: all.map((dataClass) => ({ dataClass, index: "private", registered: true })),
      privateIndexMissing: false,
      unreadableIndexes: [],
    });

    // Deleting the instance removes every one of them.
    await repository.deleteInstance({ webId, instance });
    expect(await registrationsIn(index, instance.url)).toEqual([]);
  });

  it("says a registration the user removed is missing, and adds it back only when asked", async (context) => {
    const { base, webId } = await profile(server);
    const repository = instances();
    const instance = await repository.createInstance({ webId, containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });
    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    // The removal is made in the same second as the index was read, which such a server's ETag does not tell apart.
    if (!(await etagMarksEveryEdit(server))) context.skip(ETAG_OUTLIVES_EDITS);
    const all = ["instance", "catalog", "deck", "card", "reviewState", "answer", "draft"] as const;

    const cards = (await registrationsIn(index, instance.url)).find((registration) => registration.target.endsWith("decks/"))!;
    const removal = await fetch(index, {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `DELETE DATA { <${cards.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${SOLID_TERMS}TypeRegistration> ; <${SOLID_TERMS}forClass> <${SM}Card> ;
        <${SOLID_TERMS}instanceContainer> <${cards.target}> ; <http://purl.org/dc/terms/title> "Main" . }`,
    });
    expect(removal.ok, `PATCH ${index}: ${removal.status}`).toBe(true);
    expect(await registrationsIn(index, instance.url)).toEqual(registered(instance.url, ["instance", "catalog", "deck", "reviewState", "answer", "draft"]));
    expect((await repository.readDataClassRegistrations({ webId, instanceUrl: instance.url })).registrations).toContainEqual({
      dataClass: "card",
      index: "private",
      registered: false,
    });
    await repository.registerDataClasses({ webId, instanceUrl: instance.url, title: "Main" });
    expect(await registrationsIn(index, instance.url)).toEqual(registered(instance.url, [...all]));
  });

  it("registers an instance publicly, its review states, answers and drafts in the private index alone, and unregisters it from both", async () => {
    const { base, card, webId } = await profile(server, () => [], { privateIndex: true });
    const privateIndex = `${base}settings/privateTypeIndex.ttl`;
    const repository = instances();

    const instance = await repository.createInstance({ webId, containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "public" });

    const publicIndex = `${await storageOf(base)}settings/publicTypeIndex.ttl`;
    expect(await triples(card)).toContain(`<${webId}> <${SOLID_TERMS}publicTypeIndex> <${publicIndex}> .`);
    expect(await registrationsIn(publicIndex, instance.url)).toEqual(registered(instance.url, ["instance", "catalog", "deck", "card"]));
    expect(await registrationsIn(privateIndex, instance.url)).toEqual(registered(instance.url, ["reviewState", "answer", "draft"]));
    expect(await repository.listInstances(webId)).toContainEqual({ url: instance.url, name: "Main" });

    await repository.deleteInstance({ webId, instance });
    expect(await registrationsIn(publicIndex, instance.url)).toEqual([]);
    expect(await registrationsIn(privateIndex, instance.url)).toEqual([]);
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
