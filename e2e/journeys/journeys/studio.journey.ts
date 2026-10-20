// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * Solid Memo Studio in Solid Memo's page (docs/studio.md): a visitor
 * opens the Studio's old address, /studio/, which lands on the Studio's
 * landing page at #/studio, and logs in there: the identity provider
 * sends them back to the Studio. From there they go back to Solid Memo,
 * still logged in, create an instance, make two decks, one with two
 * cards studied once, import a deck from the library, and open the
 * instance in the Studio from the
 * instance bar: the same page and the same session, so no second
 * login. They see the
 * instance's decks in its table. In the card workbench they find a card
 * by its back (accents aside), sort the cards and select them with the
 * keyboard, the URL holding the view; they replace a word in the
 * selected cards, checking the preview first, then retire both cards and
 * undo that. They inspect one card, give it two wrong options (saved as
 * each is added), retire one and delete the other, then forget its
 * progress on its schedule tab, which shows FSRS-6's memory below SM-2's
 * state, as a new instance studies by FSRS-6; its history still has its answer. They
 * write that card's back in Markdown with an HTML tag, which the deck's
 * health finds; its link opens the card at its back, where they fix it,
 * and the deck's health, then the instance's, find nothing wrong. They
 * quick open the deck with Ctrl+K: its schedule counts the other card's
 * review in the week to come, and no leech.
 * Back in the workbench they set the other
 * card due today, which Home then counts as due, and move it, with its
 * progress, to the other deck, where Home then counts it. From Home they open a
 * deck's about screen and name its author and license. On the Groups screen they group
 * the two decks, as Solid Memo's deck list would; back on Home, the
 * table shows the group, filters and sorts by what the URL says, gives
 * both decks a pace and moves them back to the top level at once. They
 * export one of them as a Turtle file, with their progress, delete it,
 * once the user confirms, and import it again from the file, its card
 * due as before. They draft a release of a deck and a blank course,
 * which the sidebar lists, and delete the course's draft, confirming.
 * They rename the instance
 * and describe its catalog, under a license, then pick it, by its new
 * name, from the picker. Among its library copies, the library deck is
 * up to date.
 * They draft the next version of the library deck, by its address,
 * retire one of its cards, and compare the draft with the release: it
 * keeps the series' rules, lists the card retired, and a learner's copy
 * would retire it too, losing nothing. They move down the library
 * deck's cards with the keyboard and back, one selected: the row with
 * the focus stays in sight between the header row and the bar of the
 * rows selected, which stick. They draw the instance as a graph, open
 * a node reached with the keyboard, and find the library release their
 * draft of the next version follows: a leaf outside the pod, never
 * fetched, shown with the draft that links to it as a table, and let go
 * of it with a click on the drawing's background. They go back to Solid Memo, still
 * logged in, which lists the deck they made that is left. Writing,
 * checking, trying and publishing a course is studio-course.journey.ts's.
 */
