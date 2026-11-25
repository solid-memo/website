// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SHAPES_BASE, VOCAB_BASE } from "../../src/ns.ts";
import { NS_ROOT, VOCAB_ROOT } from "../root.ts";
import { SITE_VENDOR } from "../sources.ts";
import { readShapeTree, SHAPE_SOURCES, shapesFetch } from "./shapeSources.ts";

describe("readShapeTree", () => {
  it("reads every shape document, sorted, each with its own address as its base", async () => {
    const files = await readShapeTree();
    expect(files.map((f) => f.path)).toContain("card/v1.ttl");
    for (const { path, turtle } of files) {
      expect(path).toMatch(/^[a-z][a-z0-9-]*\/v[1-9][0-9]*\.ttl$/);
      expect(turtle).toContain(`@base <${SHAPES_BASE}${path}> .`);
    }
  });
});

describe("shapesFetch", () => {
  it("serves the vendored profiles from this package's vendor/ folder", async () => {
    const path = "skohub/skos.shacl.ttl";
    const response = await shapesFetch(new Request(`${SITE_VENDOR}${path}`));
    expect(response.headers.get("content-type")).toBe("text/turtle");
    expect(await response.text()).toBe(await readFile(`${VOCAB_ROOT}vendor/${path}`, "utf8"));
  });

  it("serves the site's documents at their own address, and 404 for any other", async () => {
    const url = `${SHAPES_BASE}card/v1.ttl`;
    const response = await shapesFetch(url);
    expect(response.url).toBe(url);
    expect(await response.text()).toBe(await readFile(`${NS_ROOT}shapes/card/v1.ttl`, "utf8"));
    expect((await shapesFetch(`${SHAPES_BASE}card/v99.ttl`)).status).toBe(404);
    expect((await shapesFetch("https://pod.example/x.ttl")).status).toBe(404);
  });

  it("is given with the bases the app uses", () => {
    expect(SHAPE_SOURCES).toEqual({
      shapesBaseUrl: SHAPES_BASE,
      vocabBaseUrl: VOCAB_BASE,
      vendorBaseUrl: SITE_VENDOR,
    });
  });
});
