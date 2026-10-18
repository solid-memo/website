// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator, type Page, test } from "@playwright/test";
import type { Diagnostics } from "../fixtures.ts";
import { seedRandom } from "../harness/seededRandom.ts";
import { App } from "../pages/App.ts";

/**
 * The app's screenshots (apps/web/public/screenshots/), which the README,
 * publiccode.yml and the About page show: a guest's study of a few weeks,
 * made here on a clock of its own (page.clock), then each screen as a
 * phone shows it, scrolled to what it is a picture of; the Studio, made
 * for a large screen, on a desktop's. `npm run screenshots` retakes them (docs/testing.md#screenshots).
 */
const OUT = "../../apps/web/public/screenshots";
const DECKS = ["Famous paintings", "Capitals of the world", "Basic Korean"];
/** The first study day, and the day the screenshots are of; a few days are skipped between. */
const FIRST_DAY = new Date("2026-08-24T09:00:00");
const DAYS = 54;
const SKIPPED = new Set([5, 6, 12, 19, 20, 27, 33, 34, 41, 47, 48]);
/** The paintings the study screenshot may show: well known, and clear at a phone's width. */
const PAINTING =
  /^(The Starry Night|Café Terrace at Night|The Hunters in the Snow|Starry Night Over the Rhone|Impression, Sunrise|View of Delft|Wanderer above the Sea of Fog) — /;
/** The 0–5 answers given in turn, mostly remembered, now and then forgotten. */
const GRADES = [4, 4, 5, 3, 4, 4, 2, 4, 5, 4, 3, 4, 4, 1, 4, 5];

test.use({ timezoneId: "Europe/Stockholm" });

