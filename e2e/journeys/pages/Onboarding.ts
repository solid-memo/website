// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * The landing page and the WebID form, before anyone is logged in, or
 * while a guest logs in to keep their study (the form shown at once).
 */
export class Onboarding extends Screen {
  async visit(): Promise<void> {
    await this.intent("Visit Solid Memo", async () => {
      await this.page.goto("./");
      await this.expectStart();
    });
  }

  /** Expects the landing page's first step, as on a first visit: "I already have a Pod" and the rest. */
  async expectStart(): Promise<void> {
    await expect(
      this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") }),
    ).toBeVisible();
  }

  private get webIdField(): Locator {
    return this.page.getByRole("textbox", { name: "WebID" });
  }

  /** Starts the login with a WebID; the browser goes on to its identity provider. */
  async logInWithWebId(webId: string): Promise<void> {
    await this.intent("Log in with the WebID", async () => {
      await this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") }).click();
      await this.submitWebId(webId);
    });
  }

  /**
   * Starts the login with a WebID where the WebID form is already shown,
   * as it is to someone who logged out here.
   */
  async logInAgainWithWebId(webId: string): Promise<void> {
    await this.intent("Log in again with the WebID", async () => {
      await this.expectLoggedOut();
      await this.submitWebId(webId);
    });
  }

  /**
   * Submits a WebID the form does not accept: it stays, the field marked
   * invalid and described by the error (errors.<code>).
   */
  async submitRefusedWebId(webId: string, code: string): Promise<void> {
    await this.intent(`Submit the WebID ${webId}, which is refused`, async () => {
      await this.submitWebId(webId);
      await expect(this.webIdField).toHaveAttribute("aria-invalid", "true");
      await expect(this.webIdField).toHaveAccessibleDescription(
        new RegExp(`^${escapeRegExp(this.t(`errors.${code}`))}`),
      );
      await expect(this.webIdField).toBeFocused();
    });
  }

  /**
   * The WebID form, already shown (to a guest logging in to keep their
   * study, or after a WebID refused): the login starts, on to the
   * identity provider.
   */
  async submitWebId(webId: string): Promise<void> {
    await this.intent("Submit the WebID", async () => {
      await this.webIdField.fill(webId);
      await this.page.getByRole("button", { name: this.t("webIdForm.logIn") }).click();
    });
  }

  /** "Try it without logging in": a guest's study starts, in this browser, at its decks. */
  async tryAsGuest(): Promise<void> {
    await this.intent("Try Solid Memo as a guest", async () => {
      await this.page
        .getByRole("button", { name: this.t("onboardingFlow.tryAsGuest"), exact: true })
        .click();
      await this.app.chrome.expectGuest();
      await this.app.decks.expectShown();
    });
  }

  /** Back from the identity provider: the pod it found, then on. */
  async continueConnected(pod: string): Promise<void> {
    await this.intent("Continue with the connected Pod", async () => {
      await expect(
        this.page.getByRole("heading", { name: this.t("podConnection.connectedHeading") }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(this.page.getByRole("main").locator(`a[href="${pod}"]`)).toBeVisible();
      await this.page.getByRole("button", { name: this.t("podConnection.continue") }).click();
    });
  }

  async expectLoggedOut(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: this.t("onboardingFlow.connectHeading") }),
    ).toBeVisible();
    await expect(this.webIdField).toBeVisible();
  }
}
