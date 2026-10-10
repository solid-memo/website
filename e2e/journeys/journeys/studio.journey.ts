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
 * progress on its schedule tab; its history still has its answer. They
 * write that card's back in Markdown with an HTML tag, which the deck's
 * health finds; its link opens the card at its back, where they fix it,
 * and the deck's health, then the instance's, find nothing wrong. The
 * deck's schedule counts the other card's review tomorrow, and no leech.
 * Back in the workbench they set the other
 * card due today, which Home then counts as due, and move it, with its
 * progress, to the other deck, where Home then counts it. From Home they open a
 * deck's about screen and name its author and licence. On the Groups screen they group
 * the two decks, as Solid Memo's deck list would; back on Home, the
 * table shows the group, filters and sorts by what the URL says, gives
 * both decks a pace and moves them back to the top level at once. They
 * export one of them as a Turtle file, with their progress, delete it,
 * once the user confirms, and import it again from the file, its card
 * due as before. They draft a release of a deck and a blank course,
 * which Home lists, and delete the course's draft, confirming. They
 * write a course in a blank draft: a chapter, a step with its theory,
 * and two questions, the first with two wrong options, saved as they
 * go, trying one question as the course would ask it. Its release check
 * lists what is still wrong: the second question has no wrong options
 * and the release no description. They follow each problem to its field,
 * fix it, and see it clear; the shapes find what a release still lacks,
 * and the listing preview shows the course as the library will. They rename the instance
 * and describe its catalogue, under a licence, then pick it, by its new
 * name, from the picker. Among its library copies, the library deck is
 * up to date. They note what Solid Memo's statistics count, then
 * test-play the course they wrote in the Studio's trial, to the end of
 * its one chapter's final review. The instance's decks, and Solid
 * Memo's statistics, are as they were: the trial is played in a sandbox.
 * They go back to Solid Memo, still logged in, which lists the deck they
 * made that is left.
 */
