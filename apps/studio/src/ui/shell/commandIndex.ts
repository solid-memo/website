import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { folded } from "@solid-memo/domain/langText";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { cardName } from "@solid-memo/ui/DataText";
import type { I18n } from "@solid-memo/ui/i18n";
import { studioRouteToHash, type StudioRoute } from "../router";
import type { WorkItem } from "./prefs";
import { keysOf } from "./shortcuts";
import { draftNameOf } from "./titles";
import {
  sectionHome,
  SIDEBAR_SECTIONS,
  type ContextTab,
  type DeckTab,
  type DraftTab,
} from "./workspaceLayout";

/**
 * What a screen adds to the palette while it is shown
 * (useScreenCommands), or the shell does: its name, its keys if it has
 * some, and what it does.
 */
export interface ScreenCommand {
  id: string;
  label: string;
  keys?: string;
  run: () => void;
}

/** The palette's groups, each under its heading: the decks and drafts pinned, and the entries used last, first; then as buildCommands lists them. */
export type CommandGroup =
  | "pinned"
  | "recent"
  | "commands"
  | "tabs"
  | "sections"
  | "instances"
  | "decks"
  | "drafts"
  | "cards";

/**
 * An entry of the palette: where it goes (`route`, as a link does) or
 * what it does (`run`), its name, the keys that do the same if any, and
 * an id the device remembers it by once used (prefs.ts): one that goes
 * somewhere is known by its group and its route's hash, so the same
 * place is the same entry from any screen, and an instance is not its
 * Decks section, which goes to the same place.
 */
export type Command = {
  id: string;
  group: Exclude<CommandGroup, "pinned" | "recent">;
  label: string;
  keys?: string;
} & ({ route: StudioRoute } | { run: () => void });

/** What the palette lists, as the workspace has it read: the cache is asked, never the pod. */
export interface CommandSources {
  instances: readonly Instance[];
  /** The open instance; null on the instances. */
  instanceUrl: string | null;
  /** The context tabs of the deck or draft shown. */
  tabs: readonly ContextTab[];
  /** The open instance's decks and drafts. */
  decks: readonly Deck[];
  drafts: readonly ReleaseDraftSummary[];
  /** The cards of the deck shown, once read. */
  cards: { deckUrl: string; cards: readonly Card[] } | null;
  /** The commands of the screen shown, and the shell's. */
  commands: readonly ScreenCommand[];
}

/**
 * Every entry of the palette: the commands of the screen shown; the tabs
 * of its deck or draft, each with its number; the open instance's
 * sections, with their `g` chords, and all the instances; each instance,
 * at its decks; the open instance's decks, at their cards, and its drafts
 * (those that can be read), at their overview; and the cards of the deck
 * shown, each in the inspector.
 */
export function buildCommands(
  sources: CommandSources,
  i18n: Pick<I18n, "t" | "readerText">,
): Command[] {
  const { t, readerText } = i18n;
  const at = (group: Command["group"], route: StudioRoute) => ({
    id: `${group}:${studioRouteToHash(route)}`,
    group,
    route,
  });
  return [
    ...sources.commands.map(
      (command): Command => ({ ...command, id: `command:${command.id}`, group: "commands" }),
    ),
    ...sources.tabs.map(
      (tab, index): Command => ({
        ...at("tabs", tab.route),
        label: t(`studio.tabs.${tab.key as DeckTab | DraftTab}`),
        ...(index < 9 ? { keys: String(index + 1) } : {}),
      }),
    ),
    ...(sources.instanceUrl === null ? [] : SIDEBAR_SECTIONS).map(
      (section): Command => ({
        ...at("sections", sectionHome(section, sources.instanceUrl!)),
        label: t(`studio.shell.section.${section}`),
        // Name and catalog has no chord.
        ...(section === "instance" ? {} : { keys: keysOf(`go.${section}`) }),
      }),
    ),
    {
      ...at("sections", { screen: "instances" }),
      label: t("studio.shell.allInstances"),
      keys: keysOf("go.instances"),
    },
    ...sources.instances.map(
      (instance): Command => ({
        ...at("instances", { screen: "home", instanceUrl: instance.url }),
        label: instance.name,
      }),
    ),
    ...sources.decks.map(
      (deck): Command => ({
        ...at("decks", { screen: "cards", deckUrl: deck.url }),
        label: readerText(deck.title),
      }),
    ),
    ...sources.drafts
      .filter((draft) => draft.readable)
      .map(
        (draft): Command => ({
          ...at("drafts", { screen: "draft", draftUrl: draft.url }),
          label: draftNameOf(draft, i18n),
        }),
      ),
    ...(sources.cards?.cards ?? []).map(
      (card): Command => ({
        ...at("cards", { screen: "card", deckUrl: sources.cards!.deckUrl, cardUrl: card.url }),
        label: cardName(card, readerText),
      }),
    ),
  ];
}

