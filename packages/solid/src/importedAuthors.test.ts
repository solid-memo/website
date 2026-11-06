// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseDraftUseCases } from "@solid-memo/application/releaseDrafts";
import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import { draftReleaseModel } from "@solid-memo/domain/release/draftModel";
import { ruleProblems } from "@solid-memo/domain/release/releaseCheck";
import { authorsOf, otherAuthorsOf } from "@solid-memo/domain/release/releaseMetadata";
import { NOW } from "@solid-memo/domain/testing/releaseDraft";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { datasetFromQuads } from "./client/rdf";
import { toStandaloneLibraryDeck } from "./mappers/libraryMapper";
import { parseDeckFile } from "./solidDeckArchive";
import { createSolidReleaseDraftRepository } from "./solidReleaseDraftRepository";
import { draftPod, INSTANCE, POD } from "./testing/releaseDrafts";
import { agentNamesOf } from "./mappers/deckMapper";
import { RDF_TYPE } from "@solid-memo/domain/release/releaseDraft";

type Pod = Awaited<ReturnType<typeof draftPod>>;

const OUTSIDE = "https://outside.example/people#x";

it("publishes an imported release's creator outside it by its IRI, as the Studio shows it (GHSA-wjqr-hw63-jf4c)", async () => {
  const text = `${readFileSync(
    join(DECKS_ROOT, "academy-award-best-picture/v1.ttl"),
    "utf8",
  ).replace("dcterms:creator <#anton-wiklund> ;", `dcterms:creator <${OUTSIDE}> ;`)}
<${OUTSIDE}> a foaf:Agent ; foaf:name "Someone else" .
`;
  const pod = await draftPod();
  const useCases = createReleaseDraftUseCases({
    releaseDraftRepository: pod.repository,
    deckRepository: {} as never,
    deckLibrary: {} as never,
    shapeValidator: {} as never,
    fileExchange: { open: async () => ({ name: "release.ttl", text }), save: () => undefined },
    storageGateway: { discoverStorages: async () => [] },
    now: () => new Date(NOW),
  });
  const created = await useCases.createReleaseDraft(
    INSTANCE,
    { kind: "fromFile" },
    `${POD}profile/card#me`,
  );
  const draft = await useCases.getReleaseDraft(created!.draft.url);
  expect(draft.root.creator).toEqual([OUTSIDE]);
  expect(draft.triples.filter((triple) => triple.subject === OUTSIDE)).toEqual([]);
  expect(draftLibraryDeck(draft).authors).toEqual([OUTSIDE]);
  const target = `${POD}public/releases/academy-award-best-picture/v1.ttl`;
  const turtle = await pod.repository.assemble(draft.url, target, NOW);
  expect(turtle).not.toContain("Someone else");
  const quads = await parseDeckFile(turtle, "turtle", target, null);
  expect(quads.filter((quad) => quad.subject.value === OUTSIDE)).toEqual([]);
  expect(toStandaloneLibraryDeck(target, datasetFromQuads(quads)).authors).toEqual([OUTSIDE]);
});

