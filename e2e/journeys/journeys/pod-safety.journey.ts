// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test as base } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import { createAccount, type CssAccount } from "../harness/cssAccount.ts";
import { bearer, containedIn } from "../harness/podDump.ts";
import type { App } from "../pages/App.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * What Solid Memo leaves alone in a pod (docs/data-model.md "Where an
 * instance's documents are" and "Deleting an instance", docs/studio.md
 * "Publishing a release"). An instance, its catalog and its drafts are
 * data, which whoever may write them may have written: here another
 * user, who shares an instance with the journey's user. Each journey
 * does an everyday thing in the app, then reads the user's own pod with
 * plain requests, as the user, to see their documents as they were:
 * the same status and content, and no document added.
 */

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const PREFIXES = `@prefix sm: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
`;
const CREATED = `"2026-10-01T00:00:00.000Z"^^xsd:dateTime`;

/** A user of the journey's Solid server, making plain requests as themselves, with their client credentials. */
interface PodUser {
  account: CssAccount;
  /** Writes the document at `url`, made or replaced. */
  put(url: string, body: string, contentType?: string): Promise<void>;
  /** What the document at `url` is to the user: its status, and its content when it can be read. */
  read(url: string): Promise<string>;
  /** Every document in the user's pod, but those under `skip`, sorted. */
  documents(skip: readonly string[]): Promise<string[]>;
}

function podUser(api: APIRequestContext, server: string, account: CssAccount): PodUser {
  let token: Promise<string> | undefined;
  const headers = async () => ({
    authorization: `Bearer ${await (token ??= bearer(api, server, account))}`,
  });
  return {
    account,
    async put(url, body, contentType = "text/turtle") {
      const response = await api.put(url, {
        headers: { ...(await headers()), "content-type": contentType },
        data: body,
      });
      if (!response.ok())
        throw new Error(`Writing ${url}: ${response.status()} ${await response.text()}`);
    },
    async read(url) {
      const response = await api.get(url, {
        headers: { ...(await headers()), accept: "text/turtle" },
      });
      return `${response.status()} ${response.ok() ? await response.text() : ""}`;
    },
    async documents(skip) {
      const found: string[] = [];
      const queue = [account.pod];
      while (queue.length > 0) {
        const url = queue.shift()!;
        if (skip.some((folder) => url.startsWith(folder))) continue;
        found.push(url);
        if (!url.endsWith("/")) continue;
        const listing = await api.get(url, {
          headers: { ...(await headers()), accept: "application/ld+json" },
        });
        if (listing.ok()) queue.push(...containedIn(await listing.json(), url));
      }
      return found.sort();
    },
  };
}

/** What the journey's user has in their pod, outside their own instance (`skip`): every document, and the content of those watched. */
async function dataOf(
  user: PodUser,
  watched: readonly string[],
  skip: readonly string[],
): Promise<Record<string, string>> {
  const data: Record<string, string> = { documents: (await user.documents(skip)).join("\n") };
  for (const url of watched) data[url] = await user.read(url);
  return data;
}

const test = base.extend<{ api: APIRequestContext; user: PodUser; otherUser: PodUser }>({
  api: async ({ playwright }, use) => {
    const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });
    await use(api);
    await api.dispose();
  },
  /** The journey's user, who logs in to the app, as plain requests see their pod. */
  user: async ({ api, server, account }, use) => {
    await use(podUser(api, server, account));
  },
  /** Another user of the same server, with an account and a pod of their own. */
  otherUser: async ({ api, server }, use) => {
    const id = randomUUID().replace(/-/g, "").slice(0, 8);
    await use(podUser(api, server, await createAccount(api, server, id)));
  },
});

/** The instance's `meta.ttl`, as Solid Memo writes it. */
function metaOf(name: string): string {
  return `${PREFIXES}<#it> a sm:Instance ; dcterms:title "${name}" ; dcterms:created ${CREATED} ; sm:formatVersion 2 .`;
}

interface DeckEntry {
  id: string;
  title: string;
  cards: string;
  reviews: string;
}

