// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ColorSetV1, PaletteV1 } from "@solid-memo/vocab/types.generated";
import { conceptOfPalette, paletteOfConcept } from "./concepts";
import {
  parsePalette,
  PALETTE_ROLES,
  type CustomPalette,
  type PaletteColors,
  type PaletteRole,
} from "./customPalette";
import { DEFAULT_PALETTE } from "./palette";

/** The color set's field for each role a palette sets. */
const FIELDS: Record<PaletteRole, keyof ColorSetV1> = {
  "--bg": "backgroundColor",
  "--surface": "surfaceColor",
  "--surface-sunken": "sunkenSurfaceColor",
  "--text": "textColor",
  "--text-muted": "mutedTextColor",
  "--border": "borderColor",
  "--control-border": "fieldEdgeColor",
  "--primary": "primaryColor",
  "--primary-fill": "primaryFillColor",
  "--on-primary": "onPrimaryColor",
  "--link": "linkColor",
  "--danger": "dangerColor",
  "--warning-text": "warningColor",
  "--grade-0": "grade0Color",
  "--grade-1": "grade1Color",
  "--grade-2": "grade2Color",
  "--grade-3": "grade3Color",
  "--grade-4": "grade4Color",
  "--grade-5": "grade5Color",
};

/** A color set's colors by role; none for a set the document does not have. */
function colorsFromRecord(data: ColorSetV1 | null): PaletteColors {
  if (data === null) return {};
  return Object.fromEntries(
    PALETTE_ROLES.filter((role) => data[FIELDS[role]] !== undefined).map((role) => [
      role,
      data[FIELDS[role]],
    ]),
  );
}

/**
 * A palette between its records, its own and its two color sets', and
 * the model. The base is a concept in the record and a notation in the
 * model, Standard for one this version does not know; a color set the
 * document does not have sets no color. What a record holds is held to
 * the model's rules again (parsePalette): a color not written `#rrggbb`
 * is left out, whatever the shape said of it.
 */
export function paletteFromRecord(
  url: string,
  data: PaletteV1,
  light: ColorSetV1 | null,
  dark: ColorSetV1 | null,
): CustomPalette {
  return parsePalette({
    url,
    title: data.title,
    basedOn: paletteOfConcept(data.basedOn) ?? DEFAULT_PALETTE,
    light: colorsFromRecord(light),
    dark: colorsFromRecord(dark),
  })!;
}

/** The palette's own record, naming its color sets at these subjects. */
export function paletteToRecord(
  palette: CustomPalette,
  lightColors: string,
  darkColors: string,
): PaletteV1 {
  return {
    title: palette.title,
    basedOn: conceptOfPalette(palette.basedOn),
    lightColors,
    darkColors,
  };
}

/** A color set's record: a field for each color the palette sets in that theme. */
export function colorSetToRecord(colors: PaletteColors): ColorSetV1 {
  return Object.fromEntries(
    PALETTE_ROLES.filter((role) => colors[role] !== undefined).map((role) => [
      FIELDS[role],
      colors[role],
    ]),
  );
}
