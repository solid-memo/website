// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * One version's side of an exchange of a pod with another version of
 * the app (docs/releasing.md "What never changes"), run by
 * `npm run exchange -w @solid-memo/solid` with the step to take in
 * POD_EXCHANGE and the folder the pods are passed in as POD_EXCHANGE_DIR:
 *
 * - `write`: this version's scenario writes a pod, kept as `written.nt`;
 * - `use`: this version uses the pod of `written.nt` as a learner would
 *   the day after, and keeps it as `used.nt`, with what it reads of it
 *   as `used.records.json`. It loses nothing the pod said of a subject;
 * - `read`: this version reads the pod of `used.nt`, each value as the
 *   version that used it read it, and saves it back: no save is
 *   refused, and each document says what it said.
 *
 * scripts/exchangePods.ts runs an earlier release's `write`, this
 * checkout's `use`, then that release's `read`. So this file is run as
 * a release has it, by later versions, for good: the steps' names, the
 * two variables and the three files keep their names and what they
 * hold. A pod is passed as a snapshot holds one (snapshotOf).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  appOver,
  changedDocuments,
  lostTerms,
  recordsOf,
  saveBack,
  SCENARIO_INSTANCE,
  snapshotOf,
  USED_AT,
  usePod,
  writeScenarioPod,
} from "./podScenario";

const STEPS = ["write", "use", "read"] as const;
const step = process.env.POD_EXCHANGE;
const dir = process.env.POD_EXCHANGE_DIR ?? "";
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const keep = (name: string, text: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
};

it("is told which step to take, and where the pods are", () => {
  expect(STEPS, "POD_EXCHANGE").toContain(step);
  expect(dir, "POD_EXCHANGE_DIR").not.toBe("");
});

it.runIf(step === "write")("writes the scenario's pod", async () => {
  keep("written.nt", await snapshotOf(await writeScenarioPod()));
});

it.runIf(step === "use")(
  "uses a pod another version wrote, and loses nothing it said",
  async () => {
    const written = read("written.nt");
    const app = await appOver(written, undefined, USED_AT);
    await usePod(app.useCases);
    await app.settled();
    const used = await snapshotOf(app.store);
    expect(lostTerms(written, used)).toEqual([]);
    keep("used.nt", used);
    const records = await recordsOf((await appOver(used, undefined, USED_AT)).useCases);
    keep("used.records.json", `${JSON.stringify(records, null, 2)}\n`);
  },
);

it.runIf(step === "read")(
  "reads a pod another version used as that version read it, and saves it back",
  async () => {
    const used = read("used.nt");
    const app = await appOver(used, undefined, USED_AT);
    const u = app.useCases;
    // Every value this version reads, the version that used the pod read the same.
    expect(JSON.parse(read("used.records.json"))).toMatchObject(
      (await recordsOf(u)) as Record<string, unknown>,
    );
    expect(await u.validateInstance(SCENARIO_INSTANCE)).toMatchObject({ conforms: true });
    // A save this version refuses throws: of a subject in a format newer than its own, say.
    await saveBack(u);
    await app.settled();
    expect(changedDocuments(used, await snapshotOf(app.store))).toEqual([]);
  },
);