/** The id of a deck's or a draft's entry (buildCommands): a deck at its cards, a draft at its overview. */
export function itemCommandId(item: WorkItem): string {
  return item.kind === "deck"
    ? `decks:${studioRouteToHash({ screen: "cards", deckUrl: item.url })}`
    : `drafts:${studioRouteToHash({ screen: "draft", draftUrl: item.url })}`;
}

/** The most entries the palette shows at once: the rest are a few more letters away. */
export const MAX_SHOWN = 50;

/** The palette's entries under one heading. */
export interface CommandSection {
  group: CommandGroup;
  commands: Command[];
}

/**
 * The entries the palette shows for what the user typed, under their
 * headings, MAX_SHOWN at most. With nothing typed: the decks and drafts
 * pinned (`pinned`, by their ids, in their order), the entries used last
 * (`recent`, the last first), each of those the palette still has, then
 * every other but the cards, in their order. Else those whose name holds the
 * letters typed in their order (matchScore), case and accents aside, the
 * best first, and their groups in the order of their best.
 */
export function rankCommands(
  commands: readonly Command[],
  query: string,
  recent: readonly string[],
  pinned: readonly string[] = [],
): CommandSection[] {
  const wanted = folded(query.trim());
  const shown: { group: CommandGroup; command: Command }[] = [];
  if (wanted === "") {
    const find = (ids: readonly string[]) =>
      ids.flatMap((id) => commands.find((command) => command.id === id) ?? []);
    const first = find(pinned);
    const used = find(recent).filter((command) => !first.includes(command));
    shown.push(...first.map((command) => ({ group: "pinned" as const, command })));
    shown.push(...used.map((command) => ({ group: "recent" as const, command })));
    shown.push(
      ...commands
        .filter(
          (command) =>
            command.group !== "cards" && !first.includes(command) && !used.includes(command),
        )
        .map((command) => ({ group: command.group, command })),
    );
  } else {
    const scored = commands.flatMap((command) => {
      const score = matchScore(wanted, folded(command.label));
      return score === null ? [] : [{ score, command }];
    });
    // Sorted as found where they score the same: the commands of the screen before the decks, say.
    shown.push(
      ...scored
        .sort((a, b) => b.score - a.score)
        .map(({ command }) => ({ group: command.group, command })),
    );
  }
  const sections = new Map<CommandGroup, Command[]>();
  for (const { group, command } of shown.slice(0, MAX_SHOWN)) {
    const section = sections.get(group) ?? [];
    section.push(command);
    sections.set(group, section);
  }
  return [...sections].map(([group, commands]) => ({ group, commands }));
}

/** What a letter scores matched, at the start of a word, and right after the letter before. */
const LETTER = 1;
const WORD_START = 4;
const CONSECUTIVE = 2;

/**
 * How well `text` matches `query` (both folded): null when its letters
 * do not all come in it in their order. Each letter matched scores, the
 * more at the start of a word ("dc" scores more in "Deck colors" than
 * in "Dice"), or right after the one before it; a longer text scores a
 * little less. Each letter is matched where it first comes, or at the
 * start of a later word when the rest still matches after it.
 */
export function matchScore(query: string, text: string): number | null {
  let score = -text.length / 100;
  let last = -2;
  for (let q = 0; q < query.length; q++) {
    let at = text.indexOf(query[q]!, last + 1);
    if (at === -1) return null;
    if (at !== last + 1 && !startsWord(text, at)) {
      let later = text.indexOf(query[q]!, at + 1);
      while (later !== -1 && !startsWord(text, later)) later = text.indexOf(query[q]!, later + 1);
      if (later !== -1 && holds(text, query.slice(q + 1), later + 1)) at = later;
    }
    score += LETTER + (startsWord(text, at) ? WORD_START : 0) + (at === last + 1 ? CONSECUTIVE : 0);
    last = at;
  }
  return score;
}

/** Whether a letter starts a word: the text's first, or one after a character no letter or digit. */
function startsWord(text: string, at: number): boolean {
  return at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1]!);
}

/** Whether the letters of `query` come in `text` in their order, from `from` on. */
function holds(text: string, query: string, from: number): boolean {
  let at = from - 1;
  for (const letter of query) {
    at = text.indexOf(letter, at + 1);
    if (at === -1) return false;
  }
  return true;
}
