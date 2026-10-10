import type { ComponentChildren } from "preact";
import type { ScreenCommand } from "../ui/shell/commandIndex";
import { ScreenCommands } from "../ui/shell/useScreenCommands";

const registered = new Set<{ current: readonly ScreenCommand[] }>();

function register(commands: { current: readonly ScreenCommand[] }) {
  registered.add(commands);
  return () => registered.delete(commands);
}

/** Around a screen tested alone, as the shell is: the commands it adds to the palette are screenCommands'. */
export function WithCommands({ children }: { children: ComponentChildren }) {
  return <ScreenCommands.Provider value={register}>{children}</ScreenCommands.Provider>;
}

/** The commands the screens shown in WithCommands add to the palette now, by their ids. */
export function screenCommands(): Record<string, ScreenCommand> {
  return Object.fromEntries([...registered].flatMap((screen) => screen.current).map((command) => [command.id, command]));
}
