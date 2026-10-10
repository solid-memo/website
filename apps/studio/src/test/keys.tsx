import type { ComponentChildren } from "preact";
import { ScreenKeys, useShortcuts } from "../ui/shell/useShortcuts";

/** The Studio's listener of keys, as its shell has it, around a screen tested alone: the screen's own keys reach it, and the Studio's do nothing. */
export function WithKeys({ children }: { children: ComponentChildren }) {
  return <ScreenKeys.Provider value={useShortcuts(() => false)}>{children}</ScreenKeys.Provider>;
}
