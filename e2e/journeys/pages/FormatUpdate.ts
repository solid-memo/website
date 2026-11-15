// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator, type Route } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/** The requests that only read, which the routes below let through (as the app's write fence counts them). */
const READS = ["GET", "HEAD", "OPTIONS"];

/** A document of the instance's own the update may name as one it could not update now. */
type Holds = "instance" | "preferences" | "catalog";

/**
 * The format update of an instance an older version of Solid Memo left
 * (docs/migrations.md "The pod migration"): its notice above the decks,
 * what is outdated and the button that updates it, its confirmation, its
 * progress, document by document, and its result, either word that the
 * data is up to date or the documents it could not update now.
 */
export class FormatUpdate extends Screen {
  get notice(): Locator {
    return this.page.getByRole("region", { name: this.t("migrationNotice.region"), exact: true });
  }

  get confirmation(): Locator {
    return this.page.getByRole("region", {
      name: this.t("instanceUpdate.confirmRegion"),
      exact: true,
    });
  }

  get progress(): Locator {
    return this.page.getByRole("region", {
      name: this.t("instanceUpdate.progressRegion"),
      exact: true,
    });
  }

  get result(): Locator {
    return this.page.getByRole("region", {
      name: this.t("instanceUpdate.resultRegion"),
      exact: true,
    });
  }

  private get done(): Locator {
    return this.page.getByRole("status").filter({ hasText: this.t("instanceUpdate.done") });
  }

  /**
   * The notice offers the update of exactly what is named: the instance
   * record, the catalog and the preferences when asked, each left out
   * otherwise, and the decks `decks`, each an item of its own; its button
   * says all of it, as the app words it ("Update 2 decks and the
   * catalog"; updateLabel in packages/ui/src/ui/MigrationNotice.tsx,
   * which this follows by hand). It shows once the app has read every
   * document.
   */
  async expectOffered({
    decks,
    instance = false,
    preferences = false,
    catalog = false,
  }: {
    decks: readonly string[];
    instance?: boolean;
    preferences?: boolean;
    catalog?: boolean;
  }): Promise<void> {
    await this.intent("Check what the format update offers", async () => {
      await expect(this.notice).toBeVisible({ timeout: 30_000 });
      const items = this.notice.getByRole("listitem");
      const item = (key: string) =>
        items.filter({ hasText: new RegExp(`^${escapeRegExp(this.t(key))}$`) });
      await expect(item("migrationNotice.itemInstanceRecord")).toHaveCount(Number(instance));
      await expect(item("migrationNotice.itemCatalogue")).toHaveCount(Number(catalog));
      await expect(item("migrationNotice.itemPreferences")).toHaveCount(Number(preferences));
      for (const deck of decks)
        await expect(items.filter({ hasText: new RegExp(`^${escapeRegExp(deck)} `) })).toHaveCount(
          1,
        );
      await expect(items).toHaveCount(
        decks.length + Number(instance) + Number(catalog) + Number(preferences),
      );
      const parts = [
        ...(decks.length > 0
          ? [this.t("migrationNotice.buttonDecks", { count: decks.length })]
          : []),
        ...(preferences ? [this.t("migrationNotice.buttonPreferences")] : []),
        ...(instance ? [this.t("migrationNotice.buttonInstanceRecord")] : []),
        ...(catalog ? [this.t("migrationNotice.buttonCatalogue")] : []),
      ];
      const what =
        parts.length <= 1
          ? parts.join("")
          : this.t("migrationNotice.listAnd", {
              rest: parts.slice(0, -1).join(", "),
              last: parts[parts.length - 1]!,
            });
      await expect(
        this.notice.getByRole("button", {
          name: this.t("migrationNotice.updateButton", { what }),
          exact: true,
        }),
      ).toBeVisible();
    });
  }

  /**
   * Opens the update's confirmation, which says how it keeps the data of
   * `instanceName` safe, and answers Not now: the notice is back, and has
   * the focus.
   */
  async decline(instanceName: string): Promise<void> {
    await this.intent("Open the update's confirmation and answer Not now", async () => {
      await this.openConfirmation();
      await expect(this.confirmation).toContainText(
        this.t("instanceUpdate.confirmBody", { name: instanceName }),
      );
      await this.confirmation
        .getByRole("button", { name: this.t("instanceUpdate.notNow"), exact: true })
        .click();
      await expect(this.confirmation).toHaveCount(0);
      await expect(this.notice).toBeFocused();
    });
  }

