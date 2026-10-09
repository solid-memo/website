import type { AppError } from "@solid-memo/domain/appError";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { validateWebId } from "@solid-memo/domain/webId";
import { ErrorMessage } from "../ErrorMessage";
import { useI18n } from "../i18n";

export function WebIdForm({
  busy,
  autoFocus,
  onSubmit,
  onBack,
}: {
  busy: boolean;
  /** Move focus to the field on mount (the user just navigated here). */
  autoFocus: boolean;
  /** Receives a validated, normalized WebID. */
  onSubmit: (webId: string) => void;
  onBack: () => void;
}) {
  const { t, errorText } = useI18n();
  const [webId, setWebId] = useState("");
  const [invalid, setInvalid] = useState<AppError | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (autoFocus) input.current!.focus();
  }, []);

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    const validation = validateWebId(webId);
    if (!validation.ok) {
      setInvalid(validation.error);
      // Back to the field, which now says what is wrong (a click left it).
      input.current!.focus();
      return;
    }
    onSubmit(validation.webId);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label for="webid">WebID</label>
      <input
        ref={input}
        id="webid"
        name="webid"
        type="url"
        inputMode="url"
        autocomplete="url"
        autocapitalize="off"
        spellcheck={false}
        placeholder="https://you.example/profile/card#me"
        value={webId}
        onInput={(e) => {
          setWebId(e.currentTarget.value);
          setInvalid(null);
        }}
        aria-invalid={invalid !== null}
        aria-describedby={invalid === null ? "webid-help" : "webid-error webid-help"}
        disabled={busy}
      />
      <ErrorMessage id="webid-error" error={errorText(invalid)} />
      <p id="webid-help" class="hint">
        {t("webIdForm.help")}
      </p>
      <div class="onboarding-actions">
        {/* Only aria-disabled while it redirects, so it keeps the focus and its text is heard. */}
        <button type="submit" aria-disabled={busy}>
          {busy ? t("webIdForm.redirecting") : t("webIdForm.logIn")}
        </button>
        <button type="button" onClick={onBack} disabled={busy}>
          {t("webIdForm.back")}
        </button>
      </div>
      <p class="visually-hidden" role="status">
        {busy ? t("webIdForm.redirecting") : ""}
      </p>
    </form>
  );
}
