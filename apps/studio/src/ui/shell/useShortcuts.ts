// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext } from "preact";
import { useCallback, useContext, useEffect, useRef } from "preact/hooks";
import {
  isCharacterKey,
  isTyping,
  keyOf,
  pressKey,
  shortcutOf,
  SHORTCUTS,
  type Chord,
  type ShortcutId,
} from "./shortcuts";

/** A screen's own keys, given the key as the keymap names it (keyOf): the screen takes one with `preventDefault`. */
export type ScreenKeyHandler = (event: KeyboardEvent, key: string) => void;

type Register = (handler: { current: ScreenKeyHandler }) => () => void;

/** How a screen hands its keys to the Studio's one listener (useShortcuts); outside the Studio, nothing takes them. */
export const ScreenKeys = createContext<Register>(() => () => undefined);

/** The keys of the screen shown, before the Studio's own; while the user types in a field, it keeps them. */
export function useScreenKeys(handler: ScreenKeyHandler): void {
  const register = useContext(ScreenKeys);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => register(ref), [register]);
}

const STUDIO_KEYS = SHORTCUTS.filter((shortcut) => shortcut.scope === "studio");
const TYPING_KEYS = STUDIO_KEYS.filter((shortcut) => shortcut.whileTyping);

/**
 * The Studio's one listener of keys, on the document. A key goes first
 * to what has the focus, which takes it with `preventDefault` (a menu, a
 * field's own keys): the listener leaves it. While a dialog is open, a
 * key is the dialog's, wherever the focus is (on the page's body, once a
 * press on its text took it from its buttons): but Ctrl+K (Cmd+K), which
 * closes it and opens the palette, rather than reach the browser; while
 * a menu is open, every key is the menu's. With `characterKeys` off (the
 * user's choice, in the key help), a character alone ("g", "?", "j") is
 * no shortcut, the screen's nor the Studio's, so that speech input or a
 * stray key does nothing (WCAG 2.1.4). Then the screen's own keys
 * (useScreenKeys) have it, the last screen to register first, and then
 * the Studio's (SHORTCUTS), chords among them: `run` does one, and says whether it could (a section with
 * no instance open cannot be gone to), and only then is the key's own
 * action stopped. While the user types in a field, only the shortcuts
 * that work there do. A key held down does the Studio's once (`g` held
 * is not `g g`). Returns how screens register: give it to them in
 * ScreenKeys.
 */
export function useShortcuts(
  run: (shortcut: ShortcutId) => boolean,
  characterKeys = true,
): Register {
  const screens = useRef(new Set<{ current: ScreenKeyHandler }>());
  const chord = useRef<Chord | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const characters = useRef(characterKeys);
  characters.current = characterKeys;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const key = keyOf(event);
      // A key goes to an element: the one focused, else the page's body, under a dialog open too.
      const dialog =
        (event.target as Element).closest("dialog") ?? document.querySelector("dialog[open]");
      if (dialog !== null) {
        if (shortcutOf(key, "studio") !== "palette") return;
        event.preventDefault();
        // Once it has closed, and its owner stopped showing it.
        dialog.addEventListener("close", () => runRef.current("palette"), { once: true });
        dialog.close();
        return;
      }
      if (document.querySelector('[role="menu"]') !== null) return;
      if (!characters.current && isCharacterKey(key)) return;
      const typing = isTyping(event.target);
      if (!typing) {
        for (const screen of [...screens.current].reverse()) {
          screen.current(event, key);
          if (event.defaultPrevented) {
            chord.current = null;
            return;
          }
        }
      }
      if (event.repeat) return;
      const pressed = pressKey(
        typing ? null : chord.current,
        key,
        Date.now(),
        typing ? TYPING_KEYS : STUDIO_KEYS,
      );
      chord.current = pressed.chord;
      if (pressed.shortcut !== null && runRef.current(pressed.shortcut)) event.preventDefault();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return useCallback((handler) => {
    screens.current.add(handler);
    return () => screens.current.delete(handler);
  }, []);
}
