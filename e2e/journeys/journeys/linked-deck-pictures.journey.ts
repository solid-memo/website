// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Route } from "@playwright/test";
import { expect, test } from "../fixtures.ts";

const AUTHOR = "https://author.example";
const RELEASE = `${AUTHOR}/decks/pictures/v1.ttl`;
const DECK = "A deck with pictures";
const SERVER = "author.example";
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>';

const release = `@base <${RELEASE}> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix adms: <http://www.w3.org/ns/adms#> .
<> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ;
  dcterms:title "${DECK}"@en ; dcterms:description "A deck."@en ;
  dcterms:creator <#a> ; dcterms:publisher <#a> ;
  dcterms:license <https://creativecommons.org/publicdomain/zero/1.0/> ;
  dcterms:issued "2026-10-10T10:00:00Z"^^xsd:dateTime ;
  sm:studyDirection sm:frontToBack ;
  dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ;
  dcterms:language <http://publications.europa.eu/resource/authority/language/ENG> ;
  dcat:version "1" ; adms:versionNotes "First release." ;
  dcat:inSeries <#series> ; dcat:isVersionOf <#series> ;
  dcat:distribution <#turtle> ;
  sm:deckPictureHost "author.example" .
<#series> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ;
  dcterms:title "${DECK}"@en ; dcterms:description "A deck."@en ; dcterms:publisher <#a> ;
  dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ;
  dcat:first <> ; dcat:last <> ; dcat:hasVersion <> ; dcat:hasCurrentVersion <> .
<#a> a foaf:Agent ; foaf:name "Author" .
<#turtle> a dcat:Distribution ; dcat:accessURL <> ; dcat:downloadURL <> ;
  dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .
<https://creativecommons.org/publicdomain/zero/1.0/> a dcterms:LicenseDocument .
<#c1> a sm:Card ; sm:formatVersion 5 ; sm:front "One"@en ; sm:back "Ett"@en ;
  sm:frontImage <${AUTHOR}/p/c1-front.svg> ; sm:backImage <${AUTHOR}/p/c1-back.svg> .
<#c2> a sm:Card ; sm:formatVersion 5 ; sm:front "Two"@en ; sm:back "Tva"@en ;
  sm:frontImage <${AUTHOR}/p/c2-front.svg> ; sm:backImage <${AUTHOR}/p/c2-back.svg> .
`;

/**
 * A deck added by link whose cards name pictures on its author's server
 * (docs/privacy.md, Pictures on a deck added by link), a guest's, as the
 * pod has nothing to do with it. The author's server is the route below,
 * which logs each picture asked for, and every request goes to it anew:
 * routing turns the browser's HTTP cache off.
 *
 * What it catches: a picture requested before the learner chose its
 * host, on adding the release and in study (other screens' are held by
 * Workspace.test.tsx); the answer's picture
 * requested only at the reveal, which would tell the server when it came;
 * a `Referer` sent with one; a release that sets the learner's choice
 * itself, as this one tries; and a choice not kept for the deck's next card.
 */
test("the pictures of a deck added by link wait for the learner @pictures", async ({ app }) => {
  const asked: string[] = [];
  const serve = (route: Route) => {
    const request = route.request();
    if (request.url() === RELEASE) {
      return route.fulfill({
        contentType: "text/turtle",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: release,
      });
    }
    // What the release says of its creator's catalog, say, is not here.
    if (!request.url().startsWith(`${AUTHOR}/p/`)) {
      return route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    expect(request.headers().referer).toBeUndefined();
    asked.push(new URL(request.url()).pathname.replace("/p/", ""));
    return route.fulfill({
      contentType: "image/svg+xml",
      headers: { "Cache-Control": "no-store" },
      body: SVG,
    });
  };
  await app.page.route(`${AUTHOR}/**`, serve);
  const card = async () => ((await app.study.question()).includes("One") ? "c1" : "c2");

  await app.step(
    "01 · Try Solid Memo as a guest",
    async () => {
      await app.onboarding.visit();
      await app.onboarding.tryAsGuest();
    },
    { accessibility: false },
  );

  await app.step(
    "02 · Show the release at its link: it says its pictures stay hidden",
    async () => {
      await app.importUrl.openFromDeckList();
      await app.importUrl.showDeck(RELEASE, DECK, { version: 1, notes: "First release." });
      await app.importUrl.expectPicturesHidden();
      expect(asked).toEqual([]);
    },
    { screen: "import-url" },
  );

  await app.step(
    "03 · Add it and study a card: its text, and the choice in its picture's place",
    async () => {
      const listed = `${DECK} ${app.t("deckList.fromHost", { host: SERVER })}`;
      await app.importUrl.importDeck(listed);
      await app.decks.deckLink(listed).click();
      await app.deckDetail.expectDeck(DECK);
      await app.deckDetail.study();
      await app.study.expectStudying(DECK);
      await app.study.expectPictureHidden(SERVER);
      expect(asked).toEqual([]);
    },
    { screen: "study" },
  );

  await app.step(
    "04 · Show the server's pictures: the answer's comes with the question's, and the reveal asks for nothing",
    async () => {
      const first = await card();
      await app.study.showPictures(SERVER);
      await expect
        .poll(() => [...asked].sort())
        .toEqual([`${first}-back.svg`, `${first}-front.svg`]);
      await app.study.reveal();
      await app.study.expectPictureShown(1);
      expect(asked).toHaveLength(2);
    },
    { screen: "study.answer" },
  );

  await app.step(
    "05 · The next card asks no more, and its reveal asks for nothing either",
    async () => {
      asked.length = 0;
      await app.study.grade("good");
      const second = await card();
      await expect
        .poll(() => [...asked].sort())
        .toEqual([`${second}-back.svg`, `${second}-front.svg`]);
      await app.study.reveal();
      expect(asked).toHaveLength(2);
    },
    { screen: "study.answer" },
  );
});
