import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import type { UseCases } from "@solid-memo/application/useCases";
import type { SolidAccount } from "@solid-memo/domain/account";
import type { EstablishedSession, Session } from "@solid-memo/domain/session";
import { makeUseCasesFake } from "../test/useCasesFake";
import { MAIN_ID } from "./SkipLink";

const session: Session = { webId: "https://alice.example/profile/card#me" };
const restored: EstablishedSession = { session, origin: "restored" };
const loggedIn: EstablishedSession = { session, origin: "login" };
function makeUseCases(overrides: Partial<UseCases> = {}): UseCases {
  return makeUseCasesFake(overrides);
}

/** Walk the signed-out onboarding to the WebID step and submit it. */
async function submitWebId(webId: string) {
  fireEvent.click(
    await screen.findByRole("button", { name: "I already have a Pod" }),
  );
  fireEvent.input(screen.getByLabelText("WebID"), { target: { value: webId } });
  fireEvent.click(screen.getByRole("button", { name: "Log in with Solid" }));
}

function renderApp(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App useCases={useCases} commitSha="8faa7e1bd2e6de2b6570d692fd2865bb4b3217ad" />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  it("speaks the language the use cases pick from the browser's", async () => {
    const useCases = makeUseCases({ language: vi.fn(() => "sv" as const) });
    renderApp(useCases);
    expect(useCases.language).toHaveBeenCalledWith(navigator.languages);
    expect(await screen.findByText(/Skapad av/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("sv");
  });

  describe("theme", () => {
    /** A browser whose dark-mode wish can change while the app runs. */
    function fakeBrowserScheme(dark: boolean) {
      const listeners = new Set<() => void>();
      const query = {
        get matches() {
          return dark;
        },
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      };
      vi.spyOn(window, "matchMedia").mockReturnValue(query as unknown as MediaQueryList);
      return {
        change(nowDark: boolean) {
          dark = nowDark;
          act(() => listeners.forEach((listener) => listener()));
        },
        listeners,
      };
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const instance = { url: "https://pod.example/solid-memo/main/", name: "Main" };

    /** Logged in, in an instance whose preferences hold `theme` (null: it has none yet). */
    function inInstance(theme: "system" | "light" | "dark" | null, overrides: Partial<UseCases> = {}) {
      window.location.hash = "";
      return makeUseCases({
        restoreSession: vi.fn(async () => restored),
        listInstances: vi.fn(async () => [instance]),
        instanceTheme: vi.fn(async () => theme),
        ...overrides,
      });
    }

    it("follows the browser while nothing is chosen, as it changes", async () => {
      const browser = fakeBrowserScheme(true);
      const { unmount } = renderApp(makeUseCases());
      expect(await screen.findByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("dark");
      browser.change(false);
      expect(document.documentElement.dataset.theme).toBe("light");
      browser.change(true);
      expect(document.documentElement.dataset.theme).toBe("dark");
      unmount();
      await waitFor(() => expect(browser.listeners.size).toBe(0));
    });

    it("shows the theme chosen on this device, whatever the browser prefers", async () => {
      fakeBrowserScheme(true);
      renderApp(makeUseCases({ themeChoice: vi.fn(() => "light" as const) }));
      expect(await screen.findByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    it("switches theme on this device alone outside an instance", async () => {
      fakeBrowserScheme(false);
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
      const useCases = makeUseCases();
      renderApp(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Switch to dark mode" }));
      expect(useCases.chooseTheme).toHaveBeenCalledWith("dark", null);
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(meta.content).toBe("#11171e");
      fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(meta.content).toBe("#f7f6f1");
      await waitFor(() => expect(useCases.chooseTheme).toHaveBeenCalledTimes(2));
      expect(useCases.instanceTheme).not.toHaveBeenCalled();
      meta.remove();
    });

    it("shows the theme the open instance's preferences hold, and keeps a new choice there", async () => {
      fakeBrowserScheme(false);
      const useCases = inInstance("dark");
      renderApp(useCases);
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
      expect(useCases.instanceTheme).toHaveBeenCalledWith(instance.url);
      vi.mocked(useCases.instanceTheme).mockResolvedValue("light");
      fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
      expect(useCases.chooseTheme).toHaveBeenCalledWith("light", instance.url);
      // Read back from the pod once written.
      await waitFor(() => expect(useCases.instanceTheme).toHaveBeenCalledTimes(2));
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    it("keeps the device's theme in an instance without preferences", async () => {
      fakeBrowserScheme(false);
      const useCases = inInstance(null, { themeChoice: vi.fn(() => "dark" as const) });
      renderApp(useCases);
      await waitFor(() => expect(useCases.instanceTheme).toHaveBeenCalledWith(instance.url));
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("puts back the pod's theme when a choice cannot be written there", async () => {
      fakeBrowserScheme(false);
      const useCases = inInstance("dark", { chooseTheme: vi.fn(async () => Promise.reject(new Error("412"))) });
      renderApp(useCases);
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
      fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
      expect(document.documentElement.dataset.theme).toBe("light");
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    });

    it("reads the pod back only after the last of quick choices", async () => {
      fakeBrowserScheme(false);
      const writes: (() => void)[] = [];
      const useCases = inInstance("dark", {
        chooseTheme: vi.fn(() => new Promise<void>((resolve) => writes.push(resolve))),
      });
      renderApp(useCases);
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
      fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
      fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
      await act(async () => writes[0]());
      expect(useCases.instanceTheme).toHaveBeenCalledOnce();
      await act(async () => writes[1]());
      await waitFor(() => expect(useCases.instanceTheme).toHaveBeenCalledTimes(2));
    });
  });

  it("switches language, and keeps the choice", async () => {
    const useCases = makeUseCases();
    renderApp(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Svenska" }));
    expect(useCases.chooseLanguage).toHaveBeenCalledWith("sv");
    expect(await screen.findByText(/Skapad av/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("sv");
    await waitFor(() => expect(document.title).toBe("Logga in – Solid Memo"));
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(await screen.findByText(/Created by/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  describe("page structure", () => {
    it("starts with a link past the header that focuses the main content, leaving the route alone", async () => {
      window.location.hash = "#/";
      const { container } = renderApp(makeUseCases());
      await screen.findByRole("heading", { name: "Set up your Solid Pod" });
      const skip = screen.getByRole("link", { name: "Skip to content" });
      // The first thing in the page, so the first Tab stop.
      expect(container.firstElementChild).toBe(skip);
      fireEvent.click(skip);
      expect(screen.getByRole("main")).toHaveFocus();
      expect(window.location.hash).toBe("#/");
    });

    it("puts the open instance's bar in the banner, as a navigation landmark", async () => {
      window.location.hash = "";
      const instance = { url: "https://pod.example/solid-memo/main/", name: "Main" };
      renderApp(
        makeUseCases({
          restoreSession: vi.fn(async () => restored),
          listInstances: vi.fn(async () => [instance]),
        }),
      );
      const bar = await screen.findByRole("navigation", { name: "Instance" });
      expect(bar.closest("header")).toBe(screen.getByRole("banner"));
      expect(within(bar).getByRole("link", { name: "Switch instance" })).toHaveAttribute(
        "href",
        "#/instances",
      );
      // The main content opens on the screen, not on the site's header.
      expect(
        await within(screen.getByRole("main")).findByRole("heading", { name: "Decks" }),
      ).toBeInTheDocument();
      expect(within(screen.getByRole("main")).queryByRole("navigation", { name: "Instance" })).toBeNull();
    });
  });

  it("shows a restoring indicator while the session check is pending", () => {
    renderApp(
      makeUseCases({
        restoreSession: vi.fn(() => new Promise<null>(() => { })),
      }),
    );
    expect(screen.getByText("Restoring session…")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Restoring session…");
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(document.title).toBe("Solid Memo");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Created by antwika",
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Version 8faa7e1");
  });

  it("starts the Pod onboarding when no session is restored", async () => {
    const { container } = renderApp(makeUseCases());
    expect(
      await screen.findByRole("heading", { name: "Set up your Solid Pod" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /iGrant\.io Data Pod/ }),
    ).toHaveAttribute("href", "https://igrant.io/datapod.html");
    // The picture is decorative; the product name is the page's heading.
    expect(container.querySelector("img.hero")).toHaveAttribute("alt", "");
    expect(screen.getByRole("heading", { level: 1, name: "Solid Memo" })).toBeInTheDocument();
    // The theme and language choices make the banner; the onboarding is the main content.
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Set up your Solid Pod" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Log in – Solid Memo"));
  });

  it("shows a session-restore error (Error instance)", async () => {
    renderApp(
      makeUseCases({
        restoreSession: vi.fn(async () => {
          throw new Error("restore failed");
        }),
      }),
    );
    expect(await screen.findByText("restore failed")).toBeInTheDocument();
  });

  it("shows a session-restore error (non-Error rejection)", async () => {
    renderApp(
      makeUseCases({
        restoreSession: vi.fn(async () => {
          throw "plain failure";
        }),
      }),
    );
    expect(await screen.findByText("plain failure")).toBeInTheDocument();
  });

  it("logs in with the entered WebID and stays busy while redirecting", async () => {
    const loginWithWebId = vi.fn(() => new Promise<void>(() => { }));
    const useCases = makeUseCases({ loginWithWebId });
    renderApp(useCases);

    await submitWebId(session.webId);

    expect(loginWithWebId).toHaveBeenCalledWith(session.webId);
    expect(
      await screen.findByRole("button", { name: "Redirecting…" }),
    ).toBeInTheDocument();
  });

  it("logs in at a suggested provider without a WebID", async () => {
    const loginWithProvider = vi.fn(() => new Promise<void>(() => { }));
    const useCases = makeUseCases({ loginWithProvider });
    renderApp(useCases);

    fireEvent.click(
      await screen.findByRole("button", { name: "I already have a Pod" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Inrupt PodSpaces" }));

    expect(loginWithProvider).toHaveBeenCalledWith("https://login.inrupt.com");
    expect(useCases.loginWithWebId).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Redirecting…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Inrupt PodSpaces" }),
    ).toBeDisabled();
  });

  it("shows an error when a provider login cannot start", async () => {
    renderApp(
      makeUseCases({
        loginWithProvider: vi.fn(async () => {
          throw new Error("provider unreachable");
        }),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "I already have a Pod" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "solidweb.me" }));

    expect(await screen.findByText("provider unreachable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "solidweb.me" })).toBeEnabled();
  });

  it("shows a login error (Error instance) and re-enables the form", async () => {
    renderApp(
      makeUseCases({
        loginWithWebId: vi.fn(async () => {
          throw new Error("issuer discovery failed");
        }),
      }),
    );

    await submitWebId(session.webId);
    expect(
      await screen.findByText("issuer discovery failed"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log in with Solid" }),
    ).toBeEnabled();
  });

  it("shows a login error (non-Error rejection)", async () => {
    renderApp(
      makeUseCases({
        loginWithWebId: vi.fn(async () => {
          throw "login broke";
        }),
      }),
    );

    await submitWebId(session.webId);
    expect(await screen.findByText("login broke")).toBeInTheDocument();
  });

  it("skips onboarding and shows the app when a session is restored", async () => {
    const useCases = makeUseCases({
      restoreSession: vi.fn(async () => restored),
    });
    const { container } = renderApp(useCases);

    expect(
      await screen.findByRole("link", { name: `${session.webId} (opens in a new tab)` }),
    ).toBeInTheDocument();
    // One link home, the logo part of it: no second stop beside the name.
    const home = within(
      screen.getByRole("heading", { level: 1, name: "Solid Memo" }),
    ).getByRole("link", { name: "Solid Memo" });
    expect(home).toHaveAttribute("href", "#/");
    expect(home.querySelector("img.logo")).toHaveAttribute("alt", "");
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "#/")).toHaveLength(1);
    // The masthead and instance bar make the banner, above the main content.
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(container.querySelector("main .masthead")).toBeNull();
    expect(useCases.discoverAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "Created by antwika",
    );
    expect(screen.queryByText("WebID document")).toBeNull();
    expect(useCases.viewWebIdDocument).not.toHaveBeenCalled();
  });

  it("keeps the banner and main content while the instances load", async () => {
    const useCases = makeUseCases({
      restoreSession: vi.fn(async () => restored),
      listInstances: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderApp(useCases);

    const logOut = await screen.findByRole("button", { name: "Log out" });
    const banner = screen.getByRole("banner");
    expect(banner).toContainElement(logOut);
    expect(within(banner).getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByText("Loading your Solid Memo instances", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", MAIN_ID);
  });

  it("keeps the banner, with Log out, when the instances fail to load", async () => {
    const useCases = makeUseCases({
      restoreSession: vi.fn(async () => restored),
      listInstances: vi.fn(async () => {
        throw new Error("pod unreachable");
      }),
    });
    renderApp(useCases);

    await waitFor(() =>
      expect(within(screen.getByRole("main")).getByRole("alert")).toHaveTextContent("pod unreachable"),
    );
    expect(
      within(screen.getByRole("banner")).getByRole("button", { name: "Log out" }),
    ).toBeInTheDocument();
  });

  describe("after a completed login", () => {
    it("discovers the Pod, confirms the connection, then enters the app", async () => {
      let resolveAccount: (account: SolidAccount) => void = () => undefined;
      const useCases = makeUseCases({
        restoreSession: vi.fn(async () => loggedIn),
        discoverAccount: vi.fn(
          () => new Promise<SolidAccount>((resolve) => (resolveAccount = resolve)),
        ),
      });
      renderApp(useCases);

      expect(
        await screen.findByRole("heading", { name: "Discovering your Pod…" }),
      ).toBeInTheDocument();
      await waitFor(() => expect(document.title).toBe("Connecting your Pod – Solid Memo"));
      await waitFor(() => {
        expect(useCases.discoverAccount).toHaveBeenCalledWith(session);
      });
      expect(useCases.listInstances).not.toHaveBeenCalled();

      await act(async () =>
        resolveAccount({
          webId: session.webId,
          name: "Alice",
          podUrl: "https://alice.example/",
          oidcIssuer: "https://issuer.example",
        }),
      );
      expect(
        await screen.findByRole("heading", { name: "Your Pod is connected." }),
      ).toBeInTheDocument();
      expect(screen.getByText("https://alice.example/")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(
        await screen.findByRole("button", { name: "Log out" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Logged in as/)).toHaveTextContent(
        "Logged in as Alice",
      );
      expect(screen.getByRole("link", { name: "Alice (opens in a new tab)" })).toHaveAttribute(
        "href",
        session.webId,
      );
      await waitFor(() => {
        expect(useCases.listInstances).toHaveBeenCalled();
      });
      // The workspace titles its screens from here on.
      await waitFor(() => expect(document.title).not.toBe("Connecting your Pod – Solid Memo"));
    });

    it("shows a discovery error and retries on request", async () => {
      const discoverAccount = vi
        .fn<UseCases["discoverAccount"]>()
        .mockRejectedValueOnce(new Error("profile unreachable"))
        .mockResolvedValueOnce({
          webId: session.webId,
          podUrl: "https://alice.example/",
        });
      renderApp(
        makeUseCases({
          restoreSession: vi.fn(async () => loggedIn),
          discoverAccount,
        }),
      );

      expect(await screen.findByText("profile unreachable")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(
        await screen.findByRole("heading", { name: "Your Pod is connected." }),
      ).toBeInTheDocument();
      expect(discoverAccount).toHaveBeenCalledTimes(2);
    });

    it("logs out from a failed discovery", async () => {
      const useCases = makeUseCases({
        restoreSession: vi.fn(async () => loggedIn),
        discoverAccount: vi.fn(async () => {
          throw new Error("profile unreachable");
        }),
      });
      renderApp(useCases);

      fireEvent.click(await screen.findByRole("button", { name: "Log out" }));
      await waitFor(() => {
        expect(useCases.logout).toHaveBeenCalledOnce();
      });
      expect(
        await screen.findByRole("button", { name: "Log in with Solid" }),
      ).toBeInTheDocument();
    });
  });

  it("drops to the login screen when the session expires", async () => {
    let expire: (() => void) | undefined;
    const useCases = makeUseCases({
      restoreSession: vi.fn(async () => restored),
      onSessionExpired: vi.fn((listener: () => void) => {
        expire = listener;
        return () => undefined;
      }),
    });
    renderApp(useCases);

    await screen.findByRole("link", { name: `${session.webId} (opens in a new tab)` });
    act(() => expire!());

    const alert = await screen.findByText("Your session has expired. Please log in again.");
    // Announced, focused and first after the tagline, before the login form.
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveFocus();
    expect(alert.previousElementSibling).toHaveClass("tagline");
    expect(
      screen.getByRole("button", { name: "Log in with Solid" }),
    ).toBeInTheDocument();
  });

  it("logs out and returns to the WebID form", async () => {
    const useCases = makeUseCases({
      restoreSession: vi.fn(async () => restored),
    });
    renderApp(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(useCases.logout).toHaveBeenCalledOnce();
    });
    expect(
      await screen.findByRole("button", { name: "Log in with Solid" }),
    ).toBeInTheDocument();
  });

  describe("as a guest", () => {
    const guest: Session = { webId: "https://guest.solid-memo.invalid/profile/card#me", guest: true };

    it("starts studying without logging in, in an instance named in the reader's language", async () => {
      const useCases = makeUseCases();
      renderApp(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Try it without logging in" }));
      expect(await screen.findByText(/You are trying Solid Memo as a guest/)).toBeInTheDocument();
      expect(useCases.startGuest).toHaveBeenCalledWith("My study");
      expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
      expect(useCases.findGuestStudy).not.toHaveBeenCalled();
    });

    it("shows why a guest's study could not start", async () => {
      const useCases = makeUseCases({ startGuest: vi.fn(async () => Promise.reject(new Error("no storage"))) });
      renderApp(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Try it without logging in" }));
      expect(await screen.findByText("no storage")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try it without logging in" })).toBeEnabled();
    });

    it("goes on with a guest's study restored, and logs in from it to keep it", async () => {
      const loginWithWebId = vi.fn(() => new Promise<void>(() => {}));
      const useCases = makeUseCases({
        restoreSession: vi.fn(async () => ({ session: guest, origin: "restored" as const })),
        loginWithWebId,
      });
      renderApp(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Keep my study: log in" }));
      expect(screen.getByText(/Log in to keep your study/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try it without logging in" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Back to my study" }));
      expect(await screen.findByText(/You are trying Solid Memo as a guest/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Keep my study: log in" }));
      fireEvent.input(screen.getByLabelText("WebID"), { target: { value: session.webId } });
      fireEvent.click(screen.getByRole("button", { name: "Log in with Solid" }));
      expect(loginWithWebId).toHaveBeenCalledWith(session.webId);
    });

    it("discards a guest's study once the guest confirms it", async () => {
      const useCases = makeUseCases({
        restoreSession: vi.fn(async () => ({ session: guest, origin: "restored" as const })),
      });
      renderApp(useCases);
      const discard = await screen.findByRole("button", { name: "Discard" });
      discard.focus();
      fireEvent.click(discard);
      // The question takes the focus, read out as its description; Cancel gives it back.
      const region = screen.getByRole("region", { name: "Discard your study as a guest" });
      expect(region).toHaveTextContent("This cannot be undone.");
      expect(region).toHaveFocus();
      expect(region).toHaveAccessibleDescription(/This cannot be undone\./);
      screen.getByRole("button", { name: "Cancel" }).focus();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("region", { name: "Discard your study as a guest" })).toBeNull();
      expect(discard).toHaveFocus();
      // Escape cancels too.
      fireEvent.click(discard);
      fireEvent.keyDown(screen.getByRole("region", { name: "Discard your study as a guest" }), { key: "Escape" });
      expect(screen.queryByRole("region", { name: "Discard your study as a guest" })).toBeNull();
      expect(discard).toHaveFocus();
      fireEvent.click(discard);
      fireEvent.keyDown(screen.getByRole("region", { name: "Discard your study as a guest" }), { key: "Enter" });
      expect(screen.getByRole("region", { name: "Discard your study as a guest" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(useCases.discardGuest).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Discard" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
      expect(await screen.findByRole("heading", { name: "Set up your Solid Pod" })).toBeInTheDocument();
      expect(useCases.discardGuest).toHaveBeenCalledOnce();
    });

    it("says why a guest's study could not be discarded", async () => {
      const useCases = makeUseCases({
        restoreSession: vi.fn(async () => ({ session: guest, origin: "restored" as const })),
        discardGuest: vi.fn(async () => Promise.reject(new Error("storage refused"))),
      });
      renderApp(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
      fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
      expect((await screen.findByText("storage refused")).closest("[role=alert]")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete it" })).toHaveAttribute("aria-disabled", "false");
      // Trying again clears the error first, so the same failure is said again.
      vi.mocked(useCases.discardGuest).mockReturnValueOnce(new Promise(() => {}));
      const deleteIt = screen.getByRole("button", { name: "Delete it" });
      deleteIt.focus();
      fireEvent.click(deleteIt);
      await waitFor(() => expect(screen.queryByText("storage refused")).toBeNull());
      // While it deletes, the buttons keep the focus and do nothing.
      await waitFor(() => expect(deleteIt).toHaveAttribute("aria-disabled", "true"));
      expect(deleteIt).toHaveFocus();
      fireEvent.click(deleteIt);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.keyDown(screen.getByRole("region", { name: "Discard your study as a guest" }), { key: "Escape" });
      expect(useCases.discardGuest).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("region", { name: "Discard your study as a guest" })).toBeInTheDocument();
    });

    it("offers a user who logged in the study a guest left in this browser", async () => {
      const useCases = makeUseCases({
        restoreSession: vi.fn(async () => restored),
        findGuestStudy: vi.fn(async () => ({
          instances: [{ instance: { url: "https://guest.solid-memo.invalid/solid-memo/", name: "My study" }, deckCount: 2 }],
        })),
      });
      renderApp(useCases);
      expect(await screen.findByText(/My study has 2 decks/)).toBeInTheDocument();
    });
  });
});
