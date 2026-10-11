// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { buildThing, createThing, getInteger, getStringNoLocale } from "@inrupt/solid-client";
import { toInstance, toInstanceMeta, toInstanceMetaThing } from "./instanceMapper";
import { DCTERMS, RDF, SM } from "../vocab";

describe("toInstance", () => {
  it("uses the registration title as the name", () => {
    expect(
      toInstance({
        containerUrl: "https://pod.example/solid-memo/main/",
        title: "Japanese study",
      }),
    ).toEqual({
      url: "https://pod.example/solid-memo/main/",
      name: "Japanese study",
    });
  });

  it("falls back to the container slug and normalizes the URL", () => {
    expect(
      toInstance({
        containerUrl: "https://pod.example/solid-memo/main",
        title: null,
      }),
    ).toEqual({
      url: "https://pod.example/solid-memo/main/",
      name: "main",
    });
  });
});

const META = "https://pod.example/solid-memo/main/meta.ttl#it";
const meta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 2 };

describe("toInstanceMeta and toInstanceMetaThing", () => {
  it("round-trip the meta subject", () => {
    const thing = toInstanceMetaThing(META, meta, null);
    expect(getStringNoLocale(thing, DCTERMS.title)).toBe("Main");
    expect(getInteger(thing, SM.formatVersion)).toBe(2);
    expect(toInstanceMeta(thing)).toEqual(meta);
  });

  it("reads a subject without a version as format 1", () => {
    const thing = buildThing(createThing({ url: META }))
      .addIri(RDF.type, SM.Instance)
      .addStringNoLocale(DCTERMS.title, "Main")
      .addDatetime(DCTERMS.created, new Date(meta.createdAt))
      .build();
    expect(toInstanceMeta(thing)).toEqual({ ...meta, formatVersion: 1 });
  });

  it("round-trips what an updated copy says it replaces", () => {
    const updated = {
      ...meta,
      replaces: "https://pod.example/solid-memo/main/",
      replacedAt: "2026-09-28T10:00:00.000Z",
    };
    expect(toInstanceMeta(toInstanceMetaThing(META, updated, null))).toEqual(updated);
  });

  it("is null for a subject that does not fit", () => {
    const untitled = buildThing(createThing({ url: META }))
      .addIri(RDF.type, SM.Instance)
      .build();
    expect(toInstanceMeta(untitled)).toBeNull();
  });

  it("rewrites an existing subject in place", () => {
    const existing = buildThing(createThing({ url: META }))
      .addIri(RDF.type, SM.Instance)
      .addStringNoLocale(DCTERMS.title, "Old")
      .addStringNoLocale("https://other.example/#note", "kept")
      .build();
    const rewritten = toInstanceMetaThing(META, { ...meta, name: "New" }, existing);
    expect(getStringNoLocale(rewritten, DCTERMS.title)).toBe("New");
    expect(getStringNoLocale(rewritten, "https://other.example/#note")).toBe("kept");
  });
});
