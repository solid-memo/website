// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { instanceMetaFromRecord, instanceMetaToRecord } from "./instanceRecord";

describe("instance meta records", () => {
  it("round-trip the name and creation time, keeping the stored version", () => {
    const meta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 1 };
    expect(instanceMetaToRecord(meta)).toEqual({ title: "Main", created: meta.createdAt });
    expect(instanceMetaFromRecord(1, instanceMetaToRecord(meta))).toEqual(meta);
  });

  it("round-trip what an updated copy replaces, and when", () => {
    const meta = {
      name: "Main",
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 2,
      replaces: "https://pod.example/solid-memo/main/",
      replacedAt: "2026-09-28T10:00:00.000Z",
    };
    expect(instanceMetaToRecord(meta)).toEqual({
      title: "Main",
      created: meta.createdAt,
      replaces: meta.replaces,
      modified: meta.replacedAt,
    });
    expect(instanceMetaFromRecord(2, instanceMetaToRecord(meta))).toEqual(meta);
  });
});
