import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { Locale } from "@solid-memo/domain/locale";
import { resolveTheme, type Theme, type ThemeChoice } from "@solid-memo/domain/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { POD_PROVIDERS } from "@solid-memo/domain/podProvider";
import type { Session } from "@solid-memo/domain/session";
import illustrationUrl from "../assets/illustration.svg";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { Footer } from "./Footer";
import { GuestStudyOffer } from "./GuestStudyOffer";
import { I18nProvider, useI18n } from "./i18n";
import { LanguageSelector } from "./LanguageSelector";
import { Loading } from "./Loading";
import { OnboardingFlow } from "./onboarding/OnboardingFlow";
import { PodConnectionScreen } from "./onboarding/PodConnectionScreen";
import { usePanelFocus } from "./panelFocus";
import { applyTheme, browserTheme, DARK_QUERY, instanceThemeKey, ThemeProvider } from "./theme";
import { ThemeToggle } from "./ThemeToggle";
import { useDocumentTitle } from "./documentTitle";
import { MAIN_ID, SkipLink } from "./SkipLink";
import { Workspace } from "./Workspace";

/**
 * The app in whichever state it is in, between a link past the header
 * to the main content and the site-wide footer, in the language the user chose
 * (else their browser's, else English) and the theme they chose (else
 * their browser's). `commitSha` is the build's, shown in the footer.
 */
