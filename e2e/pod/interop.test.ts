// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/interop.md describes each cause an advisory server's
// expected-failures.json names, for the server's developers: the two are
// kept in step here.

const page = readFileSync(join(import.meta.dirname, "../../docs/interop.md"), "utf8");

/** The page's servers (its `##` sections), each with its causes' ids in its table and its headings. */
const sections = page
  .split(/^## /m)
  .slice(1)
  .map((text) => ({
    title: text.slice(0, text.indexOf("\n")),
    table: [...text.matchAll(/^\| \[`([a-z0-9-]+)`\]\(#\1\) \|/gm)].map((m) => m[1]!),
    headings: [...text.matchAll(/^### ([a-z0-9-]+)$/gm)].map((m) => m[1]!),
  }))
  .filter((section) => section.headings.length > 0);

/** The causes a server's list in `dir` names, none where it has no list. */
const causesOf = (dir: string, id: string) => {
  const file = join(dir, id, "expected-failures.json");
  return existsSync(file)
    ? Object.values(JSON.parse(readFileSync(file, "utf8")) as Record<string, string>)
    : [];
};
// The pod tests' lists, and the journeys' (e2e/journeys/servers/<id>/).
const servers = join(import.meta.dirname, "servers");
const journeyServers = join(import.meta.dirname, "../journeys/servers");
const lists = [
  ...new Set([
    ...readdirSync(servers),
    ...(existsSync(journeyServers) ? readdirSync(journeyServers) : []),
  ]),
]
  .map((id) => ({
    id,
    causes: new Set([...causesOf(servers, id), ...causesOf(journeyServers, id)]),
  }))
  // A server whose lists are empty fails nothing, and the page lists no cause of it.
  .filter((list) => list.causes.size > 0);

describe("docs/interop.md", () => {
  it("lists each server's causes in its table as its headings do", () => {
    expect(sections.length).toBeGreaterThan(0);
    for (const { table, headings } of sections) expect(table).toEqual(headings);
  });

  it("names each cause once", () => {
    const ids = sections.flatMap((section) => section.headings);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes every cause a server's list names, all in that server's section, and no other", () => {
    const matched = lists.map(({ id, causes }) => {
      const section = sections.find((s) => s.headings.some((cause) => causes.has(cause)));
      expect(section, `${id}: no section of docs/interop.md`).toBeDefined();
      expect(new Set(section!.headings), id).toEqual(causes);
      return section!.title;
    });
    // One section per server, and none that no server's list uses.
    expect(new Set(matched).size).toBe(matched.length);
    expect([...matched].sort()).toEqual(sections.map((section) => section.title).sort());
  });
});