/** A `catalog.ttl` of decks (their documents named as given) and drafts, as Solid Memo writes one. */
function catalogOf(
  name: string,
  publisher: string,
  decks: readonly DeckEntry[],
  drafts: readonly string[] = [],
): string {
  const links = [
    ...decks.map((deck) => `dcat:dataset <#${deck.id}>`),
    ...drafts.map((draft) => `sm:releaseDraft <${draft}>`),
  ];
  const entries = decks.map(
    (deck) => `<#${deck.id}> a sm:Deck, dcat:Dataset ;
  dcterms:title "${deck.title}"@en ; dcterms:description "Flashcards: ${deck.title}."@en ;
  sm:formatVersion 6 ; dcterms:created ${CREATED} ; sm:studyDirection sm:frontToBack ;
  dcat:distribution <#${deck.id}-cards> ;
  sm:cardsDocument <${deck.cards}> ; sm:reviewsDocument <${deck.reviews}> .
<#${deck.id}-cards> a dcat:Distribution ; sm:formatVersion 1 ; dcat:accessURL <${deck.cards}> ;
  dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .`,
  );
  return `${PREFIXES}<#catalog> a dcat:Catalog ; dcterms:title "${name}" ;
  dcterms:description "Flashcard decks of the Solid Memo instance ${name}." ;
  dcterms:publisher <${publisher}> ;
  dcat:themeTaxonomy <https://solid-memo.com/ns/vocab/topics.ttl>, <http://publications.europa.eu/resource/authority/data-theme> ;
  sm:formatVersion 1${links.map((link) => ` ;\n  ${link}`).join("")} .
<${publisher}> a foaf:Agent ; sm:formatVersion 1 ; foaf:name "${publisher}" .
${entries.join("\n")}
`;
}

/** Access rules giving the folder's owner and `sharedWith` all access to it and what is in it. */
function sharedFolderAcl(folder: string, owner: string, sharedWith: string): string {
  return `${PREFIXES}<#owner> a acl:Authorization ; acl:agent <${owner}> ;
  acl:accessTo <${folder}> ; acl:default <${folder}> ; acl:mode acl:Read, acl:Write, acl:Control .
<#shared> a acl:Authorization ; acl:agent <${sharedWith}> ;
  acl:accessTo <${folder}> ; acl:default <${folder}> ; acl:mode acl:Read, acl:Write, acl:Control .
`;
}

/**
 * Another user's instance, in a folder they share with the journey's
 * user, read, write and control: its `meta.ttl` and its `catalog.ttl`,
 * with these decks and drafts. Its address.
 */
async function sharedInstance(
  owner: PodUser,
  sharedWith: string,
  name: string,
  decks: (instance: string) => readonly DeckEntry[],
  drafts: (instance: string) => readonly string[] = () => [],
): Promise<string> {
  const folder = `${owner.account.pod}shared-${randomUUID().slice(0, 8)}/`;
  const instance = `${folder}memo/`;
  await owner.put(`${instance}meta.ttl`, metaOf(name));
  await owner.put(
    `${instance}catalog.ttl`,
    catalogOf(name, owner.account.webId, decks(instance), drafts(instance)),
  );
  await owner.put(`${folder}.acl`, sharedFolderAcl(folder, owner.account.webId, sharedWith));
  return instance;
}

