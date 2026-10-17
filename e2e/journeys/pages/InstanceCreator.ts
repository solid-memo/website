// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * "New Solid Memo instance": where a first login lands, the pod's storage
 * already chosen, and New instance… leads. Its Location starts on the
 * storage's `solid-memo/main/`.
 */
export class InstanceCreator extends Screen {
  /** Names the instance and creates it, in `location` when given (a folder's URL); its decks open. */
  async create(name: string, location?: string): Promise<void> {
    await this.intent(`Create the instance ${name}`, async () => {
      await expect(
        this.page.getByRole("heading", { name: this.t("instanceCreator.heading") }),
      ).toBeVisible({ timeout: 30_000 });
      await this.page.getByRole("textbox", { name: this.t("instanceCreator.name") }).fill(name);
      if (location !== undefined)
        await this.page
          .getByRole("textbox", { name: this.t("instanceCreator.location") })
          .fill(location);
      await this.page.getByRole("button", { name: this.t("instanceCreator.create") }).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      await this.app.chrome.expectInstance(name, location);
    });
  }
}
