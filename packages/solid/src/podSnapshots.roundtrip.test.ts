// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A reader never reads less (docs/releasing.md "What never changes"):
 * every pod a version of the app wrote is kept as a snapshot, and this
 * app reads each as that version read it.
 *
 * - One scenario (testing/podScenario.ts) writes a pod that holds every
 *   kind of data, each with every term its shape names. What it writes
 *   is the newest snapshot, `packages/vocab/fixtures/pods/<n>.nt`; once
 *   the app writes a pod differently, that is the next snapshot, and
 *   the earlier ones stay as they are.
 * - Beside each snapshot, `<n>.records.json` holds what the app read of
 *   it when it was made. This app reads no less of it: every value
 *   there is read again, and a value read besides is one added since.
 * - Saving what was read back leaves each document saying what it said.
 * - `api/frozen/pods.txt` holds the hash of each file, so a snapshot
 *   edited or removed fails here and in `npm run check:breaking`.
 *
 * To add the next snapshot after a change you meant, run this test with
 * `-u` and commit the new files with the change (api/README.md).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SHAPES } from "@solid-memo/vocab/descriptors.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { REPOSITORY_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import {
  appOver,
  changedDocuments,
  documentsOf,
  recordsOf,
  saveBack,
  SCENARIO_INSTANCE,
  snapshotOf,
  writeScenarioPod,
} from "./testing/podScenario";
import { RDF } from "./vocab";

const PODS = join(VOCAB_ROOT, "fixtures/pods/");
const fileOf = (name: string) => join(PODS, name);
const text = (name: string) => readFileSync(fileOf(name), "utf8");

/** The numbers of the snapshots kept, oldest first. */
const kept = (existsSync(PODS) ? readdirSync(PODS) : [])
  .flatMap((name) => /^(\d+)\.nt$/.exec(name)?.[1] ?? [])
  .map(Number)
  .sort((a, b) => a - b);

/** Each subject of a snapshot with what it says: its values by property. */
function subjectsOf(snapshot: string): Map<string, Map<string, Set<string>>> {
  const subjects = new Map<string, Map<string, Set<string>>>();
  for (const lines of documentsOf(snapshot).values()) {
    for (const line of lines) {
      const [, subject, property, value] = /^(\S+) <([^>]*)> (.*) \.$/.exec(line)!;
      const said = subjects.get(subject!) ?? new Map<string, Set<string>>();
      subjects.set(subject!, said);
      said.set(property!, (said.get(property!) ?? new Set()).add(value!));
    }
  }
  return subjects;
}

describe("the scenario's pod", () => {
  let written: string;
  let records: string;
  beforeAll(async () => {
    // A study day and an answer's offset from UTC are the device's: the scenario is UTC's (vitest.roundtrip.config.ts).
    expect(new Date().getTimezoneOffset()).toBe(0);
    const store = await writeScenarioPod();
    written = await snapshotOf(store);
    records = `${JSON.stringify(await recordsOf((await appOver(written)).useCases), null, 2)}\n`;
  }, 120_000);

  it("is the same pod every time it is written", async () => {
    expect(await snapshotOf(await writeScenarioPod())).toBe(written);
  });

  it("holds every kind of data the app writes, each with every term its shape names", () => {
    const subjects = [...subjectsOf(written).values()];
    const missing = (Object.keys(LATEST_VERSION) as ShapeName[]).flatMap((shape) => {
      const { targetClass, fixedValues, fields } = (
        SHAPES[shape] as Record<number, ShapeDescriptor>
      )[LATEST_VERSION[shape]]!;
      const ofKind = subjects.filter(
        (said) =>
          said.get(RDF.type)?.has(`<${targetClass}>`) === true &&
          fixedValues.every(({ predicate, value }) => said.get(predicate)?.has(`<${value}>`)),
      );
      if (ofKind.length === 0) return [shape];
      return fields
        .filter(({ predicate }) => !ofKind.some((said) => said.has(predicate)))
        .map(({ name }) => `${shape}.${name}`);
    });
    expect(missing).toEqual([]);
  });

  it("is the newest snapshot, or the next one", async () => {
    const newest = kept.at(-1);
    // Written differently than the newest snapshot, it is the next: an earlier one is never written again.
    const number =
      newest !== undefined && text(`${newest}.nt`) === written ? newest : (newest ?? 0) + 1;
    await expect(written).toMatchFileSnapshot(fileOf(`${number}.nt`));
    if (number !== newest)
      await expect(records).toMatchFileSnapshot(fileOf(`${number}.records.json`));
  });
});

describe.each(kept)("snapshot %i", (number) => {
  const snapshot = text(`${number}.nt`);

  it("is read with no less than the version that wrote it read", async () => {
    const { useCases } = await appOver(snapshot);
    expect(await recordsOf(useCases)).toMatchObject(JSON.parse(text(`${number}.records.json`)));
    expect(await useCases.validateInstance(SCENARIO_INSTANCE)).toMatchObject({ conforms: true });
  });

  it("says what it said once what was read is saved back", async () => {
    const saved: string[] = [];
    const app = await appOver(snapshot, async (method, url) => void saved.push(`${method} ${url}`));
    saved.length = 0;
    const u = app.useCases;
    const I = SCENARIO_INSTANCE;
    // Nothing in it is in a format this app would bring up to date.
    expect(await u.planMigration(I)).toMatchObject({ decks: [] });
    await saveBack(u);
    await app.settled();
    // The documents written, each kind of them: none was left alone as already saying it.
    const writtenTo = new Set(saved.map((request) => request.split(" ")[1]!.slice(I.length)));
    expect([...writtenTo].some((path) => path.startsWith("decks/"))).toBe(true);
    expect(writtenTo).toContain("preferences.ttl");
    expect(writtenTo).toContain("palettes.ttl");
    expect(writtenTo).toContain("catalog.ttl");
    // The digest aside: it is worked out from the rest, at the versions the documents had in
    // the pod that wrote it, and in this one they have others, so it is made again.
    expect(changedDocuments(snapshot, await snapshotOf(app.store))).toEqual([]);
  });
});

it("keeps api/frozen/pods.txt to the snapshots kept, each as it was made", async () => {
  const lines = (existsSync(PODS) ? readdirSync(PODS) : []).sort().map(
    (name) =>
      `pods/${name} sha256:${createHash("sha256")
        .update(readFileSync(fileOf(name)))
        .digest("hex")}`,
  );
  await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(
    join(REPOSITORY_ROOT, "api/frozen/pods.txt"),
  );
});