test("open the Studio from Solid Memo and manage an instance's decks @studio", async ({
  app,
  account,
  runId,
}) => {
  const instance = `Studio ${runId}`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const group = `Pair ${runId}`;
  const renamed = `Renamed ${runId}`;
  const course = `Course ${runId}`;

  await app.step("01 · Visit the Studio's old address: the Studio's landing page", () =>
    app.studio.visitOldAddress(),
  );
  await app.step("02 · Log in from the Studio's landing page: back in the Studio", async () => {
    await app.onboarding.logInWithWebId(account.webId);
    await app.cssLogin.logIn(account);
    await app.cssLogin.authorize(account.webId);
    await app.onboarding.continueConnected(account.pod);
    await app.studio.expectBackAfterLogin();
  });
  await app.step(
    "03 · Go back to Solid Memo, still logged in, and create an instance",
    async () => {
      await app.studio.backToInstanceCreator();
      await app.instanceCreator.create(instance);
      await app.chrome.expectLoggedInAs(account.webId);
    },
  );
  await app.step("04 · Create two decks, one with two cards, and study those", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(alpha);
    await app.decks.openDeckCreator();
    await app.deckCreator.create(beta);
    await app.deckBrowser.openFor(alpha);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards(
      [
        ["Sun", "Sol"],
        ["Moon", "Måne"],
      ],
      { front: "en", back: "sv" },
    );
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    // Five new cards a day: both are studied, and due again in a few days.
    await app.decks.study(alpha);
    await app.study.studyAll({ grade: "good" });
    await app.study.endSession();
  });

  await app.step("05 · Import a deck from the library", async () => {
    await app.library.open();
    await app.library.select(BRIGHTEST_STARS.en);
    await app.library.importSelected([BRIGHTEST_STARS.en]);
  });

  await app.step("06 · Open the instance in Solid Memo Studio: no second login", () =>
    app.studio.openFromApp(),
  );
  await app.step("07 · See the instance's decks", async () => {
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
    await app.studio.expectDeck(instance, beta, { cards: 0, due: 0 });
  });

  await app.step("08 · Find, sort and select a deck's cards in the workbench", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.searchCards(alpha, "mane", ["Moon"]);
    await app.studio.clearCardSearch(alpha, ["Sun", "Moon"]);
    await app.studio.sortCardsBy(alpha, "front", ["Moon", "Sun"]);
    await app.studio.selectCardsWithKeys(alpha, 2);
  });

  await app.step(
    "09 · Find and replace in the selected cards, then retire them and undo it",
    async () => {
      await app.studio.findAndReplace("Sol", "Solen", 1);
      await app.studio.expectBack(alpha, "Sun", "Solen");
      await app.studio.retireSelectedCards(alpha, ["Moon", "Sun"]);
      await app.studio.undoCardEdit(alpha, ["Moon", "Sun"]);
    },
  );

  await app.step(
    "10 · Inspect a card: add two wrong options, retire one and delete the other",
    async () => {
      await app.studio.openCard(alpha, "Moon");
      await app.studio.openWrongOptions(0);
      await app.studio.addWrongOption("Stjärna", "En stjärna lyser själv.");
      await app.studio.addWrongOption("Jord", "Jorden är en planet.");
      await app.studio.retireWrongOption("Stjärna");
      await app.studio.deleteWrongOption("Jord");
    },
  );

  await app.step("11 · Forget the card's progress on its schedule tab", async () => {
    // A new instance studies by FSRS-6: the tab shows its memory below SM-2's state.
    await app.studio.openSchedule("fsrs6");
    await app.studio.forgetProgress();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
  });

  await app.step(
    "12 · See the card's answer on its history tab, kept though its progress is forgotten",
    async () => {
      await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
      await app.studio.openCard(alpha, "Moon");
      await app.studio.openHistory([{ grade: "good", mode: "recall" }]);
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  await app.step(
    "13 · Write a card in Markdown that would not show as meant, find it in the deck's health, and fix it there",
    async () => {
      await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
      await app.studio.openCard(alpha, "Moon");
      // An HTML tag shows as typed: its opening and its closing tag are a problem each.
      await app.studio.writeBackInMarkdown("<b>Måne</b>");
      await app.studio.openDeckHealth(alpha, 2);
      await app.studio.followMarkdownProblem("Moon, back (Swedish)", "back");
      await app.studio.fixFocusedField("Måne");
      await app.studio.openDeckHealth(alpha, 0);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.openInstanceHealth(instance, [alpha, beta]);
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  await app.step(
    "14 · Quick open the deck with Ctrl+K, and open its schedule: one review this week, and no leech",
    async () => {
      await app.chrome.quickOpen(alpha, alpha);
      await expect(app.page).toHaveURL(/#\/studio\/cards\?deck=/);
      await app.studio.openDeckSchedule(alpha, { today: 0, week: 1, studied: 1 });
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  await app.step(
    "15 · Set the other card due today in the workbench: Home counts it due",
    async () => {
      await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
      await app.studio.selectCardsWithKeys(alpha, 2);
      await app.studio.rescheduleSelectedToday(1);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.expectDeck(instance, alpha, { cards: 2, due: 1 });
    },
  );

  await app.step(
    "16 · Move the card due today to the other deck, with its progress: Home counts it there",
    async () => {
      await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
      await app.studio.selectCardsWithKeys(alpha, 1);
      await app.studio.moveSelectedCards(alpha, beta, 1, ["Moon"]);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0 });
      await app.studio.expectDeck(instance, beta, { cards: 1, due: 1 });
    },
  );

  await app.step("17 · Name a deck's author and license on its about screen", async () => {
    await app.studio.openAbout(instance, beta);
    await app.studio.setAuthorAndLicense("Ada Lovelace", "CC BY 4.0");
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("18 · Group the two decks on the Groups screen", async () => {
    await app.studio.openGroups();
    await app.groups.groupWithNeighbor(alpha);
    await app.groups.nameGroup(group);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0, group });
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1, group });
  });

  await app.step("19 · Filter the decks, then sort them by name", async () => {
    await app.studio.filter(instance, "beta", [beta]);
    await app.studio.filter(instance, runId, [alpha, beta]);
    await app.studio.sortBy(instance, "title", [alpha, beta]);
  });

  await app.step("20 · Give both decks a pace and move them to the top level", async () => {
    await app.studio.select([alpha, beta]);
    await app.studio.setNewCardsPerDay(7, 2);
    await app.studio.moveToTopLevel(2);
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0, newCardsPerDay: "7" });
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1, newCardsPerDay: "7" });
  });

  let file = "";
  await app.step(
    "21 · Export a deck as Turtle, with its progress, from the selection",
    async () => {
      await app.studio.clearSelection();
      await app.studio.select([beta]);
      file = await app.studio.exportSelected(instance, beta);
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  await app.step("22 · Delete that deck, confirming", async () => {
    await app.studio.select([beta]);
    await app.studio.deleteSelected(instance, [beta]);
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0 });
  });

  await app.step(
    "23 · Import the deck from its file, with its progress: Home counts its card due again",
    async () => {
      await app.studio.importFile(instance, file, beta, 1, 1);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.expectDeck(instance, beta, { cards: 1, due: 1 });
    },
  );

  await app.step(
    "24 · Draft a release of a deck and a blank course; the sidebar lists both; delete one",
    async () => {
      await app.studio.openDrafts(instance);
      await app.studio.draftDeck(instance, alpha);
      await app.studio.draftCourse(instance, course);
      await app.studio.expectSidebarDrafts([alpha, course]);
      await app.studio.deleteDraft(instance, course);
      await app.studio.expectSidebarDrafts([alpha]);
    },
  );

  await app.step("25 · Rename the instance and describe its catalog", async () => {
    await app.studio.openInstance(instance);
    await app.studio.renameInstance(renamed);
    await app.studio.describeCatalog("Decks for the Studio journey.", "CC0 1.0");
  });

  await app.step("26 · Pick the instance, by its new name, from the instance picker", async () => {
    await app.studio.pickInstance(renamed);
    await app.studio.expectDeck(renamed, alpha, { cards: 1, due: 0 });
  });

  await app.step("27 · See the library deck among the library copies, up to date", async () => {
    await app.studio.openLibraryCopies(renamed, BRIGHTEST_STARS.en);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step(
    "28 · Draft the library deck's next version, retire a card, and compare it with the release: learners lose nothing",
    async () => {
      await app.studio.openDrafts(renamed);
      // A library release by its address, which the site serves (docs/deck-library.md).
      const release = "https://solid-memo.com/decks/brightest-stars/v1.ttl";
      await app.studio.draftNextVersion(release, BRIGHTEST_STARS.en, 2);
      await app.draftEditor.openDraft(BRIGHTEST_STARS.en, { course: false });
      await app.draftEditor.retireCard("Sirius");
      await app.draftEditor.openDiff();
      await app.draftEditor.expectDiff(
        { Sirius: app.t("studio.diff.status.retired") },
        app.t("studio.diff.upgrade", {
          previous: "1",
          changes: app.t("libraryUpgradeNotice.retires", { count: 1 }),
        }),
      );
    },
  );

  await app.step(
    "29 · Move down the library deck's cards with the keyboard and back, one selected: each row in sight between the header row and the bar",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.moveThroughCardsInSight(renamed, BRIGHTEST_STARS.en, 30);
    },
  );

  await app.step(
    "30 · Draw the instance as a graph: open a node by keyboard, find the library release the next version follows, a leaf never fetched, see it and its draft in the table, and let go of it",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.openGraph(renamed);
      await app.studio.openGraphNodeByKeyboard(renamed);
      // Outside the pod: were it fetched, the journey would fail on the request.
      const release = "https://solid-memo.com/decks/brightest-stars/v1.ttl";
      await app.studio.findGraphNode(release, "v1.ttl", "studio.graph.node.outside");
      // The draft of its next version links to it.
      await app.studio.expectNeighborsInTable(renamed, {
        "v1.ttl": "studio.graph.kind.outsideLeaf",
        "drafts/brightest-stars/v2/release.ttl": "studio.graph.kind.document",
      });
      await app.studio.letGoOfGraphNode(renamed);
    },
  );

  await app.step("31 · Go back to Solid Memo, still logged in", async () => {
    await app.studio.backToApp();
    await app.chrome.expectLoggedInAs(account.webId);
    await app.decks.expectDeck(alpha);
  });
});
