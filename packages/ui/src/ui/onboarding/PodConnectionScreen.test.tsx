// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { PodConnectionScreen } from "./PodConnectionScreen";
import type { SolidAccount } from "@solid-memo/domain/account";
import { newTab } from "../../test/links";

const account: SolidAccount = {
  webId: "https://alice.example/profile/card#me",
  podUrl: "https://storage.elsewhere.example/alice/",
  oidcIssuer: "https://issuer.example",
};

function renderScreen(overrides: Partial<Parameters<typeof PodConnectionScreen>[0]> = {}) {
  const props = {
    account: undefined,
    busy: false,
    error: null,
    offerSkip: false,
    onRetry: vi.fn(),
    onContinue: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<PodConnectionScreen {...props} />);
  return props;
}

describe("PodConnectionScreen", () => {
  it("shows discovery in progress while busy", () => {
    renderScreen({ busy: true, account });
    expect(screen.getByRole("heading", { name: "Discovering your Pod…" })).toBeInTheDocument();
  });

  it("shows discovery in progress before any result exists", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Discovering your Pod…" })).toBeInTheDocument();
  });

  it("confirms the connection with the discovered account", () => {
    const { onContinue } = renderScreen({ account });
    expect(screen.getByRole("heading", { name: "Your Pod is connected." })).toBeInTheDocument();
    expect(screen.getByText(account.webId)).toBeInTheDocument();
    expect(screen.getByText(account.podUrl!)).toBeInTheDocument();
    expect(screen.getByText(account.oidcIssuer!)).toBeInTheDocument();
    for (const url of [account.webId, account.podUrl!, account.oidcIssuer!]) {
      expect(screen.getByRole("link", { name: newTab(url) })).toHaveAttribute("href", url);
    }

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers to skip the screen from now on, unchecked, before Continue", () => {
    const { onContinue } = renderScreen({ account, offerSkip: true });
    const skip = screen.getByRole("checkbox", { name: "Don't show this screen after logging in" });
    expect(skip).not.toBeChecked();
    expect(skip).not.toHaveFocus();
    expect(skip).toHaveAccessibleDescription(
      "Kept in the preferences of each of your instances. You can show this screen again in any instance's Preferences. An instance where the choice cannot be saved keeps showing it.",
    );
    const continueButton = screen.getByRole("button", { name: "Continue" });
    // Before Continue in the tab order.
    expect(skip.compareDocumentPosition(continueButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.click(skip);
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("shows the profile's name in place of the WebID, linked to it", () => {
    renderScreen({ account: { ...account, name: "Alice" } });
    expect(screen.getByRole("link", { name: newTab("Alice") })).toHaveAttribute(
      "href",
      account.webId,
    );
    expect(screen.queryByText(account.webId)).not.toBeInTheDocument();
  });

  it("names the user in the no-Pod message when the profile has a name", () => {
    renderScreen({ account: { webId: account.webId, name: "Alice" } });
    expect(screen.getByRole("link", { name: newTab("Alice") })).toHaveAttribute(
      "href",
      account.webId,
    );
  });

  it("omits the identity provider when it is unknown", () => {
    renderScreen({ account: { ...account, oidcIssuer: undefined } });
    expect(screen.queryByText("Identity provider")).not.toBeInTheDocument();
  });

  it("shows an error with retry and logout", () => {
    const { onRetry, onLogout } = renderScreen({
      error: "profile unreachable",
      account,
      offerSkip: true,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("profile unreachable");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("explains a profile without a storage link and offers ways forward", () => {
    const { onRetry, onContinue, onLogout } = renderScreen({
      account: { webId: account.webId },
      offerSkip: true,
    });
    // Not a screen to skip: it says what is wrong.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No Pod found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: newTab(account.webId) })).toHaveAttribute(
      "href",
      account.webId,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Continue anyway" }));
    expect(onContinue).toHaveBeenCalledExactlyOnceWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
