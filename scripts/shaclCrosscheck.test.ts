// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pickShapes } from "@solid-memo/shacl/registry";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { SM_NS } from "@solid-memo/vocab/vocab.generated";

/** The crosscheck's own list of the classes a release holds, as IRIs. */
function crosscheckReleaseClasses(): string[] {
  const script = readFileSync(join(import.meta.dirname, "shacl_crosscheck.py"), "utf8");
  const [, list] = /^RELEASE_CLASSES = \{([^}]*)\}$/m.exec(script) ?? [];
  return [...list.matchAll(/SM\.(\w+)/g)].map(([, name]) => `${SM_NS}${name}`);
}

it("the crosscheck and the app agree on the Solid Memo classes a release holds", () => {
  const classes = new Set(
    ALL_SHAPES.map((d) => d.targetClass).filter((iri) => iri.startsWith(SM_NS)),
  );
  const held = [...classes].filter(
    (iri) => pickShapes([iri], 1, "library", () => []).kind !== "refused",
  );
  expect(held).not.toEqual([]);
  expect(crosscheckReleaseClasses().sort()).toEqual(held.sort());
});