/** The journey's user's documents another's catalog may name: their profile, and a private document of theirs. */
async function privateDocuments(user: PodUser, runId: string) {
  const profile = new URL(user.account.webId).href.replace(/#.*$/, "");
  const diary = `${user.account.pod}private-${runId}/diary.ttl`;
  await user.put(diary, `<#entry> <https://example.org/says> "only mine, ${runId}" .`);
  return { profile, diary };
}

/** From Solid Memo, the open instance's decks, to the picker, where the instance at `url` is attached. */
async function attach(app: App, url: string, name: string): Promise<void> {
  await app.chrome.switchInstance();
  await app.instancePicker.attach(url, name);
}

/** From the Studio back to Solid Memo, and on to the picker, where the instance is deleted. */
async function deleteFromStudio(app: App, name: string): Promise<void> {
  await app.studio.backToApp();
  await app.chrome.switchInstance();
  await app.instancePicker.delete(name);
}

/**
 * An instance another user shares with the journey's user, attached by
 * them, whose catalog names the user's own documents, their profile
 * and a private document, as its decks' documents: the decks are
 * listed, and the Studio's health screen says their documents do not
 * say they are theirs. Removing one deck, then deleting the instance,
 * changes neither document and adds none.
 */
test("removing a deck and deleting an instance someone else shares leave the user's documents as they were @studio", async ({
  app,
  account,
  runId,
  user,
  otherUser,
}) => {
  const name = `Shared ${runId}`;
  const own = `${account.pod}solid-memo/main/`;
  const { profile, diary } = await privateDocuments(user, runId);
  const decks = [
    { id: "deck-a", title: `Alpha ${runId}`, cards: profile, reviews: diary },
    { id: "deck-b", title: `Beta ${runId}`, cards: diary, reviews: profile },
  ];
  const instance = await sharedInstance(otherUser, account.webId, name, () => decks);
  let before: Record<string, string> = {};

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, `Home ${runId}`),
  );

  await app.step("03 · Attach the instance another user shares: its decks are listed", async () => {
    before = await dataOf(user, [profile, diary], [own]);
    await attach(app, instance, name);
    for (const deck of decks) await app.decks.expectDeck(deck.title);
  });

  await app.step(
    "04 · In the Studio's health, the decks' documents do not say they are theirs",
    async () => {
      await app.studio.openFromApp();
      await app.studio.openInstanceHealth(name, []);
      await app.studio.expectUnclaimed(decks[0]!.title, [profile, diary]);
      await app.studio.expectUnclaimed(decks[1]!.title, [diary, profile]);
    },
  );

  await app.step("05 · Remove a deck: the user's documents are as they were", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.select([decks[0]!.title]);
    await app.studio.deleteSelected(name, [decks[0]!.title]);
    expect(await dataOf(user, [profile, diary], [own])).toEqual(before);
  });

  await app.step("06 · Delete the instance: the user's documents are as they were", async () => {
    await deleteFromStudio(app, name);
    expect(await dataOf(user, [profile, diary], [own])).toEqual(before);
    expect(await otherUser.read(`${instance}meta.ttl`)).toBe("404 ");
  });
});

/** The folders between a pod's host and `url`, as `../` steps from inside `url`'s `decks/`. */
const outOf = (url: string) => "../".repeat(new URL(url).pathname.split("/").length - 1);

/**
 * The same, the catalog naming the user's documents by addresses
 * spelled otherwise than a request sends them, which resolve outside
 * the instance: the decks are not listed, the Studio's health names
 * each entry as one Solid Memo does not use, and removing one there,
 * then deleting the instance, changes neither document and adds none.
 */
test("an instance whose catalog names documents by addresses that resolve elsewhere leaves the user's documents as they were @studio", async ({
  app,
  account,
  runId,
  user,
  otherUser,
}) => {
  const name = `Spelled ${runId}`;
  const own = `${account.pod}solid-memo/main/`;
  const { profile, diary } = await privateDocuments(user, runId);
  const path = (url: string) => new URL(url).pathname.slice(1);
  const instance = await sharedInstance(otherUser, account.webId, name, (at) => [
    {
      id: "deck-a",
      title: `Alpha ${runId}`,
      cards: `${at}decks/${outOf(at)}${path(profile)}`,
      reviews: `${at}reviews/${outOf(at)}${path(diary)}`,
    },
    {
      id: "deck-b",
      title: `Beta ${runId}`,
      cards: `${at}decks/${outOf(at).replaceAll("..", "%2e%2E")}${path(diary)}`,
      reviews: `${at}reviews/${outOf(at).replaceAll("..", ".%2e")}${path(profile)}`,
    },
  ]);
  const entries = [`${instance}catalog.ttl#deck-a`, `${instance}catalog.ttl#deck-b`];
  let before: Record<string, string> = {};

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, `Home ${runId}`),
  );

  await app.step("03 · Attach the instance another user shares: no deck is listed", async () => {
    before = await dataOf(user, [profile, diary], [own]);
    await attach(app, instance, name);
    await app.decks.expectShown();
    for (const title of [`Alpha ${runId}`, `Beta ${runId}`])
      await expect(app.decks.deckLink(title)).toBeHidden();
  });

  await app.step(
    "04 · The Studio's health names both decks' entries as ones Solid Memo does not use",
    async () => {
      await app.studio.openFromApp();
      await app.studio.openInstanceHealth(name, []);
      for (const entry of entries)
        await app.studio.expectDataProblem(entry, app.t("validation.constraint.DeckPlace"));
    },
  );

  await app.step(
    "05 · Remove one entry from the health screen: the user's documents are as they were",
    async () => {
      await app.studio.removeData(entries[0]!);
      expect(await dataOf(user, [profile, diary], [own])).toEqual(before);
    },
  );

  await app.step("06 · Delete the instance: the user's documents are as they were", async () => {
    await deleteFromStudio(app, name);
    expect(await dataOf(user, [profile, diary], [own])).toEqual(before);
  });
});