export function App({ useCases, commitSha }: { useCases: UseCases; commitSha: string | null }) {
  const [locale, setLocale] = useState<Locale>(() => useCases.language(navigator.languages));

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function chooseLocale(chosen: Locale) {
    useCases.chooseLanguage(chosen);
    setLocale(chosen);
  }

  const queryClient = useQueryClient();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => useCases.themeChoice());
  const [preferredTheme, setPreferredTheme] = useState<Theme>(browserTheme);
  const theme = resolveTheme(themeChoice, preferredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // The browser's theme as it changes (the OS going dark at dusk), shown while the choice is "system".
  useEffect(() => {
    const query = matchMedia(DARK_QUERY);
    const follow = () => setPreferredTheme(query.matches ? "dark" : "light");
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  // The open instance, whose preferences keep the choice once it has them.
  const themeInstance = useRef<string | null>(null);
  const themeChoices = useRef(0);

  function chooseTheme(chosen: ThemeChoice) {
    setThemeChoice(chosen);
    const instanceUrl = themeInstance.current;
    const count = ++themeChoices.current;
    void useCases
      .chooseTheme(chosen, instanceUrl)
      .catch(() => undefined)
      .finally(() => {
        // Read back what the pod holds (which undoes a failed write), unless another choice is on its way.
        if (instanceUrl === null || count !== themeChoices.current) return;
        void queryClient.invalidateQueries({ queryKey: instanceThemeKey(instanceUrl) });
        void queryClient.invalidateQueries({ queryKey: ["preferences", instanceUrl] });
      });
  }

  return (
    <I18nProvider locale={locale} onChoose={chooseLocale}>
      <ThemeProvider
        choice={themeChoice}
        preferred={preferredTheme}
        onChoose={chooseTheme}
        onFollowInstance={(instanceUrl) => {
          themeInstance.current = instanceUrl;
        }}
        onAdopt={setThemeChoice}
      >
        <SkipLink />
        <AppContent useCases={useCases} />
        <Footer commitSha={commitSha} />
      </ThemeProvider>
    </I18nProvider>
  );
}

/** The login screen's error once the session expired: not a failure to report, but why the user is back. */
const SESSION_EXPIRED = Symbol("session expired");

function AppContent({ useCases }: { useCases: UseCases }) {
  const queryClient = useQueryClient();
  const { t, tx, errorText } = useI18n();
  const [checkingSession, setCheckingSession] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<unknown>(null);
  // Said in whatever language the user reads by the time it shows, not as an error's message.
  const authText = authError === SESSION_EXPIRED ? t("app.sessionExpired") : errorText(authError);
  // A guest on their way to logging in, to keep their study; and one about to discard it.
  const [guestLoggingIn, setGuestLoggingIn] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const established = await useCases.restoreSession();
        if (established !== null) {
          setSession(established.session);
          setConnecting(established.origin === "login");
        }
      } catch (e) {
        setAuthError(e);
      } finally {
        setCheckingSession(false);
      }
    })();
  }, [useCases]);

  useEffect(() => {
    return useCases.onSessionExpired(() => {
      setSession(null);
      setConnecting(false);
      setReturning(true);
      setAuthError(SESSION_EXPIRED);
      queryClient.clear();
    });
  }, [useCases, queryClient]);

  const accountQuery = useQuery({
    queryKey: ["account", session?.webId],
    queryFn: () => useCases.discoverAccount(session!),
    enabled: session !== null && connecting,
    retry: false,
  });

  async function startLogin(login: () => Promise<void>) {
    setAuthError(null);
    setBusy(true);
    try {
      await login();
    } catch (e) {
      setAuthError(e);
      setBusy(false);
    }
  }

  async function handleTryAsGuest() {
    setAuthError(null);
    setBusy(true);
    try {
      setSession(await useCases.startGuest(t("guest.instanceName")));
    } catch (e) {
      setAuthError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscardGuest() {
    setAuthError(null);
    setBusy(true);
    try {
      await useCases.discardGuest();
      setSession(null);
      setConfirmingDiscard(false);
      setAuthError(null);
      queryClient.clear();
    } catch (e) {
      setAuthError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await useCases.logout();
    setSession(null);
    setConnecting(false);
    setReturning(true);
    setAuthError(null);
    queryClient.clear();
  }

  // Signed out, or a guest logging in to keep their study: the guest's study stays where it is meanwhile.
  const signedOut = !session || (session.guest === true && guestLoggingIn);
  // The workspace titles its own screens.
  useDocumentTitle(
    checkingSession
      ? []
      : signedOut
        ? [t("app.landingTitle")]
        : connecting
          ? [t("app.connectingTitle")]
          : null,
  );

  if (checkingSession) {
    return (
      <>
        <SiteHeader />
        <main id={MAIN_ID} tabIndex={-1}>
          <Loading label={t("app.restoringSession")} />
        </main>
      </>
    );
  }

  if (signedOut) {
    const guest = session?.guest === true;
    return (
      <>
        <SiteHeader />
        <main id={MAIN_ID} tabIndex={-1} class="landing">
          <Hero />
          <p class="tagline">{guest ? t("app.loginToKeep") : t("app.tagline")}</p>
          {/* First and focused: after the session expired the whole screen
              changed under the user, and this says why. */}
          <ErrorMessage error={authText} focus />
          <OnboardingFlow
            providers={POD_PROVIDERS}
            busy={busy}
            returning={returning || guest}
            onLogin={(webId) =>
              void startLogin(() => useCases.loginWithWebId(webId))
            }
            onLoginWithProvider={(provider) =>
              void startLogin(() =>
                useCases.loginWithProvider(provider.oidcIssuer),
              )
            }
            onTryAsGuest={guest ? undefined : () => void handleTryAsGuest()}
          />
          {guest && (
            <div class="onboarding-actions">
              <button onClick={() => setGuestLoggingIn(false)} disabled={busy}>
                {t("app.backToStudy")}
              </button>
            </div>
          )}
        </main>
      </>
    );
  }

  if (connecting) {
    return (
      <>
        <SiteHeader />
        <main id={MAIN_ID} tabIndex={-1} class="landing">
          <Hero />
          <PodConnectionScreen
            account={accountQuery.data}
            busy={accountQuery.isFetching}
            error={errorText(accountQuery.error)}
            onRetry={() => void accountQuery.refetch()}
            onContinue={() => setConnecting(false)}
            onLogout={handleLogout}
          />
        </main>
      </>
    );
  }

  const masthead = (
    <div class="masthead">
      <div class="masthead-title">
        {/* One link home: the logo beside the name is part of it, not a second stop. */}
        <h1>
          <a class="brand" href="#/">
            <img class="logo" src={illustrationUrl} alt="" width={60} height={40} />
            <span class="wordmark">Solid Memo</span>
          </a>
        </h1>
        {session.guest === true ? (
          <p class="session-line">{t("app.guestLine")}</p>
        ) : (
          <p class="session-line">
            {tx("app.loggedInAs", {
              name: (
                <ExternalLink url={session.webId}>
                  {accountQuery.data?.name}
                </ExternalLink>
              ),
            })}
          </p>
        )}
      </div>
      {session.guest === true ? (
        <div class="masthead-actions">
          <button onClick={() => setGuestLoggingIn(true)}>{t("app.keepStudy")}</button>
          <button onClick={() => setConfirmingDiscard(true)}>{t("app.discardGuest")}</button>
        </div>
      ) : (
        <button onClick={handleLogout}>{t("app.logOut")}</button>
      )}
    </div>
  );

  return (
    <Workspace
      useCases={useCases}
      session={session}
      banner={
        <>
          <TopBar />
          {masthead}
        </>
      }
    >
      {confirmingDiscard && (
        <DiscardGuestConfirm
          busy={busy}
          onDiscard={() => void handleDiscardGuest()}
          onCancel={() => setConfirmingDiscard(false)}
        >
          <ErrorMessage error={authText} />
        </DiscardGuestConfirm>
      )}
      {session.guest !== true && <GuestStudyOffer useCases={useCases} session={session} />}
    </Workspace>
  );
}

/** The theme and language choices above every screen. */
function TopBar() {
  return (
    <div class="top-bar">
      <ThemeToggle />
      <LanguageSelector />
    </div>
  );
}

/** The site header of the screens before the workspace: only the top bar. */
function SiteHeader() {
  return (
    <header class="site-header">
      <TopBar />
    </header>
  );
}

/** The landing picture, decorative, over the product name as the page's heading. */
function Hero() {
  return (
    <>
      <img class="hero" src={illustrationUrl} alt="" width={640} height={427} />
      <h1>Solid Memo</h1>
    </>
  );
}

/**
 * The question before a guest's study is deleted, below the masthead
 * button that asks it. It takes the focus, so the question is read out;
 * Cancel (or Escape) gives the focus back to that button. While it
 * deletes, the buttons keep the focus (aria-disabled).
 */
function DiscardGuestConfirm({
  busy,
  onDiscard,
  onCancel,
  children,
}: {
  busy: boolean;
  onDiscard: () => void;
  onCancel: () => void;
  /** The deletion's error, if any. */
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>();
  const questionId = useId();
  return (
    <div
      ref={ref}
      class="warning"
      role="region"
      aria-label={t("app.discardRegion")}
      aria-describedby={questionId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) onCancel();
      }}
    >
      <p id={questionId}>{t("app.discardConfirm")}</p>
      <div class="edit-actions">
        <button
          class="danger"
          onClick={() => {
            if (!busy) onDiscard();
          }}
          aria-disabled={busy}
        >
          {t("app.discardYes")}
        </button>
        <button
          onClick={() => {
            if (!busy) onCancel();
          }}
          aria-disabled={busy}
        >
          {t("app.cancel")}
        </button>
      </div>
      {children}
    </div>
  );
}
