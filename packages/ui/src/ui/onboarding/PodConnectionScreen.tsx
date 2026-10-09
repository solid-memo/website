import type { SolidAccount } from "@solid-memo/domain/account";
import { ErrorMessage } from "../ErrorMessage";
import { ExternalLink } from "../ExternalLink";
import { useI18n, type ErrorText } from "../i18n";
import { Loading } from "../Loading";

/**
 * Post-login onboarding step: shows Pod discovery in progress, then the
 * connected account (or why there is none) before entering the app. The
 * WebID is shown by the profile's name when it has one, linked to the
 * WebID itself.
 */
export function PodConnectionScreen({
  account,
  busy,
  error,
  onRetry,
  onContinue,
  onLogout,
}: {
  account: SolidAccount | undefined;
  busy: boolean;
  error: ErrorText | null;
  onRetry: () => void;
  onContinue: () => void;
  onLogout: () => void;
}) {
  const { t, tx } = useI18n();
  const discovering = (
    <section class="onboarding" aria-busy="true">
      <h2>{t("podConnection.discoveringHeading")}</h2>
      <Loading label={t("podConnection.discoveringLabel")} />
    </section>
  );

  if (busy) return discovering;

  if (error !== null) {
    return (
      <section class="onboarding">
        <h2>{t("podConnection.errorHeading")}</h2>
        <ErrorMessage error={error} />
        <div class="onboarding-actions">
          <button class="primary" onClick={onRetry}>
            {t("podConnection.tryAgain")}
          </button>
          <button onClick={onLogout}>{t("podConnection.logOut")}</button>
        </div>
      </section>
    );
  }

  if (account === undefined) return discovering;

  if (account.podUrl === undefined) {
    return (
      <section class="onboarding">
        <h2>{t("podConnection.noPodHeading")}</h2>
        <p class="warning">
          {tx("podConnection.noPodWarning", {
            name: <ExternalLink url={account.webId}>{account.name}</ExternalLink>,
          })}
        </p>
        <p class="hint">{t("podConnection.noPodHint")}</p>
        <div class="onboarding-actions">
          <button class="primary" onClick={onRetry}>
            {t("podConnection.tryAgain")}
          </button>
          <button onClick={onContinue}>{t("podConnection.continueAnyway")}</button>
          <button onClick={onLogout}>{t("podConnection.logOut")}</button>
        </div>
      </section>
    );
  }

  return (
    <section class="onboarding">
      <h2>{t("podConnection.connectedHeading")}</h2>
      <dl class="account">
        <dt>WebID</dt>
        <dd>
          <ExternalLink url={account.webId}>{account.name}</ExternalLink>
        </dd>
        <dt>Pod</dt>
        <dd>
          <ExternalLink url={account.podUrl} />
        </dd>
        {account.oidcIssuer !== undefined && (
          <>
            <dt>{t("podConnection.identityProvider")}</dt>
            <dd>
              <ExternalLink url={account.oidcIssuer} />
            </dd>
          </>
        )}
      </dl>
      <div class="onboarding-actions">
        <button class="primary" onClick={onContinue}>
          {t("podConnection.continue")}
        </button>
      </div>
    </section>
  );
}
