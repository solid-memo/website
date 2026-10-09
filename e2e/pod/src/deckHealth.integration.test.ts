// @vitest-environment node
/**
 * A deck's health in the Studio (UseCases.checkDeck) against a real Solid
 * server: it reads the deck's entry, its cards and its reviews documents,
 * checks them against the shapes, and finds what else is wrong with its
 * cards: sides that state no language, cards that say the same, and text
 * in Markdown the check passed in finds a problem in. Removing what the
 * shapes refuse and no repair covers (UseCases.applyRepairs) clears it,
 * and a document still at the version the digest says conformed is not
 * checked again. It writes nothing but the digest's receipts and the
 * removal.
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { SM_NS as SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { healthProblemCount } from "@solid-memo/domain/deckHealth";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, versioned } from "./serverTraits";

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it, which counts the shape checks of each document it makes. */
function page() {
  const writeFence = createWriteFence(fetch);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checked: string[] = [];
  const validateDocumentSince: typeof shapeValidator.validateDocumentSince = async (url, version) => {
    const since = await shapeValidator.validateDocumentSince(url, version);
    if (!since.unchanged) checked.push(url);
    return since;
  };
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  const useCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator: { ...shapeValidator, validateDocumentSince },
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
  });
  return { useCases, checked };
}

/** What the markdown package would find of an HTML tag: the domain takes any check. */
const text = {
  plain: (value: string) => value.replace(/[*_]/g, ""),
  check: (value: string) => (value.includes("<") ? [{ code: "html" }] : []),
};

const created = `dcterms:created "2026-10-01T10:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ; sm:formatVersion 5`;

/**
 * An instance with a deck whose cards hold one problem of each kind: two
 * that say the same, one whose front states no language, one in Markdown
 * with an HTML tag, and one with no back, which its shape refuses. Its
 * text is ASCII: once a subject is removed from a document seeded with
 * "å", the Community Solid Server serves it a byte short for each such
 * letter, its last "." gone, and it no longer parses.
 */
async function seed(server: string): Promise<{ instanceUrl: string; deck: Deck }> {
  const base = new URL(`deck-health-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const { useCases } = page();
  const instance = await useCases.createInstance({ webId }, { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });
  const deck = await useCases.createDeck(instance.url, { en: "Birds" });
  await put(
    deck.cardsDocumentUrl,
    `@prefix sm: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<#owl> a sm:Card ; sm:front "uggla"@sv ; sm:back "owl"@en ; ${created} .
<#owl-again> a sm:Card ; sm:front "uggla"@sv ; sm:back "owl"@en ; ${created} .
<#gull> a sm:Card ; sm:front "fiskmas" ; sm:back "gull"@en ; ${created} .
<#crow> a sm:Card ; sm:front "kraka"@sv ; sm:back "<b>crow</b>"@en ; sm:textFormat sm:markdown ; ${created} .
<#wren> a sm:Card ; sm:front "gardsmyg"@sv ; ${created} .
`,
  );
  return { instanceUrl: instance.url, deck };
}

describe.each(SERVERS)("a deck's health on $name", ({ url: server }) => {
  /** Whether this server gives an ETag on a read, and whether an edit within the second keeps it; asked once (serverTraits.ts). */
  let etags = false;
  let unreliableEtags = false;
  beforeAll(async () => {
    const probe = new URL(`etag-${crypto.randomUUID()}.ttl`, server).href;
    await fetch(probe, { method: "PUT", headers: { "content-type": "text/turtle" }, body: `<#a> <#b> "1" .` });
    etags = await versioned(probe);
    unreliableEtags = etags && !(await etagMarksEveryEdit(server));
  });

  it("finds what the shapes refuse in the deck's documents and what else is wrong with its cards", async () => {
    const { instanceUrl, deck } = await seed(server);
    const { useCases, checked } = page();
    const health = await useCases.checkDeck(instanceUrl, deck, text);
    expect(checked).toEqual(expect.arrayContaining([`${instanceUrl}catalog.ttl`, deck.cardsDocumentUrl, deck.reviewsDocumentUrl]));
    expect(checked).toHaveLength(3);
    const failing = health.report.documents.flatMap((document) =>
      document.subjects.filter((subject) => subject.status === "checked" && subject.violations.some((v) => v.severity === "violation")),
    );
    expect(failing.map((subject) => subject.url)).toEqual([`${deck.cardsDocumentUrl}#wren`]);
    expect(health.unstated!.map(({ card, place }) => [card.id, place])).toEqual([["gull", { tab: "content", part: "front" }]]);
    expect(health.duplicates.map((group) => group.map(({ id }) => id).sort())).toEqual([["owl", "owl-again"]]);
    expect(health.markdown.map(({ card, place, language }) => [card.id, place, language])).toEqual([["crow", { tab: "content", part: "back" }, "en"]]);
    expect(healthProblemCount(health)).toBe(health.report.violationCount + 3);
  });

  it("clears what the shapes refuse once the user removes what no repair covers", async () => {
    const { instanceUrl, deck } = await seed(server);
    const { useCases } = page();
    const health = await useCases.checkDeck(instanceUrl, deck, text);
    const plan = useCases.planRepair(health.report);
    expect(plan.repairs).toEqual([]);
    expect(plan.unrepairable.map((problem) => problem.subjectUrl)).toEqual([`${deck.cardsDocumentUrl}#wren`]);
    await useCases.applyRepairs(
      plan.unrepairable.map(({ documentUrl, subjectUrl }) => ({ kind: "remove-subject" as const, documentUrl, subjectUrl, version: 1 })),
    );
    const again = await page().useCases.checkDeck(instanceUrl, deck, text);
    expect(again.report.violationCount).toBe(0);
    expect(healthProblemCount(again)).toBe(3);
  });

  it("checks again only the documents changed since they conformed", async (context) => {
    if (!etags) return context.skip("this server gives no ETag on a read, so no receipt is kept");
    if (unreliableEtags) return context.skip(ETAG_OUTLIVES_EDITS);
    const { instanceUrl, deck } = await seed(server);
    const first = page();
    await first.useCases.checkDeck(instanceUrl, deck, text);
    // The digest's receipts are written after the check, in the background.
    await expect.poll(async () => {
      const again = page();
      await again.useCases.checkDeck(instanceUrl, deck, text);
      return again.checked;
      // Given time: with every server's suite running at once, the background write can take more than a second.
    }, { timeout: 10_000 }).not.toContain(`${instanceUrl}catalog.ttl`);
    const again = page();
    const health = await again.useCases.checkDeck(instanceUrl, deck, text);
    // The cards document does not conform, so it has no receipt and is checked every time.
    expect(again.checked).toContain(deck.cardsDocumentUrl);
    expect(health.report.violationCount).toBeGreaterThan(0);
  });
});
