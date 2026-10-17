// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * The offer to keep a guest's study, made above the workspace to a user
 * who logged in where a guest studied in this browser
 * (docs/guest-mode.md): "Move it into my Pod", then the form of where
 * to (a new instance, for a user who has none), the move step by step,
 * and how it ended; above them, the partial copy a move cut off by a
 * closed tab left, with the button that removes it.
 */
export class GuestOffer extends Screen {
  get region(): Locator {
    return this.page.getByRole("region", { name: this.t("guestOffer.region"), exact: true });
  }

  get form(): Locator {
    return this.page.getByRole("region", { name: this.t("guestOffer.formHeading"), exact: true });
  }

  get progress(): Locator {
    return this.page.getByRole("region", {
      name: this.t("guestOffer.progressRegion"),
      exact: true,
    });
  }

  /** The panel of a move cut off before it was finished. */
  get leftover(): Locator {
    return this.page.getByRole("region", { name: this.t("interruptedMove.region"), exact: true });
  }

  /** The offer names the guest's instance and how many decks it has. */
  async expectOffered(name: string, decks: number): Promise<void> {
    await expect(this.region).toBeVisible({ timeout: 30_000 });
    await expect(this.region).toContainText(this.t("guestOffer.heading"));
    await expect(this.region).toContainText(this.t("guestOffer.body", { name, count: decks }));
  }

  async expectNone(): Promise<void> {
    await expect(this.region).toBeHidden();
    await expect(this.form).toBeHidden();
  }

  /**
   * "Move it into my Pod" to a new instance: the form suggests where, at
   * `location`; "Move it" starts the move, which the progress shows.
   */
  async startMove(location: string): Promise<void> {
    await this.intent("Start moving the study into the Pod", async () => {
      await this.region
        .getByRole("button", { name: this.t("guestOffer.move"), exact: true })
        .click();
      await expect(
        this.form.getByText(this.t("guestOffer.explain"), { exact: true }),
      ).toBeVisible();
      await expect(
        this.form.getByRole("textbox", { name: this.t("guestOffer.location"), exact: true }),
      ).toHaveValue(location);
      await this.form
        .getByRole("button", { name: this.t("guestOffer.start"), exact: true })
        .click();
    });
  }

  /**
   * Starts the move to `location` and leaves the page while it copies, as
   * closing the tab does (its Web Lock let go, the move cut off), then
   * opens Solid Memo again. To cut it off at the same point every time,
   * the Pod's answer to the move's write after `written` is held back,
   * and the page is left once the progress says the copy is under way;
   * the copy is then a container and those writes.
   */
  async interruptMove(location: string, written: number): Promise<void> {
    await this.intent(
      "Close the tab while the move copies, and open Solid Memo again",
      async () => {
        let writes = 0;
        let held!: () => void;
        const holding = new Promise<void>((resolve) => {
          held = resolve;
        });
        await this.page.route(`${location}**`, async (route) => {
          if (["GET", "HEAD"].includes(route.request().method())) return route.fallback();
          writes += 1;
          if (writes <= written) return route.fallback();
          // Never answered: the page is left waiting for it.
          held();
        });
        await this.startMove(location);
        await holding;
        await expect(this.progress).toContainText(this.t("guestOffer.step.copy"));
        await this.page.unrouteAll({ behavior: "ignoreErrors" });
        await this.page.goto("./");
      },
    );
  }

  /** The panel says a move was cut off, its partial copy left at `url`; "Remove it" removes it, and the panel goes. */
  async removeLeftover(name: string, url: string): Promise<void> {
    await this.intent("Remove the partial copy", async () => {
      await expect(this.leftover).toHaveText(
        new RegExp(escapeRegExp(this.t("interruptedMove.text", { name, url }))),
        { timeout: 30_000 },
      );
      await this.leftover
        .getByRole("button", { name: this.t("interruptedMove.remove"), exact: true })
        .click();
      await expect(this.leftover).toBeHidden();
    });
  }

  /**
   * Moves the study into a new instance at `location`, the place the form
   * suggests: once every step is done, the app says so and opens the
   * instance's decks.
   */
  async moveIntoPod(location: string): Promise<void> {
    await this.intent("Move the study into the Pod", async () => {
      await this.startMove(location);
      await expect(
        this.page.getByRole("status").filter({ hasText: this.t("guestOffer.moved") }),
      ).toHaveText(this.t("guestOffer.moved"), { timeout: 60_000 });
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      await expect(this.region).toBeHidden();
    });
  }
}