/** A draft's `release.ttl`, a blank course, as Solid Memo writes one. */
function draftRelease(title: string): string {
  return `${PREFIXES}<> a sm:Deck, dcat:Dataset, schema:Course ; dcterms:title "${title}"@en ;
  dcterms:created ${CREATED} ; sm:studyDirection sm:frontToBack ;
  dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ;
  dcat:version "1" ; dcat:inSeries <#series> ; dcat:isVersionOf <#series> ;
  dcat:distribution <#turtle> ; sm:formatVersion 1 .
<#turtle> a dcat:Distribution ; dcat:accessURL <> ; dcat:downloadURL <> ;
  dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> ;
  dcterms:format <http://publications.europa.eu/resource/authority/file-type/RDF_TURTLE> ;
  sm:formatVersion 1 .
`;
}

/**
 * A draft in an instance another user shares, whose chapter has an id
 * no draft can have, one a chapter's document would be named after
 * outside the draft's folder: the Studio does not open the draft, and
 * says why, and the user's pod has no document it did not have.
 */
test("a draft with a chapter id Solid Memo does not accept is not opened, and the user's pod gains no document @studio", async ({
  app,
  account,
  runId,
  user,
  otherUser,
}) => {
  const name = `Drafts ${runId}`;
  const title = `Notes ${runId}`;
  const own = `${account.pod}solid-memo/main/`;
  // Where a chapter's document would be, named after the id below: in the user's pod.
  const elsewhere = `${account.pod}notes-${runId}`;
  let draft = "";
  const instance = await sharedInstance(
    otherUser,
    account.webId,
    name,
    () => [],
    (at) => {
      draft = `${at}drafts/notes/v1/release.ttl`;
      return [draft];
    },
  );
  const folder = draft.slice(0, draft.lastIndexOf("/") + 1);
  const steps = new URL(`${folder}chapter-a/`).pathname.split("/").length - 2;
  const id = `a/${"../".repeat(steps)}${new URL(elsewhere).pathname.slice(1)}`;
  await otherUser.put(draft, draftRelease(title));
  await otherUser.put(
    `${folder}chapter-ch-pods.ttl`,
    `${PREFIXES}<#${id}> a sm:Chapter, schema:Syllabus ; dcterms:title "Pods"@en ;
  schema:isPartOf <release.ttl> ; schema:position 0 ; sm:formatVersion 1 .`,
  );
  let before: Record<string, string> = {};

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, `Home ${runId}`),
  );
  await app.step("03 · Attach the instance another user shares", async () => {
    before = await dataOf(user, [], [own]);
    await attach(app, instance, name);
  });

  await app.step(
    "04 · Open its draft in the Studio: it is not opened, and the screen says why",
    async () => {
      await app.studio.openFromApp();
      await app.studio.openDrafts(name);
      await app.draftEditor.openRefused(title, app.t("errors.draftIdUnsupported", { id }));
    },
  );

  await app.step("05 · The user's pod has no document it did not have", async () => {
    expect(await dataOf(user, [], [own])).toEqual(before);
    expect(await user.read(elsewhere)).toBe("404 ");
    expect(await user.read(`${elsewhere}.ttl`)).toBe("404 ");
  });
});

