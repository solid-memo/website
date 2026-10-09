import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { OnboardingFlow } from "./OnboardingFlow";
import { POD_PROVIDERS, type PodProvider } from "@solid-memo/domain/podProvider";

function renderFlow(
  overrides: Partial<Parameters<typeof OnboardingFlow>[0]> = {},
) {
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
  it("explains Solid Pods and offers both paths", () => {
    renderFlow();
    expect(
      screen.getByRole("heading", { name: "Set up your Solid Pod" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your data is stored in a Solid Pod that you control/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "I already have a Pod" }),
    ).toBeInTheDocument();
  });

  it("offers trying the app as a guest first, ahead of setting up a Pod, when it may", () => {
    const props = renderFlow({ onTryAsGuest: vi.fn() });
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["Try it right away", "Set up your Solid Pod"]);
    expect(screen.getByText(/No account needed: study as a guest/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Try it without logging in");
    expect(buttons[0]).toHaveClass("primary");
    // Creating a Pod stays offered, no longer as the main action.
    expect(screen.getByRole("link", { name: /Create a Pod with/ })).not.toHaveClass("primary");
    fireEvent.click(screen.getByRole("button", { name: "Try it without logging in" }));
    expect(props.onTryAsGuest).toHaveBeenCalledOnce();
  });

  it("offers no guest's study unless it may", () => {
    renderFlow();
    expect(screen.queryByRole("button", { name: "Try it without logging in" })).toBeNull();
    expect(screen.getByRole("link", { name: /Create a Pod with/ })).toHaveClass("primary");
  });

  it("links to iGrant.io sign-up in a new tab, without leaking the opener", () => {
    renderFlow();
    expect(screen.getByText("iGrant.io Data Pod")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "Create a Pod with iGrant.io Data Pod (opens in a new tab)",
    });
    expect(link).toHaveTextContent("Create a Pod ↗");
    expect(link).toHaveAttribute("href", "https://igrant.io/datapod.html");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("lists whichever providers it is given", () => {
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
    expect(screen.queryByText("Login Only")).toBeNull();
    expect(
      screen.getByRole("link", { name: /Other Pods/ }),
    ).toHaveAttribute("href", "https://other.example/new");
  });

  it("moves to the WebID step, focused, and logs in from there", () => {
    const { onLogin } = renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "I already have a Pod" }));

    const field = screen.getByLabelText("WebID");
    expect(field).toHaveFocus();
    fireEvent.input(field, {
      target: { value: "https://alice.example/profile/card#me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in with Solid" }));
    expect(onLogin).toHaveBeenCalledWith("https://alice.example/profile/card#me");
  });

  it("suggests identity providers for users who do not type a WebID", () => {
    const { onLogin, onLoginWithProvider } = renderFlow({ returning: true });
    expect(
      screen.getByRole("heading", { name: "Or pick your provider" }),
    ).toBeInTheDocument();
    for (const provider of POD_PROVIDERS) {
      expect(
        screen.getByRole("button", { name: provider.name }),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "solidcommunity.net" }));
    expect(onLoginWithProvider).toHaveBeenCalledWith(
      POD_PROVIDERS.find((provider) => provider.id === "solidcommunity"),
    );
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("disables the provider suggestions while busy", () => {
    renderFlow({ returning: true, busy: true });
    expect(
      screen.getByRole("button", { name: "Inrupt PodSpaces" }),
    ).toBeDisabled();
  });

  it("goes back from the WebID step to the choice, focused on the button that led there", () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "I already have a Pod" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: "Set up your Solid Pod" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I already have a Pod" })).toHaveFocus();
  });

  it("goes back for a returning user too, focused", () => {
    renderFlow({ returning: true });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "I already have a Pod" })).toHaveFocus();
  });

  it("starts a returning user at the WebID step without stealing focus", () => {
    renderFlow({ returning: true });
    expect(screen.getByLabelText("WebID")).not.toHaveFocus();
    expect(
      screen.queryByRole("heading", { name: "Set up your Solid Pod" }),
    ).not.toBeInTheDocument();
  });

  it("passes the busy state to the form", () => {
    renderFlow({ returning: true, busy: true });
    expect(screen.getByRole("button", { name: "Redirecting…" })).toHaveAttribute("aria-disabled", "true");
  });
});