test("open the Studio from Solid Memo and manage an instance's decks @studio", async ({ app, account, runId }) => {
  const instance = `Studio ${runId}`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const group = `Pair ${runId}`;
  const renamed = `Renamed ${runId}`;
  const course = `Course ${runId}`;
  const authored = `Authored ${runId}`;

  await app.step("01 · Visit the Studio's old address: the Studio's landing page", () => app.studio.visitOldAddress());
  await app.step("02 · Log in from the Studio's landing page: back in the Studio", async () => {
    await app.onboarding.logInWithWebId(account.webId);
    await app.cssLogin.logIn(account);
    await app.cssLogin.authorize(account.webId);
    await app.onboarding.continueConnected(account.pod);
    await app.studio.expectBackAfterLogin();
  });
  await app.step("03 · Go back to Solid Memo, still logged in, and create an instance", async () => {
    await app.studio.backToInstanceCreator();
    await app.instanceCreator.create(instance);
    await app.chrome.expectLoggedInAs(account.webId);
  });
  await app.step("04 · Create two decks, one with two cards, and study those", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(alpha);
    await app.decks.openDeckCreator();
    await app.deckCreator.create(beta);
    await app.deckBrowser.openFor(alpha);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([["Sun", "Sol"], ["Moon", "Måne"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    // Five new cards a day: both are studied, and due again tomorrow.
    await app.decks.study(alpha);
    await app.study.studyAll({ grade: "good" });
    await app.study.endSession();
  });

  await app.step("05 · Import a deck from the library", async () => {
    await app.library.open();
    await app.library.select(BRIGHTEST_STARS.en);
    await app.library.importSelected([BRIGHTEST_STARS.en]);
  });

  await app.step("06 · Open the instance in Solid Memo Studio: no second login", () => app.studio.openFromApp());
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

  await app.step("09 · Find and replace in the selected cards, then retire them and undo it", async () => {
    await app.studio.findAndReplace("Sol", "Solen", 1);
    await app.studio.expectBack(alpha, "Sun", "Solen");
    await app.studio.retireSelectedCards(alpha, ["Moon", "Sun"]);
    await app.studio.undoCardEdit(alpha, ["Moon", "Sun"]);
  });

  await app.step("10 · Inspect a card: add two wrong options, retire one and delete the other", async () => {
    await app.studio.openCard(alpha, "Moon");
    await app.studio.openWrongOptions(0);
    await app.studio.addWrongOption("Stjärna", "En stjärna lyser själv.");
    await app.studio.addWrongOption("Jord", "Jorden är en planet.");
    await app.studio.retireWrongOption("Stjärna");
    await app.studio.deleteWrongOption("Jord");
  });

  await app.step("11 · Forget the card's progress on its schedule tab", async () => {
    await app.studio.openSchedule();
    await app.studio.forgetProgress();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
  });

  await app.step("12 · See the card's answer on its history tab, kept though its progress is forgotten", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.openCard(alpha, "Moon");
    await app.studio.openHistory([{ grade: "good", mode: "recall" }]);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("13 · Write a card in Markdown that would not show as meant, find it in the deck's health, and fix it there", async () => {
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
  });

  await app.step("14 · Open the deck's schedule: one review tomorrow, and no leech", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.openDeckSchedule(alpha, { today: 0, week: 1, studied: 1 });
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("15 · Set the other card due today in the workbench: Home counts it due", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.selectCardsWithKeys(alpha, 2);
    await app.studio.rescheduleSelectedToday(1);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 1 });
  });

  await app.step("16 · Move the card due today to the other deck, with its progress: Home counts it there", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.selectCardsWithKeys(alpha, 1);
    await app.studio.moveSelectedCards(alpha, beta, 1, ["Moon"]);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0 });
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1 });
  });

  await app.step("17 · Name a deck's author and licence on its about screen", async () => {
    await app.studio.openAbout(instance, beta);
    await app.studio.setAuthorAndLicence("Ada Lovelace", "CC BY 4.0");
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("18 · Group the two decks on the Groups screen", async () => {
    await app.studio.openGroups();
    await app.groups.groupWithNeighbour(alpha);
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
  await app.step("21 · Export a deck as Turtle, with its progress, from the selection", async () => {
    await app.studio.clearSelection();
    await app.studio.select([beta]);
    file = await app.studio.exportSelected(instance, beta);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("22 · Delete that deck, confirming", async () => {
    await app.studio.select([beta]);
    await app.studio.deleteSelected(instance, [beta]);
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0 });
  });

  await app.step("23 · Import the deck from its file, with its progress: Home counts its card due again", async () => {
    await app.studio.importFile(instance, file, beta, 1, 1);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1 });
  });

  await app.step("24 · Draft a release of a deck and a blank course; Home lists both; delete one", async () => {
    await app.studio.openDrafts(instance);
    await app.studio.draftDeck(instance, alpha);
    await app.studio.draftCourse(instance, course);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectHomeDrafts([
      { name: alpha, kind: "deck" },
      { name: course, kind: "course" },
    ]);
    await app.studio.openDrafts(instance);
    await app.studio.deleteDraft(instance, course);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectHomeDrafts([{ name: alpha, kind: "deck" }]);
  });

  await app.step("25 · Write a course: a chapter, a step, and two questions with two wrong options each", async () => {
    await app.studio.openDrafts(instance);
    await app.studio.draftCourse(instance, authored);
    await app.draftEditor.openDraft(authored);
    await app.draftEditor.addChapter("Pods");
    await app.draftEditor.openChapter("Pods");
    await app.draftEditor.addStep();
    await app.draftEditor.writeTheory("A pod is where your data lives.");
    await app.draftEditor.addQuestion("Where does your data live?", "In a pod");
    await app.draftEditor.addQuestion("Who chooses the app?", "You do");
    await app.draftEditor.openQuestion("Where does your data live?");
    await app.draftEditor.addWrongOption("In the app", "Apps only read it.");
    await app.draftEditor.addWrongOption("On a server of the app's", "The pod is yours.");
    await app.draftEditor.answerPreviewWrong("In the app", "Apps only read it.");
    await app.draftEditor.expectOutline(authored, "Pods", "Step 1.1", ["Where does your data live?", "Who chooses the app?"]);
    await app.draftEditor.expectBadge("Who chooses the app?", 1);
  });

  await app.step("26 · Check the release: follow its problems to their fields, fix them, and see them clear", async () => {
    const fewOptions = app.t("studio.problem.fewDistractors", { count: 0, least: 2 });
    const noDescription = app.t("studio.problem.required", { field: app.t("studio.field.description") });
    const release = app.t("studio.check.release");
    await app.draftEditor.openCheck(authored);
    await app.draftEditor.expectProblem("Who chooses the app?", fewOptions);
    await app.draftEditor.expectProblem(release, noDescription);
    await app.draftEditor.followProblem("Who chooses the app?", fewOptions);
    await app.draftEditor.addWrongOption("The pod", "A pod holds data.");
    await app.draftEditor.addWrongOption("Its maker", "The user chooses.");
    await app.draftEditor.openCheck(authored);
    await app.draftEditor.expectNoProblem("Who chooses the app?", fewOptions);
    await app.draftEditor.followProblem(release, noDescription);
    await app.draftEditor.writeDescription("What a pod is, and who holds the data in it.");
    await app.draftEditor.openCheck(authored);
    await app.draftEditor.expectNoProblem(release, noDescription);
    await app.draftEditor.checkShapes();
    await app.draftEditor.openPreview(authored);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("27 · Rename the instance and describe its catalogue", async () => {
    await app.studio.openInstance(instance);
    await app.studio.renameInstance(renamed);
    await app.studio.describeCatalog("Decks for the Studio journey.", "CC0 1.0");
  });

  await app.step("28 · Pick the instance, by its new name, from the instance picker", async () => {
    await app.studio.pickInstance(renamed);
    await app.studio.expectDeck(renamed, alpha, { cards: 1, due: 0 });
  });

  await app.step("29 · See the library deck among the library copies, up to date", async () => {
    await app.studio.openLibraryCopies(renamed, BRIGHTEST_STARS.en);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  const counted: Record<string, string> = {};
  const tiles = ["answers", "studyDays", "cards"] as const;
  await app.step("30 · Note what Solid Memo's statistics count", async () => {
    await app.studio.backToApp();
    await app.statistics.open();
    for (const tile of tiles) counted[tile] = await app.statistics.value(tile);
  });

  await app.step("31 · Test-play the course in the Studio's trial, to the end of its final review", async () => {
    await app.studio.openFromApp();
    await app.studio.openDrafts(renamed);
    await app.draftEditor.openDraft(authored);
    await app.trial.open(authored);
    await app.trial.playToTheEnd("Pods", "A pod is where your data lives.", {
      "Where does your data live?": "In a pod",
      "Who chooses the app?": "You do",
    });
  });

  await app.step("32 · The instance's decks and Solid Memo's statistics are as they were", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(renamed, alpha, { cards: 1, due: 0 });
    await app.studio.expectDeck(renamed, beta, { cards: 1, due: 1 });
    await app.studio.expectNoDeck(renamed, authored);
    await app.studio.backToApp();
    await app.statistics.open();
    for (const tile of tiles) expect(await app.statistics.value(tile), tile).toBe(counted[tile]);
  });

  await app.step("33 · Go back to Solid Memo, still logged in", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.chrome.expectLoggedInAs(account.webId);
    await app.decks.expectDeck(alpha);
  });
});
