import type { ComponentChildren } from "preact";
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
