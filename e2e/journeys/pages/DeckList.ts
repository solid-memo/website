// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * "Decks": the instance's home, its decks as the user arranged them into
 * groups, each row a link to the deck's page, what it offers today ("Study
 * {deck}" or "Done for today") and its actions menu (DeckGroups); under
 * them, Create deck and Deck library (Library.open). With no decks yet,
 * the library's course for newcomers is offered under the heading. A
 * learner on SM-2 is invited above the list to switch to FSRS-6, until
 * they switch or answer Not now.
 */
export class DeckList extends Screen {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: this.t("deckList.heading"), level: 2 });
  }

  /**
   * The list of decks and groups: the outermost list whose rows have an
   * actions menu ("Actions for {name}"), so not the breadcrumbs' list.
   */
  get tree(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("list")
      .filter({ has: this.page.getByRole("button", { name: this.tp("deckList.actions") }) })
      .first();
  }

  /** The links of the decks in the list, in the order shown (groups' decks included, if open). */
  private get deckLinks(): Locator {
    return this.tree.getByRole("link");
  }

  /**
   * The link that opens the deck named `name` (its row's name), "New
   * release" after it or not (a copy whose release the library has a
   * newer one of).
   */
  deckLink(name: string): Locator {
    return this.tree.getByRole("link", { name: this.named(name) });
  }

  /** The name `name`, "New release" after it or not (`newer` true: after it). */
  private named(name: string, newer?: boolean): RegExp {
    const release = `\\s*${escapeRegExp(this.t("deckList.newerRelease"))}`;
    return new RegExp(`^${escapeRegExp(name)}(${release})${newer ? "" : "?"}$`);
  }

  /** The row of the deck named `name`: the innermost list item holding its link. */
  row(name: string): Locator {
    return this.tree
      .getByRole("listitem")
      .filter({ has: this.page.getByRole("link", { name: this.named(name) }) })
      .last();
  }

  /** The deck's "Study" button in its row ("Study {deck}"), there while it has something to study today. */
  studyButton(name: string): Locator {
    return this.page.getByRole("button", {
      name: this.t("deckStudyAction.studyLabel", { deck: name }),
      exact: true,
    });
  }

  /**
   * The offer of the library's course for newcomers: the landmark with
   * "Start the course", named by the course's title, whichever it is.
   */
  get newcomerCourse(): Locator {
    return this.page.getByRole("complementary").filter({
      has: this.page.getByRole("button", { name: this.t("newcomerCourse.start"), exact: true }),
    });
  }

  /** The title of the course offered to newcomers: what names its landmark. */
  async newcomerCourseTitle(): Promise<string> {
    const titleId = await this.newcomerCourse.getAttribute("aria-labelledby");
    return (await this.page.locator(`[id="${titleId}"]`).innerText()).trim();
  }

  /** Starts the course offered to newcomers, which opens it. */
  async startNewcomerCourse(title: string): Promise<void> {
    await this.intent(`Start the course for newcomers ${title}`, async () => {
      await this.newcomerCourse
        .getByRole("button", { name: this.t("newcomerCourse.start"), exact: true })
        .click();
      await this.app.course.expectShown(title);
    });
  }

  /** The strip of courses to go on with, above the list. */
  get courseStrip(): Locator {
    return this.page.getByRole("complementary", { name: this.t("deckList.courses"), exact: true });
  }

  /** The strip offers to continue the course, started and not finished; its title opens its page. */
  async openStartedCourse(title: string): Promise<void> {
    await this.intent(`Open the course ${title} from the strip`, async () => {
      await expect(
        this.courseStrip.getByRole("link", {
          name: this.t("deckList.continueCourseNamed", { course: title }),
          exact: true,
        }),
      ).toBeVisible();
      await this.courseStrip.getByRole("link", { name: title, exact: true }).click();
      await this.app.course.expectShown(title);
    });
  }

  /** The invitation to switch to FSRS-6, above the list: the landmark named by its title. */
  get schedulerInvitation(): Locator {
    return this.page.getByRole("complementary", {
      name: this.t("schedulerInvitation.title"),
      exact: true,
    });
  }

  /** The list shows the invitation to switch to FSRS-6 (`shown`), or does not. */
  async expectSchedulerInvitation(shown: boolean): Promise<void> {
    await this.intent(
      `Check the deck list ${shown ? "invites" : "does not invite"} to switch to FSRS-6`,
      async () => {
        await this.expectShown();
        if (!shown) {
          await expect(this.schedulerInvitation).toHaveCount(0);
          return;
        }
        await expect(this.schedulerInvitation).toBeVisible();
        await expect(this.schedulerInvitation).toContainText(this.t("schedulerInvitation.pitch"));
      },
    );
  }

  /** Answers the invitation to switch to FSRS-6 Not now: it is gone, and the pod keeps the answer. */
  async declineSchedulerInvitation(): Promise<void> {
    await this.intent("Answer Not now to the invitation to switch to FSRS-6", async () => {
      await this.schedulerInvitation
        .getByRole("button", { name: this.t("schedulerInvitation.notNow"), exact: true })
        .click();
      await expect(this.schedulerInvitation).toHaveCount(0);
    });
  }

  /**
   * Switches to FSRS-6 from the invitation: its progress, then how it
   * went, the cards worked out from their answers (`replayed`) and
   * estimated from SM-2 (`estimated`), each said only when there are
   * some; Done closes it, the invitation is gone, and the Decks heading
   * has the focus.
   */
  async switchFromSchedulerInvitation({
    replayed,
    estimated,
  }: {
    replayed: number;
    estimated: number;
  }): Promise<void> {
    await this.intent("Switch to FSRS-6 from the deck list's invitation", async () => {
      await this.schedulerInvitation
        .getByRole("button", { name: this.t("schedulerInvitation.switch"), exact: true })
        .click();
      const result = this.page.getByRole("region", {
        name: this.t("schedulerSwitch.doneRegion"),
      });
      await expect(result).toBeVisible();
      await expect(result).toBeFocused();
      await expect(result).toContainText(this.t("schedulerSwitch.done"));
      for (const [key, count] of [
        ["schedulerSwitch.replayed", replayed],
        ["schedulerSwitch.estimated", estimated],
      ] as const) {
        if (count > 0) await expect(result).toContainText(this.t(key, { count }));
      }
      await expect(result).toContainText(this.t("schedulerSwitch.dueKept"));
      await result.getByRole("button", { name: this.t("schedulerSwitch.continue") }).click();
      await expect(result).toHaveCount(0);
      await expect(this.schedulerInvitation).toHaveCount(0);
      // Focus goes on in the screen, at its heading, not back to the page's top.
      await expect(this.heading).toBeFocused();
    });
  }

  async expectShown(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  /** Expects the deck named `name` in the list, a copy of a release added from a link, saying the host it came from. */
  async expectDeckFrom(name: string, host: string): Promise<void> {
    await expect(this.deckLink(`${name} ${this.t("deckList.fromHost", { host })}`)).toBeVisible();
  }

  async expectDeck(name: string): Promise<void> {
    await expect(this.deckLink(name)).toBeVisible();
  }

  /** The deck's row says "New release" after its name: the library has a newer release of the copy, or not (`newer` false). */
  async expectNewRelease(name: string, newer = true): Promise<void> {
    await this.intent(
      `Check ${name} ${newer ? "says" : "no longer says"} it has a new release`,
      () =>
        expect(
          newer
            ? this.tree.getByRole("link", { name: this.named(name, true) })
            : this.tree.getByRole("link", { name, exact: true }),
        ).toBeVisible(),
    );
  }

  /** Follows "Create deck" to the deck creator. */
  async openDeckCreator(): Promise<void> {
    await this.intent("Open the deck creator", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("deckList.createButton"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.t("deckCreator.heading") }),
      ).toBeVisible();
    });
  }

  /** Opens the deck's own page (its name, its Browser and Study). */
  async openDeck(name: string): Promise<void> {
    await this.intent(`Open the deck ${name}`, async () => {
      await this.deckLink(name).click();
      await this.app.deckDetail.expectDeck(name);
    });
  }

  /** Starts studying the deck with its row's Study button. */
  async study(name: string): Promise<void> {
    await this.intent(`Study ${name} from the deck list`, async () => {
      await this.studyButton(name).click();
      await expect(
        this.page.getByRole("heading", { name: this.t("study.heading", { deck: name }) }),
      ).toBeVisible();
    });
  }

  /** The row says the deck is done for today (nothing more to study). */
  async expectDoneForToday(name: string): Promise<void> {
    await expect(this.row(name)).toContainText(this.t("deckStudyAction.done"));
    await expect(this.studyButton(name)).toBeHidden();
  }

  /**
   * The today strip above the list counts the day's answers so far, as
   * many as `answers`, those of the session just ended included; the
   * word of welcome back is gone.
   */
  async expectAnsweredToday(answers: number): Promise<void> {
    await expect(
      this.page.getByRole("complementary", { name: this.t("today.heading"), exact: true }),
    ).toContainText(this.t("today.answers", { count: answers }));
    await expect(this.welcomeBack).toHaveCount(0);
  }

  /**
   * Before the day's first answer, the word of welcome back in the today
   * strip's place: the streak of `streak` days kept through yesterday,
   * the note `note`, and `left` cards left to study today.
   */
  async expectWelcomeBack({
    streak,
    note,
    left,
  }: {
    streak: number;
    note: string;
    left: number;
  }): Promise<void> {
    await expect(this.welcomeBack).toContainText(this.t("today.streakCount", { count: streak }));
    await expect(this.welcomeBack).toContainText(this.t(note));
    await expect(this.welcomeBack).toContainText(this.t("today.stillDue", { count: left }));
    await expect(
      this.page.getByRole("complementary", { name: this.t("today.heading"), exact: true }),
    ).toHaveCount(0);
  }

  private get welcomeBack(): Locator {
    return this.page.getByRole("complementary", {
      name: this.t("today.welcome.heading"),
      exact: true,
    });
  }

  /** No answer today: the today strip above the list is not shown. */
  async expectNothingAnsweredToday(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(
      this.page.getByRole("complementary", { name: this.t("today.heading"), exact: true }),
    ).toHaveCount(0);
  }

  /** The row offers `count` to study ("{count} to review"). */
  async expectToReview(name: string, count: number): Promise<void> {
    await expect(this.row(name)).toContainText(this.t("common.toReview", { count }));
    await expect(this.studyButton(name)).toBeVisible();
  }

  /** The names of the decks shown, in the order shown; with `among`, only those. */
  async deckNames(among?: readonly string[]): Promise<string[]> {
    await expect(this.heading).toBeVisible();
    const names = (await this.deckLinks.allTextContents()).map((name) => name.trim());
    const unique = names.filter((name, at) => names.indexOf(name) === at);
    return among === undefined ? unique : unique.filter((name) => among.includes(name));
  }

  /** The decks named come in this order (others may be between them). */
  async expectOrder(names: readonly string[]): Promise<void> {
    await expect.poll(() => this.deckNames(names)).toEqual([...names]);
  }
}
