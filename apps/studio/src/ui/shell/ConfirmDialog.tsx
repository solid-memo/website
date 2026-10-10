import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useI18n } from "@solid-memo/ui/i18n";
import { Dialog } from "./Dialog";

/** A choice a ConfirmDialog offers: its button, and what it does. The first takes the focus. */
export interface ConfirmChoice {
  label: string;
  onChoose: () => void;
  /** The choice that loses something, marked so. */
  danger?: true;
}

/**
 * A question put to the user in a modal dialog (Dialog), named by its
 * heading, with a button for each answer (`choices`): one chosen, the
 * dialog's owner stops showing it, and the focus goes back where it
 * was. Escape, or the dialog's Close, leaves it unanswered (`onCancel`).
 */
export function ConfirmDialog({
  heading,
  choices,
  onCancel,
  children,
}: {
  heading: string;
  choices: readonly ConfirmChoice[];
  onCancel: () => void;
  /** What the question is about. */
  children: ComponentChildren;
}) {
  return (
    <Dialog heading={heading} onClose={onCancel}>
      {children}
      <div class="edit-actions">
        {choices.map((choice, at) => (
          <button
            key={choice.label}
            type="button"
            class={choice.danger ? "danger" : at === 0 ? "primary" : undefined}
            autoFocus={at === 0}
            onClick={choice.onChoose}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** Something to be done once the user confirms it: what the dialog asks, and its button. */
export interface Question {
  heading: string;
  /** The question itself, which says what is lost. */
  text: string;
  /** The button that does it. */
  action: string;
  onConfirm: () => void;
}

/**
 * Asks before something is done that loses something, in a
 * ConfirmDialog, as `window.confirm` would but in the Studio's own
 * dialog: `ask` puts the question (`dialog`, to be shown where the
 * owner has it); its action, which has the focus, does it, and Cancel,
 * Escape or Close does nothing. One question at a time.
 */
export function useConfirm(): { ask: (question: Question) => void; dialog: ComponentChildren } {
  const { t } = useI18n();
  const [asked, setAsked] = useState<Question | null>(null);
  const dialog = asked !== null && (
    <ConfirmDialog
      heading={asked.heading}
      choices={[
        {
          label: asked.action,
          danger: true,
          onChoose: () => {
            setAsked(null);
            asked.onConfirm();
          },
        },
        { label: t("studio.confirm.cancel"), onChoose: () => setAsked(null) },
      ]}
      onCancel={() => setAsked(null)}
    >
      <p>{asked.text}</p>
    </ConfirmDialog>
  );
  return { ask: setAsked, dialog };
}
