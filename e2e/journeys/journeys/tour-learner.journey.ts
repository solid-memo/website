// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test } from "../fixtures.ts";
import { logInToInstance } from "../flows/logIn.ts";
import { zonesAcrossTheDayTurn } from "../harness/timezone.ts";

/**
 * The learner's theme tour (docs/accessibility.md): every screen of
 * Solid Memo a learner meets, from the landing page to the statistics,
 * checked in the palettes and themes the journeys don't show it in. The
 * journeys check each screen once, as it is shown; here each step's
 * screen is checked in every other scheme, and the tour fails if it
 * ends with a learner's screen unchecked (harness/screens.ts). The
 * learner chooses Standard and the dark theme in Preferences, as a user
 * would, so the page shows them; each check puts them back.
 *
 * It takes the shortest way to each screen in the state the journeys
 * leave it in: a guest's study moved into a new instance, as the guest
 * journey moves it, a move cut off first; the guest's deck given two
 * cards and studied; and the next study day, for the welcome back, on a
 * second device in a time zone past the study day's turn at 4 a.m.,
 * where it is the same moment (the Solid server checks each request's
 * clock). The tour asserts only what it needs to reach each screen: the
 * journeys test the rest.
 */
const zones = zonesAcrossTheDayTurn(new Date());
test.use({ timezoneId: zones.before });

test("the learner screens in every palette and theme @tour-learner", async ({
  app,
  account,
  runId,
  newDevice,
}) => {
  const guestInstance = app.t("guest.instanceName");
  const location = `${account.pod}solid-memo/main/`;
  const second = { name: `Second ${runId}`, folder: `${account.pod}solid-memo/second-${runId}/` };
  const deckA = `Deck A ${runId}`;
  const deckB = `Deck B ${runId}`;
  const fronts = [`Sun ${runId}`, `Moon ${runId}`];

  await app.tour("learner", async () => {
    await app.step("01 · Visit Solid Memo", () => app.onboarding.visit(), { screen: "onboarding" });

    await app.step(
      "02 · Log in with the WebID over http, which is refused",
      () =>
        app.onboarding.submitRefusedWebId(
          account.webId.replace(/^https:/, "http:"),
          "webIdNotHttps",
        ),
      { screen: "onboarding.invalid-webid" },
    );

    await app.step(
      "03 · Try it as a guest: no statistics yet",
      async () => {
        await app.onboarding.tryAsGuest();
        await app.statistics.open();
        await app.statistics.expectEmpty();
      },
      { screen: "statistics.empty" },
    );

    await app.step(
      "04 · Create a deck as a guest",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.decks.openDeckCreator();
        await app.deckCreator.create(deckA);
      },
      { screen: "decks.guest" },
    );

    await app.step(
      "05 · Log in with a WebID: the study is offered to keep",
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

    await app.step(
      "06 · Start moving it into the pod, and close the tab while it copies",
      () => app.guestOffer.interruptMove(location, 3),
      { screen: "guest-offer.leftover" },
    );

    await app.step(
      "07 · Remove the partial copy, and move the study into a new instance",
      async () => {
        await app.guestOffer.removeLeftover(guestInstance, location);
        await app.guestOffer.moveIntoPod(location);
        await app.decks.expectDeck(deckA);
      },
      { screen: "decks" },
    );

    await app.step(
      "08 · In Preferences, choose Standard, the dark theme and SM-2",
      async () => {
        await app.preferences.open();
        await app.preferences.setPalette("standard");
        await app.preferences.setTheme("dark");
        await app.preferences.setScheduler("sm2");
      },
      { screen: "preferences" },
    );

    await app.step(
      "09 · Save the preferences: the deck list invites to FSRS-6",
      async () => {
        await app.preferences.save();
        await app.decks.expectSchedulerInvitation(true);
      },
      { screen: "decks.scheduler-invitation" },
    );

    await app.step(
      "10 · Add two flashcards",
      async () => {
        await app.deckBrowser.openFor(deckA);
        await app.deckBrowser.openCardCreator();
        await app.cardCreator.addCards(
          [
            [fronts[0]!, "Sol"],
            [fronts[1]!, "Måne"],
          ],
          { front: "en", back: "sv" },
        );
      },
      { screen: "card-creator" },
    );

    await app.step(
      "11 · Back to the deck's Browser",
      async () => {
        await app.cardCreator.back();
        await app.deckBrowser.expectFronts(fronts);
      },
      { screen: "deck-browser" },
    );

    await app.step("12 · Open a card", () => app.cardEditor.open(fronts[0]!), {
      screen: "card-editor",
    });

    await app.step(
      "13 · Open the deck's page",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.decks.openDeck(deckA);
        await app.deckDetail.expectCardCount(fronts.length);
      },
      { screen: "deck" },
    );

    await app.step(
      "14 · Study the deck from its page",
      async () => {
        await app.deckDetail.study();
        await app.study.expectPosition(1, fronts.length);
      },
      { screen: "study" },
    );

    await app.step("15 · Reveal the answer", () => app.study.reveal(), {
      screen: "study.answer",
    });

    await app.step(
      "16 · Answer every card, end the session and read the statistics",
      async () => {
        await app.study.grade("good");
        await app.study.studyAll({ grade: "good" });
        await app.study.endSession();
        await app.decks.expectDoneForToday(deckA);
        await app.statistics.open();
      },
      { screen: "statistics" },
    );

    await app.step("17 · The deck's own statistics", () => app.statistics.openForDeck(deckA), {
      screen: "statistics.deck",
    });

    await app.step(
      "18 · Create another deck, and group the two",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.decks.openDeckCreator();
        await app.deckCreator.create(deckB);
        await app.groups.groupWithNeighbor(deckA);
        await app.groups.nameGroup(`Group ${runId}`);
      },
      { screen: "decks.group" },
    );

    await app.step(
      "19 · With developer mode on, validate the instance",
      async () => {
        await app.preferences.open();
        await app.preferences.setDeveloperMode(true);
        await app.preferences.save();
        // A reload, so the news of the move, a status line too, is gone.
        await app.chrome.reload();
        await app.validation.open();
        await app.validation.expectAllConform();
      },
      { screen: "validation" },
    );

    const morning = await newDevice({ timezoneId: zones.after });
    app.tourWith(morning);

    await morning.step(
      "20 · The next study day, on a second device: log in, welcomed back with the streak",
      async () => {
        await morning.onboarding.visit();
        await logInToInstance(morning, account, guestInstance);
        await morning.decks.expectWelcomeBack({
          streak: 1,
          note: "today.welcome.newRecord",
          left: fronts.length,
        });
      },
      { screen: "decks.welcome-back" },
    );

    await morning.step(
      "21 · Make a second instance in another folder",
      async () => {
        await morning.chrome.switchInstance();
        await morning.instancePicker.openInstanceCreator();
        await morning.instanceCreator.create(second.name, second.folder);
      },
      { screen: "decks.empty" },
    );

    await morning.step(
      "22 · Switch instance: both are offered",
      async () => {
        await morning.chrome.switchInstance();
        await morning.instancePicker.expectInstances([guestInstance, second.name]);
      },
      { screen: "instance-picker" },
    );
  });
});
