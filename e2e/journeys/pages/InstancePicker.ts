// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * "Choose a Solid Memo instance": the user's instances, each a button
 * that opens it, a link to its folder ("Open in your Pod") and
 * "Delete instance {name}"; under them, New instance… and attaching one
 * by URL. Reached from the instance bar's "Switch instance", or on
 * arriving with more than one instance. A deletion that kept the
 * instance's folder says so, and why, in a notice that links the folder.
 */
export class InstancePicker extends Screen {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: this.t("instancePicker.heading"), level: 2 });
  }

  /** The list of instances: the main list whose items have a Delete button. */
  private get list(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("list")
      .filter({
        has: this.page.getByRole("button", { name: this.tp("instancePicker.deleteLabel") }),
      });
  }

  /** The button that opens the instance named `name`. */
  private openButton(name: string): Locator {
    return this.list.getByRole("button", { name, exact: true });
  }

  async expectShown(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await this.app.chrome.expectBreadcrumbHere("breadcrumbs.instances");
  }

  /** The instances listed are those named, and no others. */
  async expectInstances(names: readonly string[]): Promise<void> {
    await this.intent(`Check the instances listed: ${names.join(", ")}`, async () => {
      await this.expectShown();
      await expect(
        this.list.getByRole("button", { name: this.tp("instancePicker.deleteLabel") }),
      ).toHaveCount(names.length);
      for (const name of names) await expect(this.openButton(name)).toBeVisible();
    });
  }

  /** Opens the instance named `name`: its decks, its name in the instance bar. */
  async open(name: string): Promise<void> {
    await this.intent(`Open the instance ${name}`, async () => {
      await this.openButton(name).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      await this.app.chrome.expectInstance(name);
    });
  }

  /** Follows "New instance…": the pod's one storage is taken, so on to the instance creator. */
  async openInstanceCreator(): Promise<void> {
    await this.intent("Start a new instance", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("instancePicker.newInstance"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.t("instanceCreator.heading") }),
      ).toBeVisible();
    });
  }

  /**
   * Deletes the instance named `name`, confirmed when the app asks: its
   * row goes, and the status line says it is gone.
   */
  async delete(name: string): Promise<void> {
    await this.intent(`Delete the instance ${name}`, async () => {
      this.app.expectDialog(this.tp("instancePicker.deleteConfirm", { name }));
      await this.list
        .getByRole("button", { name: this.t("instancePicker.deleteLabel", { name }), exact: true })
        .click();
      await expect(
        this.page
          .getByRole("status")
          .filter({ hasText: this.t("instancePicker.deleted", { name }) }),
      ).toBeAttached();
      await expect(this.openButton(name)).toBeHidden();
    });
  }

  /**
   * The notice that the last deletion kept `folder`, and why: another app
   * put files there. Its link leads to the folder.
   */
  async expectKeptFolder(folder: string): Promise<void> {
    await this.intent("Check which folder was kept, and why", async () => {
      const link = this.page.getByRole("link", { name: this.t("keptFolder.folder") });
      const notice = this.page.getByRole("main").getByRole("status").filter({ has: link });
      // The reason around the link, whatever the link's own text.
      await expect(notice).toHaveText(this.tp("keptFolder.text"));
      await expect(notice.getByRole("link")).toHaveAttribute("href", folder);
    });
  }
}
