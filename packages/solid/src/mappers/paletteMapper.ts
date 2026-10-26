// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, asUrl, getThing, getThingAll, getUrlAll, setThing } from "../client/rdf";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { isSameUrl } from "@solid-memo/domain/instanceLayout";
import {
  colorSetToRecord,
  paletteFromRecord,
  paletteToRecord,
} from "@solid-memo/domain/paletteRecord";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import type { ColorSetV1 } from "@solid-memo/vocab/types.generated";
import { COLOR_SET_V1, PALETTE_V1 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";
import { RDF, SM } from "../vocab";

/**
 * The palettes the user designed, in an instance's palettes document
 * (docs/theme.md, Palettes of one's own), between the pod and
 * domain/customPalette.ts. A palette names its two color sets, which are
 * read only as subjects of the same document: a palette never leads a
 * read elsewhere. A palette or color set that does not fit its shape is
 * not read, and a palette whose color set is missing or unreadable sets
 * no color in that theme.
 */

/** Whether `iri` names a subject of the document at `documentUrl`. */
function isIn(iri: string, documentUrl: string): boolean {
  return isSameUrl(documentUrlOf(iri), documentUrl);
}

/** The color set at `iri` in the palette's document, as its latest record; null when there is none it can read. */
function colorSetOf(dataset: Dataset, iri: string, documentUrl: string): ColorSetV1 | null {
  if (!isIn(iri, documentUrl)) return null;
  const thing = getThing(dataset, iri);
  const read = thing === null ? null : readVersioned(thing, "colorSet");
  return read === null ? null : migrate("colorSet", read.record, { subject: iri });
}

/**
 * Every palette of a palettes document read from `documentUrl`, in the
 * order written: each a subject of that document, as a palette the
 * preferences name must be (isPaletteOf).
 */
export function toPalettes(dataset: Dataset, documentUrl: string): CustomPalette[] {
  return getThingAll(dataset)
    .filter(
      (thing) => getUrlAll(thing, RDF.type).includes(SM.Palette) && isIn(asUrl(thing), documentUrl),
    )
    .flatMap((thing) => {
      const read = readVersioned(thing, "palette");
      if (read === null) return [];
      const url = asUrl(thing);
      const data = migrate("palette", read.record, { subject: url });
      return [
        paletteFromRecord(
          url,
          data,
          colorSetOf(dataset, data.lightColors, documentUrl),
          colorSetOf(dataset, data.darkColors, documentUrl),
        ),
      ];
    });
}

/**
 * The document with the palette written in place, its color sets
 * beside it, and the subjects written: each where the palette names it
 * in the document, else at `<palette>-light` and `<palette>-dark`.
 * Triples this app does not know survive (recordThing).
 */
export function withPalette(
  dataset: Dataset,
  documentUrl: string,
  palette: CustomPalette,
): { dataset: Dataset; subjects: string[] } {
  const existing = getThing(dataset, palette.url);
  const read = existing === null ? null : readVersioned(existing, "palette");
  const place = (theme: "light" | "dark") => {
    const named = read?.record.data[theme === "light" ? "lightColors" : "darkColors"];
    return named !== undefined && isIn(named, documentUrl) ? named : `${palette.url}-${theme}`;
  };
  const [light, dark] = [place("light"), place("dark")];
  let updated = setThing(
    dataset,
    recordThing(palette.url, PALETTE_V1, paletteToRecord(palette, light, dark), existing),
  );
  for (const [url, colors] of [
    [light, palette.light],
    [dark, palette.dark],
  ] as const) {
    updated = setThing(
      updated,
      recordThing(url, COLOR_SET_V1, colorSetToRecord(colors), getThing(updated, url)),
    );
  }
  return { dataset: updated, subjects: [palette.url, light, dark] };
}
