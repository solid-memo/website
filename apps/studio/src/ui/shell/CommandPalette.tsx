// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useId, useState } from "preact/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { composing } from "@solid-memo/ui/composing";
import { useI18n } from "@solid-memo/ui/i18n";
import { instanceOfRoute, type StudioRoute } from "../router";
import {
  buildCommands,
  itemCommandId,
  rankCommands,
  type Command,
  type ScreenCommand,
} from "./commandIndex";
import { Dialog } from "./Dialog";
import { Keys } from "./KeyHelp";
import { recentCommands, rememberCommand, type WorkItem } from "./prefs";
import { keyOf, shortcutOf } from "./shortcuts";
import { deckOf, type ContextTab } from "./workspaceLayout";
import { queryKeys } from "../queryKeys";

/**
 * Quick open and the commands, in a dialog (Ctrl+K): a field to type
 * in, and under it the entries that match (commandIndex.ts), by group,
 * each with its keys. It lists what the workspace has read, from the
 * cache, as it was when the palette opened: the instances, the open
 * instance's decks and drafts, the cards of the deck shown, the
 * sections, the tabs and the commands (`commands`). With nothing typed,
 * the decks and drafts pinned (`pinned`) come first.
 *
 * The field is a combobox over the list (the focus stays in it, the
 * entry picked its `aria-activedescendant`): Down and Up pick the next
 * entry or the one before, round from either end, Enter (or a click)
 * chooses it (`onChoose`, which the device remembers, prefs.ts), and
 * Escape closes the palette, as Ctrl+K (Cmd+K) does again, from anywhere
 * in it, rather than reach the browser.
 */
export function CommandPalette({
  route,
  instances,
  tabs,
  commands,
  pinned,
  onChoose,
  onClose,
}: {
  /** The route shown; null while it is worked out. */
  route: StudioRoute | null;
  instances: readonly Instance[];
  tabs: readonly ContextTab[];
  commands: readonly ScreenCommand[];
  /** The open instance's decks and drafts pinned, in their order. */
  pinned: readonly WorkItem[];
  /** An entry was chosen: close the palette, then go where it goes or do it. */
  onChoose: (command: Command) => void;
  onClose: () => void;
}) {
  const { t, readerText, cardReader } = useI18n();
  const queryClient = useQueryClient();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(0);
  const [all] = useState(() => {
    const instanceUrl = route === null ? null : instanceOfRoute(route);
    const decks =
      instanceUrl === null ? undefined : queryClient.getQueryData<Deck[]>(["decks", instanceUrl]);
    const deck = route === null ? undefined : decks?.find((each) => each.url === deckOf(route));
    const cards =
      deck === undefined
        ? undefined
        : queryClient.getQueryData<Card[]>(["cards", deck.cardsDocumentUrl]);
    const drafts =
      instanceUrl === null
        ? undefined
        : queryClient.getQueryData<ReleaseDraftSummary[]>(queryKeys.releaseDrafts(instanceUrl));
    return buildCommands(
      {
        instances,
        instanceUrl,
        tabs,
        decks: decks ?? [],
        drafts: drafts ?? [],
        cards: cards === undefined ? null : { deckUrl: deck!.url, cards },
        commands,
      },
      { t, readerText, cardReader },
    );
  });
  const [recent] = useState(() => recentCommands());
  const sections = rankCommands(all, query, recent, pinned.map(itemCommandId));
  const shown = sections.flatMap((section) => section.commands);
  const optionId = (index: number) => `${listId}-${index}`;

  // The entry picked stays in sight as Down and Up move through a list longer than the dialog.
  useEffect(() => {
    document.getElementById(optionId(picked))?.scrollIntoView({ block: "nearest" });
  }, [picked]);

  function choose(command: Command) {
    rememberCommand(command.id);
    onChoose(command);
  }

  function handleKeyDown(event: KeyboardEvent) {
    // A key that composes a letter (Korean, say) is the input method's: its Enter ends the letter.
    if (composing(event)) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (shown.length > 0)
          setPicked((picked + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
        return;
      case "Enter":
        event.preventDefault();
        if (shown.length > 0) choose(shown[picked]!);
        return;
      case "Escape":
        event.preventDefault();
        (event.currentTarget as Element).closest("dialog")!.close();
    }
  }

  let index = 0;
  return (
    <Dialog
      heading={t("studio.palette.heading")}
      onClose={onClose}
      onKeyDown={(event) => {
        if (shortcutOf(keyOf(event), "studio") !== "palette") return;
        event.preventDefault();
        event.currentTarget.close();
      }}
    >
      <input
        type="text"
        role="combobox"
        class="studio-palette-input"
        aria-label={t("studio.palette.label")}
        placeholder={t("studio.palette.button")}
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? optionId(picked) : undefined}
        autoComplete="off"
        spellcheck={false}
        autoFocus
        value={query}
        onInput={(event) => {
          setQuery(event.currentTarget.value);
          setPicked(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <div
        id={listId}
        role="listbox"
        class="studio-palette-list"
        aria-label={t("studio.palette.heading")}
      >
        {sections.map((section) => (
          <ul key={section.group} role="group" aria-labelledby={`${listId}-${section.group}`}>
            <li role="presentation" id={`${listId}-${section.group}`} class="studio-palette-group">
              {t(`studio.palette.group.${section.group}`)}
            </li>
            {section.commands.map((command) => {
              const at = index++;
              return (
                <li
                  key={at}
                  id={optionId(at)}
                  role="option"
                  aria-selected={at === picked}
                  onClick={() => choose(command)}
                  onMouseMove={() => setPicked(at)}
                >
                  <span>{command.label}</span>
                  {command.keys !== undefined && (
                    <span class="studio-palette-keys" aria-hidden="true">
                      <Keys keys={command.keys} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      {/* Mounted throughout, so it is heard when nothing matches. */}
      <p class="hint" role="status">
        {shown.length === 0 ? t("studio.palette.none") : ""}
      </p>
    </Dialog>
  );
}