  /**
   * Starts the update and leaves the page part-way, as closing the tab
   * does, then opens Solid Memo again. To cut it off at the same point
   * every time, the pod's answer to the update's write after `written`
   * of its `total` documents is held back: the progress says so, and the
   * page is left. The documents are those in the instance's folder,
   * `instance`, but its digest, which the deck list writes on its own.
   * It returns once the notice is back, offering what is left.
   */
  async interruptUpdate(
    instance: string,
    { written, total }: { written: number; total: number },
  ): Promise<void> {
    await this.intent(
      "Close the tab while the update writes, and open Solid Memo again",
      async () => {
        let writes = 0;
        const held: Route[] = [];
        let holdingOne!: () => void;
        const holding = new Promise<void>((resolve) => {
          holdingOne = resolve;
        });
        await this.page.route(
          new RegExp(
            `^${escapeRegExp(instance)}(?:(?:meta|preferences|catalog)\\.ttl|(?:decks|reviews)/[^/]+\\.ttl)$`,
          ),
          async (route) => {
            if (READS.includes(route.request().method())) return route.fallback();
            writes += 1;
            if (writes <= written) return route.fallback();
            // Never answered: the page is left waiting for it.
            held.push(route);
            holdingOne();
          },
        );
        await this.start();
        await holding;
        await expect(this.progress).toContainText(
          this.t("instanceUpdate.count", { done: written, count: total }),
        );
        // Left while the write is held: taking the route away first would let it through.
        await this.page.goto("./");
        for (const route of held) await route.abort().catch(() => {});
        await this.page.unrouteAll({ behavior: "ignoreErrors" });
        await expect(this.notice).toBeVisible({ timeout: 30_000 });
      },
    );
  }

  /**
   * Starts the update while the document at `url` is changed elsewhere,
   * as the pod answers every write of it (412): the update goes on, and
   * says it could not update that one now, named as `document`, and that
   * it updated `updated` others.
   */
  async updateRefused(
    url: string,
    { document, updated }: { document: Holds; updated: number },
  ): Promise<void> {
    await this.intent("Update while a document is changed elsewhere", async () => {
      const refuse = async (route: Route) => {
        if (READS.includes(route.request().method())) return route.fallback();
        await route.fulfill({ status: 412 });
      };
      await this.page.route(url, refuse);
      await this.start();
      await expect(this.result).toContainText(this.t("instanceUpdate.notFinished", { count: 1 }), {
        timeout: 30_000,
      });
      await expect(
        this.result
          .getByRole("listitem")
          .filter({ hasText: this.t(`instanceUpdate.document.${document}`) }),
      ).toHaveCount(1);
      await expect(this.result).toContainText(
        this.t("instanceUpdate.updatedAlso", { count: updated }),
      );
      await this.page.unroute(url, refuse);
    });
  }

  /** "Try again" on the result: what is left is updated, the data up to date, and the notice gone. */
  async tryAgain(): Promise<void> {
    await this.intent("Try the update again", async () => {
      await this.result
        .getByRole("button", { name: this.t("instanceUpdate.tryAgain"), exact: true })
        .click();
      await expect(this.done).toBeVisible({ timeout: 30_000 });
      await expect(this.notice).toHaveCount(0);
      await expect(this.result).toHaveCount(0);
    });
  }

  /**
   * Nothing of the format update is shown: no notice, confirmation or
   * result. The notice shows only once the app has read every document,
   * so this proves nothing alone until something the app shows after
   * that read has shown.
   */
  async expectNone(): Promise<void> {
    await this.app.decks.expectShown();
    await expect(this.notice).toHaveCount(0);
    await expect(this.confirmation).toHaveCount(0);
    await expect(this.result).toHaveCount(0);
  }

  /** The notice's button, then its confirmation's "Start the update". */
  private async start(): Promise<void> {
    await this.openConfirmation();
    await this.confirmation
      .getByRole("button", { name: this.t("instanceUpdate.start"), exact: true })
      .click();
  }

  private async openConfirmation(): Promise<void> {
    await this.notice.getByRole("button").first().click();
    await expect(this.confirmation).toBeVisible();
  }
}
