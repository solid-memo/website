// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInToInstance } from "../flows/logIn.ts";

/**
 * Two tabs and two devices writing to one pod at once. A guest answers a
 * card in a second tab while the first moves the study into the pod: the
 * answer is refused, and the move ends with the study as it was. Then,
 * on two devices, one sees the other's progress after a reload, and
 * answering a card the other has just answered builds on that answer:
 * the pod refuses the stale write (412), the app reads the deck's
 * reviews document again and answers on it, and says nothing. Last, a
 * find and replace previewed in the Studio before the other device
 * edited a card in it is refused as changed elsewhere, nothing written,
 * and made again on the cards as they are, both edits kept.
 *
 * What it catches: a guest tab writing to the guest's pod while it is
 * copied (the write fence, told of the move through the other tab's
 * journal); a grade that overwrites another device's (no If-Match, or a
 * 412 not read again); and a bulk edit made from a preview of cards
 * that changed since. How journeys are run, read when they fail and
 * written: docs/testing.md#user-journeys.
 */
test("two tabs and two devices write to one pod at once @concurrent", async ({
  app,
  account,
  runId,
  newTab,
  newDevice,
}) => {
  const deck = `Shared ${runId}`;
  const north = `North ${runId}`;
  const south = `South ${runId}`;
  const east = `East ${runId}`;
  const fronts = [north, south, east];
  const guestInstance = app.t("guest.instanceName");
  // Where the form suggests a first instance goes.
  const location = `${account.pod}solid-memo/main/`;
  let shown = "";
  let last = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit(), { screen: "onboarding" });

  await app.step(
    "02 · Try it as a guest and make a deck of three cards",
    async () => {
      await app.onboarding.tryAsGuest();
      await app.decks.openDeckCreator();
      await app.deckCreator.create(deck);
      await app.deckBrowser.openFor(deck);
      await app.deckBrowser.openCardCreator();
      await app.cardCreator.addCards(
        [
          [north, "Norr"],
          [south, "Söder"],
          [east, "Öster"],
        ],
        { front: "en", back: "sv" },
      );
      await app.cardCreator.back();
      await app.deckBrowser.expectFronts(fronts);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.expectToReview(deck, 3);
    },
    { screen: "decks.guest" },
  );

  await app.step(
    "03 · Answer one card as a guest",
    async () => {
      await app.decks.study(deck);
      await app.study.answer("good");
      await app.study.endSession();
      await app.decks.expectToReview(deck, 2);
      await app.decks.expectAnsweredToday(1);
    },
    { screen: "decks.guest" },
  );

  const second = await newTab();
  await second.step(
    "04 · In a second tab, the guest's study opens; start studying the deck",
    async () => {
      await second.page.goto("./");
      await second.chrome.expectGuest();
      await second.decks.study(deck);
      await second.study.expectPosition(1, 2);
      await second.study.reveal();
    },
    { screen: "study.answer" },
  );

  await app.step(
    "05 · In the first tab, log in with the WebID to keep the study",
    async () => {
      await app.chrome.keepStudy();
      await app.onboarding.submitWebId(account.webId);
      await app.cssLogin.logIn(account);
      await app.cssLogin.authorize(account.webId);
      await app.onboarding.continueConnected(account.pod);
      await app.chrome.expectLoggedInAs(account.webId);
      await app.guestOffer.expectOffered(guestInstance, 1);
    },
    { screen: "guest-offer" },
  );

  let move!: { release(): Promise<void> };
  await app.step(
    "06 · Start moving it into the pod; the copy waits on the pod's answer",
    async () => {
      move = await app.guestOffer.holdMove(location, 3);
    },
    { screen: "guest-offer" },
  );

  await second.step(
    "07 · In the second tab, answer the card: refused while the move runs",
    // The move marks itself in the journal (the second tab hears of it
    // through a storage event) before it creates the instance's folder;
    // the copy is held after the folder and two more writes, which the
    // first tab waited for, so the second has long heard of the move.
    () => second.study.answerRefused("good", "guestStudyBeingMoved"),
    { screen: "study.answer" },
  );

  await app.step(
    "08 · Let the move go on: the study is in the pod, as it was",
    async () => {
      // The move checks the guest's study did not change while it copied: the refused answer was not saved.
      await move.release();
      await app.chrome.expectInstance(guestInstance);
      await app.decks.expectToReview(deck, 2);
      await app.decks.expectAnsweredToday(1);
    },
    { screen: "decks" },
  );

  await second.step(
    "09 · Reload the second tab: logged in on the instance moved, the refused answer nowhere",
    async () => {
      // The guest's instance its address named is gone: the app offers the user's instances.
      await second.page.reload();
      await second.instancePicker.expectShown();
      await second.chrome.expectLoggedInAs(account.webId);
      await second.instancePicker.expectInstances([guestInstance]);
      await second.instancePicker.open(guestInstance);
      await second.decks.expectToReview(deck, 2);
      await second.guestOffer.expectNone();
    },
    { screen: "decks" },
  );
  // Closed, so it reads nothing more while the devices write.
  await second.page.close();

  const device = await newDevice();
  await device.step(
    "10 · On a second device, log in: the guest's progress is there",
    async () => {
      await device.onboarding.visit();
      await logInToInstance(device, account, guestInstance);
      await device.decks.expectToReview(deck, 2);
      await device.decks.expectAnsweredToday(1);
    },
    { screen: "decks" },
  );

  await app.step(
    "11 · On the first device, answer one of the two cards",
    async () => {
      await app.decks.study(deck);
      await app.study.expectPosition(1, 2);
      await app.study.answer("good");
      await app.study.expectPosition(2, 2);
    },
    { screen: "study" },
  );

  await device.step(
    "12 · On the second device, reload: one card left to review",
    async () => {
      await device.chrome.reload();
      // Not the answers today: the first device adds its answer to the log a moment after the grade.
      // Step 16 counts them safely: the second device's answer is in the log before it reloads.
      await device.decks.expectToReview(deck, 1);
    },
    { screen: "decks" },
  );

  await device.step(
    "13 · On the second device, start studying: the one card left",
    async () => {
      await device.decks.study(deck);
      await device.study.expectPosition(1, 1);
      // Revealed before the first device answers: all this page reads, it reads now.
      await device.study.reveal();
      shown = await device.study.question();
    },
    { screen: "study.answer" },
  );

  await app.step(
    "14 · On the first device, answer the same card and end the session",
    async () => {
      last = await app.study.question();
      expect(last).toBe(shown);
      await app.study.answer("good");
      await app.study.endSession();
      await app.decks.expectDoneForToday(deck);
    },
    { screen: "decks" },
  );

  await device.step(
    "15 · On the second device, answer it Hard: the app answers on the newer answer, and says nothing",
    async () => {
      await device.study.gradeOverNewerAnswer("hard", location);
      await device.study.endSession();
      await device.decks.expectDoneForToday(deck);
    },
    { screen: "decks" },
  );

  await device.step(
    "16 · Reload the second device: every answer counted",
    async () => {
      await device.chrome.reload();
      await device.decks.expectDoneForToday(deck);
      // One as a guest, two on the first device, one on the second.
      await device.decks.expectAnsweredToday(4);
    },
    { screen: "decks" },
  );

  await app.step(
    "17 · Reload the first device: every answer counted",
    async () => {
      await app.chrome.reload();
      await app.decks.expectDoneForToday(deck);
      await app.decks.expectAnsweredToday(4);
    },
    { screen: "decks" },
  );

  await device.step(
    "18 · The card answered on both devices has both answers in its history, the second built on the first",
    async () => {
      // The question's text follows its side's hidden name.
      const front = fronts.find((each) => last.includes(each));
      expect(front, `a front in "${last}"`).toBeDefined();
      await device.deckBrowser.openFor(deck);
      await device.cardEditor.open(front!);
      expect(await device.cardEditor.history()).toEqual([
        { kind: device.t("card.historyRepeat"), answer: device.t("study.minimal.hard") },
        { kind: device.t("card.historyFirst"), answer: device.t("study.minimal.good") },
      ]);
      // FSRS-6, the default: Hard the same day as a Good keeps its 2 days, where a
      // Hard built on nothing (the other device's answer overwritten) would give 1.
      expect(await device.cardEditor.historyNext()).toEqual([
        device.t("statistics.dayCount", { count: 2 }),
        device.t("statistics.dayCount", { count: 2 }),
      ]);
    },
    { screen: "card-editor" },
  );

  await app.step(
    "19 · On the first device, open the deck's cards in the Studio and select them",
    async () => {
      await app.studio.openFromApp();
      await app.studio.openCards(guestInstance, deck, fronts);
      await app.studio.selectCardsWithKeys(deck, 3);
    },
    { screen: "studio.cards" },
  );

  await app.step(
    "20 · Preview replacing North with Nord in the selected cards",
    () => app.studio.previewReplace("North", "Nord", 1, { before: north, after: `Nord ${runId}` }),
    { screen: "studio.cards" },
  );

  const northStar = `North star ${runId}`;
  await device.step(
    "21 · Meanwhile, on the second device, edit the front of the card the preview changes",
    async () => {
      // Another browser: nothing tells the Studio's page to read the cards again.
      await device.chrome.breadcrumb("breadcrumbs.decks");
      await device.deckBrowser.openFor(deck);
      await device.cardEditor.open(north);
      await device.cardEditor.saveFront(northStar);
    },
    { screen: "card-editor" },
  );

  await app.step(
    "22 · On the first device, confirm the replace: refused, the card changed elsewhere",
    () => app.studio.confirmReplaceRefused(deck, northStar, 1),
    { screen: "studio.cards" },
  );

  const nordStar = `Nord star ${runId}`;
  await app.step(
    "23 · Replace again, on the cards as they are now",
    async () => {
      await app.studio.findAndReplace("North", "Nord", 1, { before: northStar, after: nordStar });
      await app.studio.expectCardFronts(deck, [nordStar, south, east]);
    },
    { screen: "studio.cards" },
  );

  await device.step(
    "24 · On the second device, both edits are in the deck, and its study is untouched",
    async () => {
      // On the card's page still, which is now named for the front both edits made.
      await device.page.reload();
      await expect(device.cardEditor.front).toHaveValue(nordStar);
      await device.chrome.breadcrumb("breadcrumbs.decks");
      await device.decks.expectDoneForToday(deck);
      await device.deckBrowser.openFor(deck);
      await device.deckBrowser.expectFronts([nordStar, south, east]);
    },
    { screen: "deck-browser" },
  );
});
