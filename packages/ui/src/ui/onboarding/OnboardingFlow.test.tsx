// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { OnboardingFlow } from "./OnboardingFlow";
import { POD_PROVIDERS, type PodProvider } from "@solid-memo/domain/podProvider";

function renderFlow(overrides: Partial<Parameters<typeof OnboardingFlow>[0]> = {}) {
  const props = {
    providers: POD_PROVIDERS,
    busy: false,
    returning: false,
    onLogin: vi.fn(),
    onLoginWithProvider: vi.fn(),
    ...overrides,
  };
  render(<OnboardingFlow {...props} />);
  return props;
}

describe("OnboardingFlow", () => {
  it("offers logging in ahead of creating a Pod, on the one page", () => {
    renderFlow();
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["Log in with your Pod", "Or use your WebID", "No Pod yet?"]);
    expect(
      screen.getByText(/Your data is stored in a Solid Pod that you control/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("WebID")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("offers trying the app as a guest first, then logging in, then creating a Pod", () => {
    const props = renderFlow({ onTryAsGuest: vi.fn() });
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Try it right away",
      "Log in with your Pod",
      "Or use your WebID",
      "No Pod yet?",
    ]);
    expect(screen.getByText(/No account needed: study as a guest/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Try it without logging in");
    expect(buttons[0]).toHaveClass("primary");
    fireEvent.click(screen.getByRole("button", { name: "Try it without logging in" }));
    expect(props.onTryAsGuest).toHaveBeenCalledOnce();
  });

  it("offers no guest's study unless it may", () => {
    renderFlow();
    expect(screen.queryByRole("button", { name: "Try it without logging in" })).toBeNull();
  });

  it("puts logging in first, ahead of the guest's offer, for someone who logged out here", () => {
    renderFlow({ returning: true, onTryAsGuest: vi.fn() });
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Log in with your Pod",
      "Or use your WebID",
      "Try it right away",
      "No Pod yet?",
    ]);
  });

  it("takes no focus: the page is the landing, not a step the user moved to", () => {
    renderFlow({ returning: true });
    expect(screen.getByLabelText("WebID")).not.toHaveFocus();
  });

  it("links to each provider's sign-up in a new tab, without leaking the opener", () => {
    renderFlow();
    expect(screen.getAllByRole("link")).toHaveLength(POD_PROVIDERS.length);
    for (const provider of POD_PROVIDERS) {
      expect(screen.getByText(provider.name, { selector: ".provider-name" })).toBeInTheDocument();
      const link = screen.getByRole("link", {
        name: `Create a Pod with ${provider.name} (opens in a new tab)`,
      });
      expect(link).toHaveTextContent("Create a Pod ↗");
      expect(link).toHaveAttribute("href", provider.signUpUrl);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      // Logging in is the main action; creating a Pod stays offered under it.
      expect(link).not.toHaveClass("primary");
    }
  });

  it("lists whichever providers it is given, for logging in and for creating a Pod", () => {
    const providers: PodProvider[] = [
      {
        id: "a",
        name: "Pod Co",
        oidcIssuer: "https://podco.example",
        signUpUrl: "https://podco.example/join",
      },
      {
        id: "b",
        name: "Other Pods",
        oidcIssuer: "https://other.example",
        signUpUrl: "https://other.example/new",
      },
      { id: "c", name: "Login Only", oidcIssuer: "https://login.example" },
    ];
    renderFlow({ providers });
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Login Only/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Login Only" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Other Pods/ })).toHaveAttribute(
      "href",
      "https://other.example/new",
    );
  });

  it("offers no Pod to create when no provider takes sign-ups", () => {
    renderFlow({
      providers: [{ id: "c", name: "Login Only", oidcIssuer: "https://login.example" }],
    });
    expect(screen.queryByRole("heading", { name: "No Pod yet?" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Login Only" })).toBeInTheDocument();
  });

  it("logs in with a typed WebID", () => {
    const { onLogin } = renderFlow();
    fireEvent.input(screen.getByLabelText("WebID"), {
      target: { value: "https://alice.example/profile/card#me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in with Solid" }));
    expect(onLogin).toHaveBeenCalledWith("https://alice.example/profile/card#me");
  });

  it("logs in at a provider in one click, without a WebID", () => {
    const { onLogin, onLoginWithProvider } = renderFlow();
    for (const provider of POD_PROVIDERS) {
      expect(screen.getByRole("button", { name: provider.name })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "solidcommunity.net" }));
    expect(onLoginWithProvider).toHaveBeenCalledWith(
      POD_PROVIDERS.find((provider) => provider.id === "solidcommunity"),
    );
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("disables the provider buttons and the guest's offer while busy, and passes it to the form", () => {
    renderFlow({ busy: true, onTryAsGuest: vi.fn() });
    expect(screen.getByRole("button", { name: "Inrupt PodSpaces" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Try it without logging in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redirecting…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