/**
 * Has the server name `accessControl` as the access control of every
 * release in a releases folder (its `Link: <…>; rel="acl"`), on reads:
 * an address elsewhere in the user's pod. How many answers named it.
 */
async function nameAccessControl(page: Page, accessControl: string): Promise<{ count: number }> {
  const named = { count: 0 };
  await page.route(/\/releases\/[^/]+\/v\d+\.ttl$/, async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) return route.fallback();
    const response = await route.fetch();
    const headers = response.headers();
    const link = headers.link ?? "";
    headers.link = link.replace(/<[^>]*>;\s*rel="acl"/, `<${accessControl}>; rel="acl"`);
    if (headers.link !== link) named.count += 1;
    await route.fulfill({ response, headers });
  });
  return named;
}

/**
 * Publishing a release, and making it public, where the server names
 * an access control elsewhere in the user's pod as the release's: the
 * user's private document keeps its access control as it was, and
 * someone with no login still cannot read it. The release is not made
 * public, and the Studio says so.
 */
test("publishing and making public a release whose server names another access control keep the user's documents private @studio", async ({
  app,
  account,
  runId,
  user,
  api,
}) => {
  const instance = `Releases ${runId}`;
  const own = `${account.pod}solid-memo/main/`;
  const { diary } = await privateDocuments(user, runId);
  const diaryAcl = `${diary}.acl`;
  await user.put(
    diaryAcl,
    `${PREFIXES}<#owner> a acl:Authorization ; acl:agent <${account.webId}> ;
  acl:accessTo <${diary}> ; acl:mode acl:Read, acl:Write, acl:Control .`,
  );
  const title = BRIGHTEST_STARS.en;
  let before: Record<string, string> = {};
  let url = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, instance),
  );

  await app.step("03 · In the Studio, draft the next version of a library release", async () => {
    await app.studio.openFromApp();
    await app.studio.openDrafts(instance);
    await app.studio.draftNextVersion(
      "https://solid-memo.com/decks/brightest-stars/v1.ttl",
      title,
      2,
    );
    await app.draftEditor.openDraft(title, { course: false });
  });

  await app.step(
    "04 · Publish it, the server naming another access control: it is not made public, and the user's document stays private",
    async () => {
      before = await dataOf(user, [diary, diaryAcl], [own]);
      expect((await api.get(diary)).status(), "someone with no login reads the document").toBe(401);
      const named = await nameAccessControl(app.page, diaryAcl);
      await app.draftEditor.openRelease();
      url = await app.draftEditor.publishNotPublic();
      expect(named.count, "answers naming the other access control").toBeGreaterThan(0);
      expect(await dataOf(user, [diary, diaryAcl], [own])).toEqual(before);
      expect((await api.get(diary)).status(), "someone with no login reads the document").toBe(401);
    },
  );

  await app.step(
    "05 · Make it public: it is not, and the user's document stays private",
    async () => {
      await app.draftEditor.makePublicRefused(url);
      expect(await dataOf(user, [diary, diaryAcl], [own])).toEqual(before);
      expect((await api.get(diary)).status(), "someone with no login reads the document").toBe(401);
    },
  );
});

/**
 * A deck's cards document that another app also keeps data in:
 * deleting the instance removes Solid Memo's cards from it and keeps
 * the document, with the other app's data, and the picker says how many
 * documents it kept, and why.
 */
