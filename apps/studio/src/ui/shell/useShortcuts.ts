import { createContext } from "preact";
import { useCallback, useContext, useEffect, useRef } from "preact/hooks";
import { isTyping, keyOf, pressKey, SHORTCUTS, type Chord, type ShortcutId } from "./shortcuts";

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
 * field's own keys): the listener leaves it. A key in a dialog is the
 * dialog's. Then the screen's own keys (useScreenKeys) have it, the last
 * screen to register first, and then the Studio's (SHORTCUTS), chords
 * among them: `run` does one, and says whether it could (a section with
 * no instance open cannot be gone to), and only then is the key's own
 * action stopped. While the user types in a field, only the shortcuts
 * that work there do. A key held down does the Studio's once (`g` held
 * is not `g g`). Returns how screens register: give it to them in
 * ScreenKeys.
 */
export function useShortcuts(run: (shortcut: ShortcutId) => boolean): Register {
  const screens = useRef(new Set<{ current: ScreenKeyHandler }>());
  const chord = useRef<Chord | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof Element && event.target.closest("dialog") !== null)) return;
      const key = keyOf(event);
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
      const pressed = pressKey(typing ? null : chord.current, key, Date.now(), typing ? TYPING_KEYS : STUDIO_KEYS);
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
