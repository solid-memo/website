// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Where an instance is registered against a real Solid server
 * (docs/data-model.md): a profile without a private type index gets one,
 * made in the storage the instance is in (not at the server's root, which
 * may be another pod's), linked from the WebID document, or, where that
 * cannot be written (as on Inrupt PodSpaces), from an extended profile it
 * names. The instance alone is registered, by which Solid Memo finds it;
 * its data gets no registration of its own. The registrations earlier
 * versions wrote for each class of its data, which an index may still
 * hold, take the instance's new name with it and go when the instance is
 * removed, or on the user's say, while another app's stay. Runs against each server
 * globalSetup.ts starts. Every run here shares the storage's one type
 * index; a file's tests run one at a time.
 */
import { Parser, Writer } from "n3";
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { aclOf, storageOf } from "./serverTraits";

const SERVERS = inject("solidServers");
const PRIVATE_TYPE_INDEX = "http://www.w3.org/ns/solid/terms#privateTypeIndex";
const SOLID_TERMS = "http://www.w3.org/ns/solid/terms#";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** The instance repository as createAppUseCases wires it. */
function instances() {
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  return createSolidInstanceRepository({
    fetch,
    checkWrite: shapeValidator.checkSubjects,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  });
}

async function put(url: string, body: string): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body,
  });
  if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
}

/** A document as N-Triples: every IRI written out in full. */
async function triples(url: string): Promise<string> {
  const turtle = await fetch(url, { headers: { accept: "text/turtle" } }).then((response) =>
    response.text(),
  );
  return new Writer({ format: "N-Triples" }).quadsToString(
    new Parser({ baseIRI: url }).parse(turtle),
  );
}

/**
 * A WebID document in a fresh folder, naming the extended profiles given
 * and, when asked, a private type index in the folder, which is made
 * (else it names none); and the folder.
 */
async function profile(
  server: string,
  seeAlso: (base: string) => string[] = () => [],
  { privateIndex = false } = {},
) {
  const base = new URL(`run-${crypto.randomUUID()}/`, server).href;
  const card = `${base}profile/card`;
  const index = `${base}settings/privateTypeIndex.ttl`;
  if (privateIndex)
    await put(index, `<> a <${SOLID_TERMS}TypeIndex>, <${SOLID_TERMS}UnlistedDocument> .`);
  // A statement each: Solid-Nextcloud stores `<#me> a <Person> ; <p> <o>` as `<#me> <Person> <p>`.
  const links = [
    ...seeAlso(base).map(
      (url) => `\n<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${url}> .`,
    ),
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
  const acp = /<http:\/\/www\.w3\.org\/ns\/solid\/acp#AccessControlResource>;\s*rel="type"/.test(
    (await fetch(control, { method: "HEAD" })).headers.get("link") ?? "",
  );
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
  const write = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/sparql-update" },
    body: `INSERT DATA { <#x> <#y> "z" . };`,
  });
  expect(write.ok, `${url} is still writable`).toBe(false);
}

