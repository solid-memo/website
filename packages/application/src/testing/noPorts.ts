// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  DigestRepository,
  LanguagePreference,
  CustomPalettePreference,
  PalettePreference,
  PaletteRepository,
  TextSizePreference,
  ThemePreference,
  DeckArchive,
  FileExchange,
} from "../ports";
import { DEFAULT_PALETTE } from "@solid-memo/domain/palette";
import { DEFAULT_TEXT_SIZE } from "@solid-memo/domain/textSize";

const none = async (): Promise<never[]> => [];

const NO_LANGUAGE_PREFERENCE: LanguagePreference = { chosen: () => null, choose: () => undefined };

const NO_THEME_PREFERENCE: ThemePreference = { chosen: () => "system", choose: () => undefined };

const NO_PALETTE_PREFERENCE: PalettePreference = {
  chosen: () => DEFAULT_PALETTE,
  choose: () => undefined,
};

const NO_CUSTOM_PALETTE_PREFERENCE: CustomPalettePreference = {
  chosen: () => null,
  choose: () => undefined,
};

const NO_PALETTES: PaletteRepository = {
  listPalettes: none,
  savePalette: async () => {
    throw new Error("This app keeps no palettes.");
  },
};

const NO_TEXT_SIZE_PREFERENCE: TextSizePreference = {
  chosen: () => DEFAULT_TEXT_SIZE,
  choose: () => undefined,
};

const NO_DECK_ARCHIVE: DeckArchive = {
  exportDeck: async () => {
    throw new Error("This app keeps no deck archive.");
  },
  readDeckFile: async () => {
    throw new Error("This app keeps no deck archive.");
  },
};

const NO_FILE_EXCHANGE: FileExchange = { save: () => undefined, open: async () => null };

const NO_DIGESTS: DigestRepository = {
  readDigest: async () => null,
  updateDigest: async () => undefined,
};

/**
 * A port that keeps nothing and does nothing, or refuses, for each port
 * a test has no use for: a test spreads NO_PORTS, then gives the ports
 * it is about. The app and the trial wire each port, or a "none" of
 * their own, so a missing one is a type error (packages/composition/).
 */
export const NO_PORTS = {
  digestRepository: NO_DIGESTS,
  deckArchive: NO_DECK_ARCHIVE,
  fileExchange: NO_FILE_EXCHANGE,
  languagePreference: NO_LANGUAGE_PREFERENCE,
  themePreference: NO_THEME_PREFERENCE,
  palettePreference: NO_PALETTE_PREFERENCE,
  customPalettePreference: NO_CUSTOM_PALETTE_PREFERENCE,
  paletteRepository: NO_PALETTES,
  textSizePreference: NO_TEXT_SIZE_PREFERENCE,
};
