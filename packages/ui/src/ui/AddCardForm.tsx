import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CardContent } from "@solid-memo/domain/deck";
import {
  CardContentFields,
  CardFieldsErrorMessage,
  checkDraft,
  newDraft,
  nextDraft,
  rememberCardLanguages,
  withDefaults,
  type CardFieldsError,
  type CardLanguageHints,
} from "./CardContentFields";
import { useI18n } from "./i18n";

/**
 * Card entry form: text and an optional picture for each side. The draft
 * stays until the card is added, so a failed add loses nothing; once it
 * is, the form clears, a status line says so and the front's field takes
 * the focus, ready for the next card. While it adds, the button keeps
 * the focus (aria-disabled).
 *
 * Each text is in the language the user states. New text starts in the
 * language the deck's cards usually have (`languages`), else in none
 * until the user chooses one; once a card is added, the next one's texts
 * start in the languages it had, so after the first card of a deck there
 * is nothing to choose.
 */
export function AddCardForm({
  busy,
  languages,
  onAdd,
}: {
  busy: boolean;
  languages: CardLanguageHints;
  /** Add the card; `onAdded` once it is. */
  onAdd: (content: CardContent, onAdded: () => void) => void;
}) {
  const { t } = useI18n();
  const { defaults } = languages;
  const [draft, setDraft] = useState(() => newDraft(defaults));
  const [invalid, setInvalid] = useState<CardFieldsError | null>(null);
  const [added, setAdded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  /** The card was added: the front's field takes the focus once it is no longer disabled. */
  const focusFront = useRef(false);

  // The deck's cards may be read after the form opens: their languages then
  // fill the texts not yet touched, in place of the defaults they had —
  // but not of the languages a card added kept (sticky), as the user chose them.
  const previousDefaults = useRef(defaults);
  const sticky = useRef(false);
  useLayoutEffect(() => {
    const previous = sticky.current ? {} : previousDefaults.current;
    previousDefaults.current = defaults;
    setDraft((current) => withDefaults(current, defaults, previous));
  }, [defaults.front, defaults.back, defaults.own]);

  useLayoutEffect(() => {
    if (!focusFront.current || busy) return;
    focusFront.current = false;
    formRef.current!.querySelector<HTMLInputElement>("#card-front")!.focus();
  });

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    setAdded(false);
    const check = checkDraft(draft);
    if (!check.ok) {
      setInvalid(check.invalid);
      return;
    }
    setInvalid(null);
    onAdd(check.content, () => {
      rememberCardLanguages(check.content, draft);
      setDraft(nextDraft(draft, defaults));
      sticky.current = true;
      setAdded(true);
      focusFront.current = true;
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <CardContentFields
        draft={draft}
        busy={busy}
        invalid={invalid}
        suggestions={languages.suggestions}
        onChange={(next) => {
          // A language asked for is answered as the user changes the card.
          if (invalid?.entry !== undefined) setInvalid(null);
          setDraft(next);
        }}
      />
      <CardFieldsErrorMessage invalid={invalid} />
      <button type="submit" aria-disabled={busy}>
        {t("addCardForm.submitButton")}
      </button>
      {/* Mounted throughout, so each add is heard: the text clears while
          the next one is under way and comes back once it is done. */}
      <p class="hint" role="status">
        {added ? t("addCardForm.added") : ""}
      </p>
    </form>
  );
}