describe("a creator with no record, whatever its IRI (GHSA-mv57-839j-wrf6)", () => {
  const AGENT = `<#anton-wiklund>
    a foaf:Agent ;
    foaf:name "Anton Wiklund" ;
    foaf:mbox <mailto:antonwiklund91@gmail.com> .`;
  const PUBLISHER = "dcterms:publisher <https://solid-memo.com/decks/index.ttl#solid-memo> ;";
  const CREATOR = "dcterms:creator <#anton-wiklund> ;";
  const TWO_CLASSES = `<#anton-wiklund> a foaf:Agent, dcat:Distribution ; foaf:name "Unseen" ; dcat:accessURL <> .`;
  const WEB_ID = `${POD}profile/card#me`;

  /** A library deck with its creator replaced, and a publisher of its own. */
  const releaseFile = (statements: string, creator = "<#anton-wiklund>") =>
    readFileSync(join(DECKS_ROOT, "academy-award-best-picture/v1.ttl"), "utf8")
      .replace(AGENT, `${statements}\n<#p> a foaf:Agent ; foaf:name "Publisher" .`)
      .replace(PUBLISHER, "dcterms:publisher <#p> ;")
      .replace(CREATOR, `dcterms:creator ${creator} ;`);

  const useCasesOf = (repository: Pod["repository"], text: string) =>
    createReleaseDraftUseCases({
      releaseDraftRepository: repository,
      deckRepository: {} as never,
      deckLibrary: {} as never,
      shapeValidator: {} as never,
      fileExchange: { open: async () => ({ name: "release.ttl", text }), save: () => undefined },
      storageGateway: { discoverStorages: async () => [] },
      now: () => new Date(NOW),
    });

  /** What the Studio holds of a draft and what learners read of its release: no name but where the Studio shows it. */
  const expectNoUnseenName = async (repository: Pod["repository"], url: string) => {
    const { draft } = await repository.read(url);
    expect(authorsOf(draft)).toEqual([]);
    expect(otherAuthorsOf(draft)).toHaveLength(1);
    const [creator] = otherAuthorsOf(draft);
    expect(draftLibraryDeck(draft).authors).toEqual([creator]);
    const target = `${POD}public/releases/academy-award-best-picture/v${draft.root.version}.ttl`;
    const turtle = await repository.assemble(draft.url, target, NOW);
    expect(turtle).not.toContain("Unseen");
    const quads = await parseDeckFile(turtle, "turtle", target, null);
    expect(toStandaloneLibraryDeck(target, datasetFromQuads(quads)).authors).not.toContain(
      "Unseen",
    );
  };

  it("keeps nothing of a subject of the release typed two classes of record, from a file", async () => {
    const pod = await draftPod();
    const created = await useCasesOf(pod.repository, releaseFile(TWO_CLASSES)).createReleaseDraft(
      INSTANCE,
      { kind: "fromFile" },
      WEB_ID,
    );
    await expectNoUnseenName(pod.repository, created!.draft.url);
  });

  it("keeps nothing of the release as an agent when it is its own creator", async () => {
    const pod = await draftPod();
    const created = await useCasesOf(
      pod.repository,
      releaseFile(`<> a foaf:Agent ; foaf:name "Unseen" .`, "<>"),
    ).createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    await expectNoUnseenName(pod.repository, created!.draft.url);
  });

  it("keeps nothing of such a subject in the next version of a release at an address", async () => {
    const other = await draftPod();
    const made = await useCasesOf(
      other.repository,
      releaseFile(`<#p2> a foaf:Agent ; foaf:name "P" .`, "<#p2>"),
    ).createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const address = "https://elsewhere.example/public/releases/x/v1.ttl";
    const published = await other.repository.assemble(made!.draft.url, address, NOW);
    const crafted = `${published}\n<${address}#p2> a <http://www.w3.org/ns/dcat#Distribution> ; <http://xmlns.com/foaf/0.1/name> "Unseen" ; <http://www.w3.org/ns/dcat#accessURL> <${address}> .`;
    const pod = await draftPod();
    const repository = createSolidReleaseDraftRepository({
      fetch: pod.fetch,
      releaseFetch: turtleFetch(crafted),
    });
    const next = await useCasesOf(repository, "").createReleaseDraft(
      INSTANCE,
      { kind: "nextVersionOf", url: address },
      WEB_ID,
    );
    await expectNoUnseenName(repository, next!.draft.url);
  });

  it("still keeps a creator with a record", async () => {
    const pod = await draftPod();
    const created = await useCasesOf(
      pod.repository,
      releaseFile(`<#anton-wiklund> a foaf:Agent ; foaf:name "Seen" .`),
    ).createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const { draft } = await pod.repository.read(created!.draft.url);
    expect(authorsOf(draft).map((node) => node.data.name)).toEqual(["Seen"]);
    expect(
      ruleProblems(draftReleaseModel(draft), "pod").filter((p) => p.code === "strayParts"),
    ).toEqual([]);
    const shapes = await pod.validator.validateRelease(draft, draft.url);
    expect(shapes.filter((p) => p.severity === "error")).toEqual([]);
  });

  it("names a draft's release check a subject it holds typed two classes of record, or itself an agent", async () => {
    const pod = await draftPod();
    const created = await useCasesOf(
      pod.repository,
      releaseFile(`<#anton-wiklund> a foaf:Agent ; foaf:name "Seen" .`),
    ).createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const { draft } = await pod.repository.read(created!.draft.url);
    const type = (subject: string, value: string) => ({
      subject,
      predicate: RDF_TYPE,
      object: { kind: "iri" as const, value },
    });
    const part = `${draft.url}#odd`;
    const written = {
      ...draft,
      triples: [
        ...draft.triples,
        type(part, "http://xmlns.com/foaf/0.1/Agent"),
        type(part, "http://www.w3.org/ns/dcat#Distribution"),
        type(draft.url, "http://xmlns.com/foaf/0.1/Agent"),
      ],
    };
    expect(ruleProblems(draftReleaseModel(written), "pod")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "strayParts", params: { parts: [part, draft.url] } }),
      ]),
    );
  });
});

describe("agentNamesOf (GHSA-mv57-839j-wrf6)", () => {
  const names = async (turtle: string) =>
    agentNamesOf(
      datasetFromQuads(
        await parseDeckFile(`${PREFIXES}${turtle}`, "turtle", "https://x.example/d.ttl", null),
      ),
    );
  const PREFIXES = `@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
`;

  it("names an agent, here or of another document", async () => {
    const named = await names(`<#a> a foaf:Agent ; foaf:name "A" .
<https://other.example/index.ttl#b> a foaf:Agent ; foaf:name "B" .`);
    expect([...named.values()]).toEqual(["A", "B"]);
  });

  it("names no subject that is also of another class a shape describes, nor a release", async () => {
    const named =
      await names(`<#a> a foaf:Agent , dcat:Distribution ; foaf:name "A" ; dcat:accessURL <> .
<> a sm:Deck , foaf:Agent ; foaf:name "R" .`);
    expect(named.size).toBe(0);
  });
});