test("deleting an instance keeps another app's data in a deck's document, and says so @studio", async ({
  app,
  account,
  runId,
  user,
}) => {
  const instance = `Kept ${runId}`;
  const deck = `Deck ${runId}`;
  const catalog = `${account.pod}solid-memo/main/catalog.ttl`;
  let cards = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, instance),
  );
  await app.step("03 · Create a deck of one card", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([[`Sun ${runId}`, "Sol"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("04 · Another app keeps data of its own in the deck's document", async () => {
    const said = /v1\.ttl#cardsDocument>\s+<([^>]+)>/.exec(await user.read(catalog));
    cards = said![1]!;
    const served = (await user.read(cards)).replace(/^200 /, "");
    await user.put(cards, `${served}\n<#note-${runId}> <https://other.example/says> "mine" .\n`);
  });

  await app.step(
    "05 · Delete the instance: the document is kept, with the other app's data, and the picker says so",
    async () => {
      await app.chrome.switchInstance();
      await app.instancePicker.delete(instance);
      await app.instancePicker.expectKeptDocuments(1);
      const kept = await user.read(cards);
      expect(kept).toMatch(/^200 /);
      expect(kept).toContain(`"mine"`);
      expect(kept).not.toContain(`${SM}Card`);
      expect(kept).not.toContain(`Sun ${runId}`);
    },
  );
});

/**
 * An instance laid out flat, at the pod's root, with a deck written
 * before documents said whose they are: it is read and studied, its
 * cards document left as it is, and the Studio's health asks the user
 * to confirm that the document is the deck's. Once they do, a card is
 * added to it, studied, and the deck removed with its documents, the
 * rest of the pod as it was.
 */
test("an instance at a pod's root with an older deck is read and studied, and changed once the user confirms its documents @studio", async ({
  app,
  account,
  runId,
  user,
}) => {
  const name = `Flat ${runId}`;
  const deck = `Older ${runId}`;
  const root = account.pod;
  const cards = `${root}flat-${runId}-cards.ttl`;
  const reviews = `${root}flat-${runId}-reviews.ttl`;
  const profile = account.webId.replace(/#.*$/, "");
  await user.put(`${root}meta.ttl`, metaOf(name));
  await user.put(
    `${root}catalog.ttl`,
    catalogOf(name, account.webId, [{ id: "deck-older", title: deck, cards, reviews }]),
  );
  // As written before a deck's documents said whose they are: no dcterms:isPartOf.
  await user.put(
    cards,
    `${PREFIXES}<#card-1> a sm:Card ; sm:front "Moon ${runId}"@en ; sm:back "Måne"@sv ;
  dcterms:created ${CREATED} ; sm:formatVersion 6 .`,
  );
  let written = "";
  let before: Record<string, string> = {};

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, `Home ${runId}`),
  );

  await app.step("03 · Attach the instance at the pod's root: its deck is listed", async () => {
    await attach(app, root, name);
    await app.decks.expectToReview(deck, 1);
  });

  await app.step(
    "04 · Study the deck: the answer is kept, and its cards document is as it was",
    async () => {
      written = await user.read(cards);
      await app.decks.study(deck);
      await app.study.studyAll({ grade: "good" });
      await app.study.endSession();
      await app.decks.expectDoneForToday(deck);
      expect(await user.read(cards)).toBe(written);
      expect(await user.read(reviews)).toMatch(/^200 /);
    },
  );

  await app.step(
    "05 · In the Studio's health, confirm that the deck's documents are its own",
    async () => {
      await app.studio.openFromApp();
      await app.studio.openInstanceHealth(name, []);
      await app.studio.expectUnclaimed(deck, [cards]);
      await app.studio.claimDocuments(deck);
    },
  );

  await app.step("06 · Add a card to the deck and study it", async () => {
    await app.studio.backToApp();
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([[`Star ${runId}`, "Stjärna"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.study(deck);
    await app.study.studyAll({ grade: "good" });
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
  });

  await app.step(
    "07 · Remove the deck in the Studio: its documents go, and the rest of the pod is as it was",
    async () => {
      before = await dataOf(user, [profile, `${root}README`], []);
      await app.studio.openFromApp();
      await app.studio.select([deck]);
      await app.studio.deleteSelected(name, [deck]);
      expect(await user.read(cards)).toBe("404 ");
      expect(await user.read(reviews)).toBe("404 ");
      const after = await dataOf(user, [profile, `${root}README`], []);
      expect(after[profile]).toBe(before[profile]);
      expect(after[`${root}README`]).toBe(before[`${root}README`]);
      const gone = new Set([cards, reviews]);
      expect(after.documents!.split("\n")).toEqual(
        before.documents!.split("\n").filter((url) => !gone.has(url)),
      );
    },
  );
});
