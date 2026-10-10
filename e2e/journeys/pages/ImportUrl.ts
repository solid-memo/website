import { expect } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * "Add from a link" (docs/deck-library.md, From a link): a release
 * published anywhere, its link pasted, read and shown with where it is
 * published and what it is, then imported or, a course, started.
 */
export class ImportUrl extends Screen {
  /** Opens the screen from the deck list's "Add from a link". */
  async openFromDeckList(): Promise<void> {
    await this.intent("Open Add from a link", async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("deckList.fromLink"), exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("importUrl.heading") })).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.importUrl");
    });
  }

  /** Pastes the link and shows the release there: its title, the host it is on, and that it is a course. */
  async showCourse(url: string, title: string): Promise<void> {
    await this.intent(`Show the release at ${url}`, async () => {
      await this.page.getByRole("textbox", { name: this.t("importUrl.label") }).fill(url);
      await this.page.getByRole("button", { name: this.t("importUrl.show"), exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
      const host = new URL(url).host;
      await expect(this.page.getByText(this.t("importUrl.notLibrary", { host }))).toBeVisible();
      await expect(this.fact(this.t("libraryDeck.host"))).toHaveText(host);
      await expect(this.fact(this.t("libraryDeck.kind"))).toHaveText(this.t("libraryDeck.kindCourse"));
    });
  }

  /** What the release's facts say after the term `term`. */
  private fact(term: string) {
    return this.page.getByRole("term").filter({ hasText: term }).locator("xpath=following-sibling::dd[1]");
  }

  /** Starts the course shown: it opens. */
  async startCourse(title: string): Promise<void> {
    await this.intent(`Start ${title}`, async () => {
      await this.page.getByRole("button", { name: this.t("libraryDeck.startCourse"), exact: true }).click();
      await this.app.course.expectShown(title);
    });
  }
}
