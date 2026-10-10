import { createContext } from "preact";
import { useCallback, useContext, useEffect, useRef } from "preact/hooks";
import type { ScreenCommand } from "./commandIndex";

type Register = (commands: { current: readonly ScreenCommand[] }) => () => void;

/** How a screen hands its commands to the palette (useCommandRegistry); outside the Studio, no palette lists them. */
export const ScreenCommands = createContext<Register>(() => () => undefined);

/**
 * The commands the screen shown adds to the palette, as they are now:
 * those it can do at the moment only (no "Check again" while it checks).
 */
export function useScreenCommands(commands: readonly ScreenCommand[]): void {
  const register = useContext(ScreenCommands);
  const ref = useRef(commands);
  ref.current = commands;
  useEffect(() => register(ref), [register]);
}

/**
 * The shell's side of useScreenCommands: how screens register (give it
 * to them in ScreenCommands), and the commands of those shown, as they
 * are when asked.
 */
export function useCommandRegistry(): { register: Register; commands: () => ScreenCommand[] } {
  const screens = useRef(new Set<{ current: readonly ScreenCommand[] }>());
  const register = useCallback<Register>((commands) => {
    screens.current.add(commands);
    return () => screens.current.delete(commands);
  }, []);
  return { register, commands: () => [...screens.current].flatMap((screen) => screen.current) };
}