test("the app's screenshots", async ({ page }, testInfo) => {
  test.setTimeout(60 * 60_000);
  const diagnostics: Diagnostics = {
    seed: 1,
    timezone: "Europe/Stockholm",
    console: [],
    pageErrors: [],
    failedRequests: [],
    errorResponses: [],
    blockedRequests: [],
    unexpectedDialogs: [],
  };
  const app = new App(page, testInfo, diagnostics);
  await page.addInitScript(seedRandom, 1);
  await page.clock.install({ time: FIRST_DAY });

  await app.onboarding.visit();
  await app.onboarding.tryAsGuest();
  // The course for newcomers is offered while there are no decks: started now, it goes on later.
  const course = await app.decks.newcomerCourseTitle();
  await app.decks.startNewcomerCourse(course);
  await app.course.start();
  await app.chapter.workThroughStep(new Map());
  await page.goto("./");
  await app.library.open();
  for (const deck of DECKS) await app.library.select(deck);
  await app.library.importSelected(DECKS);

  let answered = 0;
  let study = false;
  for (let day = 0; day < DAYS; day += 1) {
    if (SKIPPED.has(day)) continue;
    await page.clock.setSystemTime(at(day, 9 + (day % 5), (day * 7) % 60));
    await page.reload();
    await app.decks.expectShown();
    for (const deck of DECKS)
      answered = await studyDeck(page, app, deck, answered, async () => {
        // The first time one of PAINTING's comes up as a review, its intervals
        // grown past a day, it is the study screen's picture.
        if (study || !(await main(page).getByText(PAINTING).isVisible())) return;
        if ((await gradeGroup(page).getByRole("button").last().innerText()).includes("1 day"))
          return;
        await shoot(page, "study");
        study = true;
      });
  }

  await page.clock.setSystemTime(at(DAYS, 10, 12));
  await page.reload();
  // Every deck has something to study today, once its row has loaded.
  for (const deck of [course, ...DECKS]) await expect(app.decks.studyButton(deck)).toBeVisible();

  await shoot(page, "decks", { from: null });

  expect(study, "a painting of PAINTING's, studied").toBe(true);

  await app.library.open();
  await main(page).getByRole("searchbox", { name: "Search" }).fill("famous");
  await app.library.select("Famous buildings");
  await app.library.select("Famous sculptures");
  await shoot(page, "library", { from: main(page).getByText("Search", { exact: true }) });
  await page.goto("./");

  await app.statistics.open();
  await shoot(page, "statistics");
  await app.statistics.openTab("activity");
  await shoot(page, "activity");
  await page.goto("./");

  await app.decks.openStartedCourse(course);
  await main(page).getByRole("link", { name: "Continue", exact: true }).click();
  await app.chapter.readTheory();
  // Answered, and right: the question says so, and why.
  await main(page)
    .getByRole("radio", { name: /Today's due cards/ })
    .check();
  await main(page).getByRole("button", { name: "Check", exact: true }).click();
  await shoot(page, "course-chapter", { to: main(page).getByRole("button", { name: "Next" }) });
  await page.goto("./");

  // The Studio on a desktop's screen, to show what its room holds.
  await page.setViewportSize({ width: 1600, height: 640 });
  await app.studio.openFromApp();
  for (const deck of DECKS)
    await expect(
      main(page).getByRole("link", { name: new RegExp(`^\\d+ cards of ${deck}$`) }),
    ).toBeVisible();
  // Down the table to Famous paintings, which the panel beside it then shows.
  for (let row = 0; row < 3; row += 1) await page.keyboard.press("j");
  await expect(page.getByText(/^Move to a deck's row/)).toBeHidden();
  // The row is picked; its link need not look focused too.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shoot(page, "studio", { from: null });
});

/** The day `day` days after the first, at the hour and minute given. */
function at(day: number, hour: number, minute: number): Date {
  const date = new Date(FIRST_DAY);
  date.setDate(date.getDate() + day);
  date.setHours(hour, minute);
  return date;
}

function main(page: Page): Locator {
  return page.getByRole("main");
}

function gradeGroup(page: Page): Locator {
  return page.getByRole("group", { name: "How well did you remember it?" });
}

async function reveal(page: Page): Promise<void> {
  await main(page).getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(gradeGroup(page)).toBeVisible();
}

/**
 * Studies what the deck holds today, answering in turn GRADES' answers,
 * back to Decks; `revealed` is called each time an answer is shown.
 */
async function studyDeck(
  page: Page,
  app: App,
  deck: string,
  answered: number,
  revealed: () => Promise<void>,
): Promise<number> {
  await app.decks.study(deck);
  const status = main(page)
    .getByRole("status")
    .filter({ hasText: /^Card \d+ of \d+/ });
  const finished = main(page).getByText(/^Session finished/);
  const nothing = main(page).getByText(/^Nothing to study today/);
  await expect(status.or(finished).or(nothing)).toBeVisible();
  let count = answered;
  while (await status.isVisible()) {
    const before = await status.innerText();
    await reveal(page);
    await revealed();
    await gradeGroup(page)
      .getByRole("button")
      .nth(GRADES[count % GRADES.length]!)
      .click();
    count += 1;
    await expect(status.filter({ hasNotText: before }).or(finished)).toBeVisible();
  }
  await page.goto("./");
  return count;
}

/**
 * Saves the screen as the phone shows it, scrolled so that `from` (the
 * breadcrumbs, by default; the page's top, given null) is at its top, or
 * else so that `to` is at its foot.
 */
async function shoot(
  page: Page,
  name: string,
  {
    from = main(page).getByRole("navigation", { name: "Breadcrumb" }),
    to,
  }: { from?: Locator | null; to?: Locator } = {},
): Promise<void> {
  // Twice: a screen that moves the focus scrolls to it after the first.
  for (let time = 0; time < 2; time += 1) {
    if (to !== undefined)
      await to.evaluate((node) => {
        // Whichever pane holds it (the Studio's, or the page) scrolls it to the foot.
        node.scrollIntoView({ block: "end", behavior: "instant" });
        scrollBy({ top: 8, behavior: "instant" });
      });
    else if (from === null) await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    else
      await from.evaluate((node) => {
        node.scrollIntoView({ block: "start", behavior: "instant" });
        scrollBy({ top: -16, behavior: "instant" });
      });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 200))),
    );
  }
  // No button left looking pointed at, where the last tap was.
  await page.mouse.move(0, 0);
  // Nor the foot of what is above the breadcrumbs, in the room left above them.
  const above =
    from === null
      ? null
      : await page.addStyleTag({ content: "*:has(~ main) { visibility: hidden }" });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await above?.evaluate((style) => (style as HTMLStyleElement).remove());
}
