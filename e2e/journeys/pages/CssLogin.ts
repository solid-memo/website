// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import type { CssAccount } from "../harness/cssAccount.ts";
import { Screen } from "./Screen.ts";

/**
 * The Community Solid Server 7's own pages: its login and its consent
 * ("An application is requesting access"). Its text is its own, in
 * English, not the app's.
 */
export class CssLogin extends Screen {
  async logIn(account: CssAccount): Promise<void> {
    await this.intent("Log in at the Solid server", async () => {
      await expect(this.page.getByRole("heading", { name: "Log in" })).toBeVisible({
        timeout: 30_000,
      });
      await this.page.getByRole("textbox", { name: "Email" }).fill(account.email);
      await this.page.getByRole("textbox", { name: "Password" }).fill(account.password);
      await this.page.getByRole("button", { name: "Log in" }).click();
    });
  }

  async authorize(webId: string): Promise<void> {
    await this.intent("Let Solid Memo use the Pod", async () => {
      await this.expectConsent(webId);
      await this.page.getByRole("button", { name: "Authorize" }).click();
    });
  }

  /**
   * The consent page is shown, which may come straight from the app when
   * the server skips its login (its session cookie), and is ready: its
   * script lists the account's WebIDs, `webId` chosen, only after it has
   * wired its buttons, so a click before that does nothing.
   */
  private async expectConsent(webId: string): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: "An application is requesting access" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(this.page.getByRole("radio", { name: webId })).toBeChecked();
  }

  /** Refuses Solid Memo the Pod: Cancel, which sends the browser back to the app. */
  async refuse(webId: string): Promise<void> {
    await this.intent("Refuse Solid Memo the Pod", async () => {
      await this.expectConsent(webId);
      await this.page.getByRole("button", { name: "Cancel" }).click();
    });
  }
}