/** The registrations in a type index of what lies in `container`: each one's class, predicate, what it names, and title; sorted. */
async function registrationsIn(index: string, container: string) {
  const turtle = await fetch(index, { headers: { accept: "text/turtle" } }).then((response) =>
    response.text(),
  );
  const quads = new Parser({ baseIRI: index }).parse(turtle);
  const of = (subject: (typeof quads)[number]["subject"], predicate: string) =>
    quads
      .filter((quad) => quad.subject.equals(subject) && quad.predicate.value === predicate)
      .map((quad) => quad.object.value);
  return quads
    .filter((quad) =>
      [`${SOLID_TERMS}instance`, `${SOLID_TERMS}instanceContainer`].includes(quad.predicate.value),
    )
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

/** The classes of an instance's data earlier versions registered, beside the instance itself. */
type DataClass = "instance" | "catalog" | "deck" | "card" | "reviewState" | "answer" | "draft";

/** What each class of an instance's data is registered as, in the order registrationsIn sorts them. */
function registered(container: string, classes: DataClass[], title = "Main") {
  const all = {
    instance: { forClass: [`${SM}Instance`], predicate: "instanceContainer", target: container },
    catalog: {
      forClass: ["http://www.w3.org/ns/dcat#Catalog"],
      predicate: "instance",
      target: `${container}catalog.ttl#catalog`,
    },
    deck: { forClass: [`${SM}Deck`], predicate: "instance", target: `${container}catalog.ttl` },
    card: { forClass: [`${SM}Card`], predicate: "instanceContainer", target: `${container}decks/` },
    reviewState: {
      forClass: [`${SM}ReviewState`],
      predicate: "instanceContainer",
      target: `${container}reviews/`,
    },
    answer: {
      forClass: [`${SM}Answer`],
      predicate: "instanceContainer",
      target: `${container}history/`,
    },
    draft: {
      forClass: [`${SM}Deck`],
      predicate: "instanceContainer",
      target: `${container}drafts/`,
    },
  };
  return classes
    .map((dataClass) => ({ ...all[dataClass], subject: expect.any(String), title: [title] }))
    .sort((a, b) => a.target.localeCompare(b.target));
}

/** The id prefix earlier versions gave each class's registration. */
const LEGACY_PREFIX: Record<Exclude<DataClass, "instance">, string> = {
  catalog: "sm-cat",
  deck: "sm-deck",
  card: "sm-card",
  reviewState: "sm-review",
  answer: "sm-answer",
  draft: "sm-draft",
};

/**
 * Add to a type index the registrations an earlier version wrote for
 * classes of the instance's data, titled "Main", as it wrote them; and,
 * when given, another app's registration of a folder of its own inside the
 * instance's container, which is not the instance's data.
 */
async function seedLegacyRegistrations(
  index: string,
  container: string,
  classes: Exclude<DataClass, "instance">[],
  foreignFolder?: string,
): Promise<void> {
  const statements = classes.map((dataClass) => {
    const [registration] = registered(container, [dataClass]);
    const subject = `<${index}#${LEGACY_PREFIX[dataClass]}-${crypto.randomUUID()}>`;
    // A statement each: Solid-Nextcloud stores `<s> a <C> ; <p> <o>` as `<s> <C> <p>`.
    return [
      `${subject} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${SOLID_TERMS}TypeRegistration> .`,
      `${subject} <${SOLID_TERMS}forClass> <${registration!.forClass[0]}> .`,
      `${subject} <${SOLID_TERMS}${registration!.predicate}> <${registration!.target}> .`,
      `${subject} <http://purl.org/dc/terms/title> "Main" .`,
    ].join("\n");
  });
  if (foreignFolder !== undefined) {
    const subject = `<${index}#other-app>`;
    statements.push(
      [
        `${subject} <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${SOLID_TERMS}TypeRegistration> .`,
        `${subject} <${SOLID_TERMS}forClass> <${SM}Card> .`,
        `${subject} <${SOLID_TERMS}instanceContainer> <${foreignFolder}> .`,
        `${subject} <http://purl.org/dc/terms/title> "Other" .`,
      ].join("\n"),
    );
  }
  const insertion = await fetch(index, {
    method: "PATCH",
    headers: { "content-type": "application/sparql-update" },
    body: `INSERT DATA { ${statements.join("\n")} }`,
  });
  expect(insertion.ok, `PATCH ${index}: ${insertion.status}`).toBe(true);
}

describe.each(SERVERS)("registering an instance on $name", ({ url: server }) => {
  it("makes a type index in the instance's storage, linked from a WebID document that has none", async () => {
    const { base, card, webId } = await profile(server);
    const repository = instances();

    const instance = await repository.createInstance({
      webId,
      containerUrl: `${base}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });

    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    expect(await triples(card)).toContain(`<${webId}> <${PRIVATE_TYPE_INDEX}> <${index}> .`);
    expect(await repository.listInstances(webId)).toContainEqual(
      expect.objectContaining({ url: instance.url }),
    );
  });

  it("registers the instance alone in it, by which Solid Memo finds it, and unregisters it when deleted", async () => {
    const { base, webId } = await profile(server);
    const repository = instances();

    const instance = await repository.createInstance({
      webId,
      containerUrl: `${base}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });

    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    expect(await registrationsIn(index, instance.url)).toEqual(
      registered(instance.url, ["instance"]),
    );
    expect(await repository.listInstances(webId)).toContainEqual({
      url: instance.url,
      name: "Main",
    });

    await repository.deleteInstance({ webId, instance });
    expect(await registrationsIn(index, instance.url)).toEqual([]);
  });

  it("renames and removes the registrations an earlier version wrote for each class of the instance's data, and keeps another app's", async () => {
    const { base, webId } = await profile(server, () => [], { privateIndex: true });
    const index = `${base}settings/privateTypeIndex.ttl`;
    const repository = instances();
    const instance = await repository.createInstance({
      webId,
      containerUrl: `${base}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });
    const legacy = ["catalog", "deck", "card", "reviewState", "answer", "draft"] as const;
    const foreign = {
      subject: `${index}#other-app`,
      forClass: [`${SM}Card`],
      predicate: "instanceContainer",
      target: `${instance.url}other-app/`,
      title: ["Other"],
    };
    await seedLegacyRegistrations(index, instance.url, [...legacy], foreign.target);
    const all = [...registered(instance.url, ["instance", ...legacy]), foreign].sort((a, b) =>
      a.target.localeCompare(b.target),
    );
    expect(await registrationsIn(index, instance.url)).toEqual(all);
    expect(await repository.listInstances(webId)).toContainEqual({
      url: instance.url,
      name: "Main",
    });

    // Renamed, the instance's registrations take the new name, earlier versions' too; another app's keeps its own.
    await repository.renameRegistrations({ webId, instanceUrl: instance.url, title: "Renamed" });
    expect(await registrationsIn(index, instance.url)).toEqual(
      [...registered(instance.url, ["instance", ...legacy], "Renamed"), foreign].sort((a, b) =>
        a.target.localeCompare(b.target),
      ),
    );

    // Taken off the list, every one of the instance's goes; another app's stays.
    await repository.detachInstance({ webId, instance });
    expect(await registrationsIn(index, instance.url)).toEqual([foreign]);
  });

  it("lists and removes, on the user's say, the registrations an earlier version wrote for the instance's data and nothing else", async () => {
    const { base, webId } = await profile(server, () => [], { privateIndex: true });
    const index = `${base}settings/privateTypeIndex.ttl`;
    const repository = instances();
    const instance = await repository.createInstance({
      webId,
      containerUrl: `${base}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });
    const legacy = ["catalog", "deck", "card", "reviewState", "answer", "draft"] as const;
    const foreign = {
      subject: `${index}#other-app`,
      forClass: [`${SM}Card`],
      predicate: "instanceContainer",
      target: `${instance.url}other-app/`,
      title: ["Other"],
    };
    await seedLegacyRegistrations(index, instance.url, [...legacy], foreign.target);
    // The instance's cards registered as an earlier version did, but not by its name for them: maybe another app's.
    const lookalike = {
      subject: `${index}#cards`,
      forClass: [`${SM}Card`],
      predicate: "instanceContainer",
      target: `${instance.url}decks/`,
      title: ["Lookalike"],
    };
    const insertion = await fetch(index, {
      method: "PATCH",
      headers: { "content-type": "application/sparql-update" },
      body: `INSERT DATA {
        <${lookalike.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${SOLID_TERMS}TypeRegistration> .
        <${lookalike.subject}> <${SOLID_TERMS}forClass> <${SM}Card> .
        <${lookalike.subject}> <${SOLID_TERMS}instanceContainer> <${lookalike.target}> .
        <${lookalike.subject}> <http://purl.org/dc/terms/title> "Lookalike" .
      }`,
    });
    expect(insertion.ok, `PATCH ${index}: ${insertion.status}`).toBe(true);
    const args = { webId, instanceUrl: instance.url };

    expect(await repository.readOldRegistrations(args)).toEqual({
      registrations: legacy.map((dataClass) => ({ dataClass, index: "private" })),
      unreadableIndexes: [],
    });

    await repository.removeOldRegistrations(args);
    // The instance's registration stays, and so do another app's and the lookalike.
    expect(await registrationsIn(index, instance.url)).toEqual(
      [...registered(instance.url, ["instance"]), foreign, lookalike].sort((a, b) =>
        a.target.localeCompare(b.target),
      ),
    );
    expect(await repository.readOldRegistrations(args)).toEqual({
      registrations: [],
      unreadableIndexes: [],
    });
    expect(await repository.listInstances(webId)).toContainEqual({
      url: instance.url,
      name: "Main",
    });
  });

  it("registers an instance publicly alone, and removes it and an earlier version's registrations of its data from both indexes when deleted", async () => {
    const { base, card, webId } = await profile(server, () => [], { privateIndex: true });
    const privateIndex = `${base}settings/privateTypeIndex.ttl`;
    const repository = instances();

    const instance = await repository.createInstance({
      webId,
      containerUrl: `${base}solid-memo/`,
      name: "Main",
      registrationTarget: "public",
    });

    const publicIndex = `${await storageOf(base)}settings/publicTypeIndex.ttl`;
    expect(await triples(card)).toContain(
      `<${webId}> <${SOLID_TERMS}publicTypeIndex> <${publicIndex}> .`,
    );
    expect(await registrationsIn(publicIndex, instance.url)).toEqual(
      registered(instance.url, ["instance"]),
    );
    expect(await registrationsIn(privateIndex, instance.url)).toEqual([]);
    expect(await repository.listInstances(webId)).toContainEqual({
      url: instance.url,
      name: "Main",
    });

    // As an earlier version registered a public instance's data: its review states, answers and drafts privately.
    await seedLegacyRegistrations(publicIndex, instance.url, ["catalog", "deck", "card"]);
    await seedLegacyRegistrations(privateIndex, instance.url, ["reviewState", "answer", "draft"]);
    expect(await registrationsIn(publicIndex, instance.url)).toEqual(
      registered(instance.url, ["instance", "catalog", "deck", "card"]),
    );
    expect(await registrationsIn(privateIndex, instance.url)).toEqual(
      registered(instance.url, ["reviewState", "answer", "draft"]),
    );

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

    const instance = await repository.createInstance({
      webId,
      containerUrl: `${base}solid-memo/`,
      name: "Main",
      registrationTarget: "private",
    });

    const index = `${await storageOf(base)}settings/privateTypeIndex.ttl`;
    expect(await triples(`${base}extended/profile`)).toContain(
      `<${webId}> <${PRIVATE_TYPE_INDEX}> <${index}> .`,
    );
    expect(await triples(card)).toBe(before);
    expect(await repository.listInstances(webId)).toContainEqual(
      expect.objectContaining({ url: instance.url }),
    );
  });

  it("refuses, saying where it tried, and keeps no instance, when no profile document can be written", async () => {
    const { base, card, webId } = await profile(server);
    await readOnly(card);

    await expect(
      instances().createInstance({
        webId,
        containerUrl: `${base}solid-memo/`,
        name: "Main",
        registrationTarget: "private",
      }),
    ).rejects.toMatchObject({
      code: "privateTypeIndexNotLinked",
      message: expect.stringContaining(card),
    });
    expect(await fetch(`${base}solid-memo/meta.ttl`).then((response) => response.status)).toBe(404);
  });
});
