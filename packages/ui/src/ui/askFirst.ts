// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useContext } from "preact/hooks";

/** Something to be done once the user confirms it: what is asked (`heading`, then `text`, which says what is lost), and the button that does it. */
export interface LossQuestion {
  heading: string;
  text: string;
  action: string;
  onConfirm: () => void;
}

/** Asks with the browser's own confirm, which shows the question's text alone. */
function browserConfirm(question: LossQuestion): void {
  if (window.confirm(question.text)) question.onConfirm();
}

/**
 * How a component shared by Solid Memo and the Studio asks before it
 * loses something (DistractorFields, InstancePicker): with the browser's
 * own confirm, unless the app asks in a dialog of its own, as the Studio
 * does (its useConfirm, docs/studio.md).
 */
export const AskFirst = createContext<(question: LossQuestion) => void>(browserConfirm);

/** Asks before something is lost, as the app around asks (AskFirst). */
export function useAskFirst(): (question: LossQuestion) => void {
  return useContext(AskFirst);
}
