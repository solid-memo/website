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
      await expect(this.page.getByRole("heading", { name: "Log in" })).toBeVisible({ timeout: 30_000 });
      await this.page.getByRole("textbox", { name: "Email" }).fill(account.email);
      await this.page.getByRole("textbox", { name: "Password" }).fill(account.password);
      await this.page.getByRole("button", { name: "Log in" }).click();
    });
  }

  async authorize(webId: string): Promise<void> {
    await this.intent("Let Solid Memo use the Pod", async () => {
      await expect(this.page.getByRole("heading", { name: "An application is requesting access" })).toBeVisible();
      await expect(this.page.getByRole("radio", { name: webId })).toBeChecked();
      await this.page.getByRole("button", { name: "Authorize" }).click();
    });
  }
}
