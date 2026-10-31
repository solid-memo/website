// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  agentToRecord,
  agentUrlOf,
  agentUrlsOf,
  authorFromAgentRecord,
  sameAgent,
} from "./agentRecord";

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";

describe("agentUrlOf", () => {
  it("names the agent after the author, in the subject's document", () => {
    expect(agentUrlOf(`${CATALOG}#deck-1`, "Anton Wiklund <anton@example.com>")).toBe(
      `${CATALOG}#agent-anton-wiklund-anton-example-com`,
    );
    expect(agentUrlOf(CATALOG, "  Åsa Öberg  ")).toBe(`${CATALOG}#agent-asa-oberg`);
  });

  it("names an author without letters or digits by a placeholder and a hash of the name", () => {
    expect(agentUrlOf(`${CATALOG}#deck-1`, "—")).toMatch(
      new RegExp(`^${CATALOG}#agent-unnamed-[0-9a-f]{6}$`),
    );
    expect(agentUrlOf(CATALOG, "—")).not.toBe(agentUrlOf(CATALOG, "–"));
  });

  it("tells apart names whose letters the folding drops, by a hash of the whole name", () => {
    const kim = agentUrlOf(CATALOG, "김민수");
    expect(kim).toMatch(new RegExp(`^${CATALOG}#agent-unnamed-[0-9a-f]{6}$`));
    expect(kim).not.toBe(agentUrlOf(CATALOG, "이지은"));
    const mixed = agentUrlOf(CATALOG, "Kim 민수");
    expect(mixed).toMatch(new RegExp(`^${CATALOG}#agent-kim-[0-9a-f]{6}$`));
    expect(mixed).not.toBe(agentUrlOf(CATALOG, "Kim 철수"));
    expect(agentUrlOf(CATALOG, "Groß")).toMatch(/#agent-gro-[0-9a-f]{6}$/);
    expect(agentUrlOf(CATALOG, "Agent ٣")).toMatch(/#agent-agent-[0-9a-f]{6}$/);
  });

  it("hashes the trimmed name in one Unicode form, so the IRI is stable", () => {
    expect(agentUrlOf(CATALOG, "김민수")).toBe(`${CATALOG}#agent-unnamed-5a5e6e`);
    expect(agentUrlOf(CATALOG, "Kim 민수")).toBe(`${CATALOG}#agent-kim-ad54ba`);
    expect(agentUrlOf(CATALOG, "  김민수 ")).toBe(agentUrlOf(`${CATALOG}#deck-2`, "김민수"));
    expect(agentUrlOf(CATALOG, "김민수".normalize("NFD"))).toBe(agentUrlOf(CATALOG, "김민수"));
  });
});

describe("agentUrlsOf", () => {
  const SLUG = `${CATALOG}#agent-jane-doe-jane-example-org`;
  const LOOK_ALIKES = [
    "Jane Doe <jane@example.org>",
    "Jane Doe <jane@exämple.org>",
    "Jane Doe <jane.example@org>",
    "Jane Doe (jane example org)",
  ];

  it("gives authors that fold to one node a node each, the first the bare one", () => {
    expect(new Set(LOOK_ALIKES.map((author) => agentUrlOf(CATALOG, author)))).toEqual(
      new Set([SLUG]),
    );
    const urls = agentUrlsOf(`${CATALOG}#deck-1`, LOOK_ALIKES);
    expect(urls[0]).toBe(SLUG);
    expect(new Set(urls).size).toBe(4);
    for (const url of urls.slice(1)) expect(url).toMatch(new RegExp(`^${SLUG}-[0-9a-f]{6}$`));
  });

  it("names the same author twice by one node", () => {
    expect(agentUrlsOf(CATALOG, ["Anton", "Anton"])).toEqual([
      `${CATALOG}#agent-anton`,
      `${CATALOG}#agent-anton`,
    ]);
  });

  it("leaves a node that holds another author, and keeps the one that holds this author", () => {
    const held = new Map([[SLUG, agentToRecord("Jane Doe <jane@example.org>")]]);
    const fits = (url: string, record: ReturnType<typeof agentToRecord>) => {
      const holder = held.get(url);
      return holder === undefined || sameAgent(holder, record);
    };
    expect(agentUrlsOf(CATALOG, ["Jane Doe <jane@example.org>"], fits)).toEqual([SLUG]);
    const [moved] = agentUrlsOf(CATALOG, ["Jane Doe <jane@exämple.org>"], fits);
    expect(moved).toMatch(new RegExp(`^${SLUG}-[0-9a-f]{6}$`));
    held.set(moved!, agentToRecord("Someone else"));
    expect(agentUrlsOf(CATALOG, ["Jane Doe <jane@exämple.org>"], fits)).toEqual([`${moved}-2`]);
  });

  it("counts after the hash an author's node already has", () => {
    const kim = agentUrlOf(CATALOG, "김민수");
    const fits = (url: string) => url !== kim && url !== `${kim}-2`;
    expect(agentUrlsOf(CATALOG, ["김민수"], fits)).toEqual([`${kim}-3`]);
  });
});

describe("agent records", () => {
  it("are the same author by name and mailbox", () => {
    expect(
      sameAgent(agentToRecord("A <a@example.org>"), { name: "A", mbox: "mailto:a@example.org" }),
    ).toBe(true);
    expect(sameAgent(agentToRecord("A <a@example.org>"), { name: "A" })).toBe(false);
    expect(sameAgent({ name: "A" }, { name: "B" })).toBe(false);
  });

  it("round-trip a name and an address", () => {
    expect(agentToRecord("Anton <anton@example.com>")).toEqual({
      name: "Anton",
      mbox: "mailto:anton@example.com",
    });
    expect(authorFromAgentRecord(agentToRecord("Anton <anton@example.com>"))).toBe(
      "Anton <anton@example.com>",
    );
    expect(agentToRecord("A friend")).toEqual({ name: "A friend" });
    expect(authorFromAgentRecord({ name: "A friend" })).toBe("A friend");
  });

  it("show only the name for a mailbox that is not a mailto: IRI", () => {
    expect(authorFromAgentRecord({ name: "Anton", mbox: "https://example.com/" })).toBe("Anton");
  });
});
