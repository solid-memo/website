// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * "Add from a link" (docs/deck-library.md, From a link): a release
 * published anywhere, its link pasted, read and shown with where it is
 * published and what it is (a deck with its version and notes), then
 * imported or, a course, started.
 */
export class ImportUrl extends Screen {
  /** Opens the screen from the deck list's "Add from a link". */
  async openFromDeckList(): Promise<void> {
    await this.intent("Open Add from a link", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("deckList.fromLink"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { level: 2, name: this.t("importUrl.heading") }),
      ).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.importUrl");
    });
  }

  /** Pastes the link and shows the release there: its title, the host it is on, and that it is a course. */
  async showCourse(url: string, title: string): Promise<void> {
    await this.intent(`Show the release at ${url}`, () => this.show(url, title, "kindCourse"));
  }

  /**
   * Pastes the link and shows the release there: its title, the host it
   * is on, that it is a deck, and its version with its notes.
   */
  async showDeck(
    url: string,
    title: string,
    release: { version: number; notes: string },
  ): Promise<void> {
    await this.intent(`Show the release at ${url}`, async () => {
      await this.show(url, title, "kindDeck");
      await expect(this.fact(this.t("libraryDeck.release"))).toContainText(
        this.t("libraryDeck.version", { version: release.version }),
      );
      await expect(this.fact(this.t("libraryDeck.releaseNotes"))).toHaveText(release.notes);
    });
  }

  private async show(url: string, title: string, kind: "kindCourse" | "kindDeck"): Promise<void> {
    await this.page.getByRole("textbox", { name: this.t("importUrl.label") }).fill(url);
    await this.page.getByRole("button", { name: this.t("importUrl.show"), exact: true }).click();
    await expect(
      this.page.getByRole("heading", { level: 2, name: title, exact: true }),
    ).toBeVisible();
    const host = new URL(url).host;
    await expect(this.page.getByText(this.t("importUrl.notLibrary", { host }))).toBeVisible();
    await expect(this.fact(this.t("libraryDeck.host"))).toHaveText(host);
    await expect(this.fact(this.t("libraryDeck.kind"))).toHaveText(this.t(`libraryDeck.${kind}`));
  }

  /** What the release's facts say after the term `term` (that term exactly: "Release" is not "Release notes"). */
  private fact(term: string) {
    return this.page
      .getByRole("term")
      .filter({ hasText: new RegExp(`^${escapeRegExp(term)}$`) })
      .locator("xpath=following-sibling::dd[1]");
  }

  /** Imports the deck shown: the app goes back to Decks, where it now is. */
  async importDeck(title: string): Promise<void> {
    await this.intent(`Import ${title}`, async () => {
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("libraryDeck.import"), exact: true })
        .click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      await this.app.decks.expectDeck(title);
    });
  }

  /** Starts the course shown: it opens. */
  async startCourse(title: string): Promise<void> {
    await this.intent(`Start ${title}`, async () => {
      await this.page
        .getByRole("button", { name: this.t("libraryDeck.startCourse"), exact: true })
        .click();
      await this.app.course.expectShown(title);
    });
  }
}
