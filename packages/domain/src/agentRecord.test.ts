// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { AgentV1 } from "@solid-memo/vocab/types.generated";
import {
  type AgentHolder,
  agentToRecord,
  agentUrlOf,
  agentUrlsOf,
  authorFromAgentRecord,
  sameAgent,
} from "./agentRecord";
import { fnv1a } from "./fnv1a";
import { growth } from "./testing/growth";
import { LONG_SUBJECT, longNames, namesOf } from "./testing/longAgents";

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
    const holderAt = (url: string) => held.get(url) ?? null;
    expect(agentUrlsOf(CATALOG, ["Jane Doe <jane@example.org>"], holderAt)).toEqual([SLUG]);
    const [moved] = agentUrlsOf(CATALOG, ["Jane Doe <jane@exämple.org>"], holderAt);
    expect(moved).toMatch(new RegExp(`^${SLUG}-[0-9a-f]{6}$`));
    held.set(moved!, agentToRecord("Someone else"));
    expect(agentUrlsOf(CATALOG, ["Jane Doe <jane@exämple.org>"], holderAt)).toEqual([`${moved}-2`]);
  });

  it("counts after the hash an author's node already has", () => {
    const kim = agentUrlOf(CATALOG, "김민수");
    const holderAt = (url: string): AgentHolder =>
      url === kim ? agentToRecord("Kim") : url === `${kim}-2` ? "unreadable" : null;
    expect(agentUrlsOf(CATALOG, ["김민수"], holderAt)).toEqual([`${kim}-3`]);
  });

  describe("with authors that share a slug and a hash", () => {
    const names = collidingNames("Jane", 6);
    const hashed = `${CATALOG}#agent-${names[0]!.toLowerCase()}-${hashOf(names[0]!)}`;

    it("are made by the test as such", () => {
      expect(new Set(names).size).toBe(64);
      expect(new Set(names.map((name) => agentUrlOf(CATALOG, name))).size).toBe(1);
      expect(new Set(names.map(hashOf)).size).toBe(1);
    });

    it("counts each author on from the lowest node that is free or holds it", () => {
      const urls = agentUrlsOf(CATALOG, [...names.slice(0, 4), names[1]!, names[4]!]);
      expect(urls).toEqual([
        agentUrlOf(CATALOG, names[0]!),
        hashed,
        `${hashed}-2`,
        `${hashed}-3`,
        hashed,
        `${hashed}-4`,
      ]);
      const held = new Map<string, AgentHolder>([
        [`${hashed}-2`, agentToRecord(names[3]!)],
        [`${hashed}-3`, "unreadable"],
        [`${hashed}-4`, agentToRecord(names[2]!)],
        [`${hashed}-5`, agentToRecord(names[3]!)],
      ]);
      const holderAt = (url: string) => held.get(url) ?? null;
      expect(agentUrlsOf(CATALOG, names.slice(0, 6), holderAt)).toEqual([
        agentUrlOf(CATALOG, names[0]!),
        hashed,
        `${hashed}-4`,
        `${hashed}-2`,
        `${hashed}-6`,
        `${hashed}-7`,
      ]);
    });

    it("are named as probing each node in turn for each author names them", () => {
      const others = ["Anton", "Jane Doe <jane@example.org>", "김민수", "Anton", "—"];
      const authors = [...names.slice(0, 40), ...others, ...names.slice(10, 20).reverse()];
      const first = new Map(
        probedUrlsOf(CATALOG, [...names.slice(30), ...others]).map((url, i) => [
          url,
          agentToRecord([...names.slice(30), ...others][i]!),
        ]),
      );
      const holdings: ((url: string) => AgentHolder)[] = [
        () => null,
        (url) => first.get(url) ?? null,
        (url) => (url.endsWith("-3") || url.endsWith("-8") ? "unreadable" : null),
        (url) => (url.endsWith("-5") ? agentToRecord("Someone else") : (first.get(url) ?? null)),
      ];
      for (const holderAt of holdings) {
        expect(agentUrlsOf(CATALOG, authors, holderAt)).toEqual(
          probedUrlsOf(CATALOG, authors, holderAt),
        );
      }
    });

    it("takes time that grows with the authors, not their square", () => {
      // Eight times the authors take about as long as an eighth of them
      // eight times over; probing every taken node again for each author
      // would take eight times as long.
      const many = collidingNames("Jane", 12);
      const ratio = growth(
        (count) => {
          const authors = many.slice(0, count);
          return () => agentUrlsOf(CATALOG, authors);
        },
        256,
        8,
      );
      expect(ratio).toBeLessThan(4);
    });

    it("looks at the nodes other authors hold once, not once for each author", () => {
      const many = collidingNames("Jane", 13);
      const ratio = growth(
        (count) => {
          const held = new Map<string, AgentV1>();
          const urls = agentUrlsOf(CATALOG, many.slice(0, count));
          urls.forEach((url, i) => held.set(url, agentToRecord(many[i]!)));
          const authors = many.slice(4096, 4096 + count);
          return () => agentUrlsOf(CATALOG, authors, (url) => held.get(url) ?? null);
        },
        256,
        8,
      );
      expect(ratio).toBeLessThan(4);
    });
  });
});

describe("agentUrlsOf with URLs longer than any term (GHSA-4mgg-5xpp-3jx5)", () => {
  it("names the same nodes as with short ones, an author named twice one node", () => {
    const authors = longNames(3);
    const urls = agentUrlsOf(CATALOG, [...authors, authors[1]!]);
    expect(urls[0]!.length).toBeGreaterThan(16_383);
    expect(urls).toEqual(probedUrlsOf(CATALOG, [...authors, authors[1]!]));
    expect(urls[3]).toBe(urls[1]);
  });

  it("takes time that grows with the authors of a long subject, not their square", {
    timeout: 180_000,
  }, () => {
    const ratio = growth(
      (count) => {
        const authors = namesOf(count, 24);
        return () => agentUrlsOf(LONG_SUBJECT, authors);
      },
      250,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("tells long authors of one counted name apart by name and mailbox alone", () => {
    const start = `${"j".repeat(16_200)} <`;
    const many = collidingNames(start, 12).map((name) => `${name}@example.org>`);
    const named = agentUrlsOf(CATALOG, [...many.slice(0, 3), many[2]!]);
    expect(agentToRecord(many[2]!).mbox).toBeDefined();
    expect(named[2]).toBe(`${named[1]}-2`);
    expect(named[3]).toBe(named[2]);
  });
});

/**
 * agentUrlsOf as it was first written, every node probed in turn for
 * each author: the names it gives are the ones to keep.
 */
function probedUrlsOf(
  subjectUrl: string,
  authors: readonly string[],
  holderAt: (url: string) => AgentHolder = () => null,
): string[] {
  const taken = new Map<string, AgentV1>();
  return authors.map((author) => {
    const record = agentToRecord(author);
    const free = (url: string) => {
      const holder = taken.get(url) ?? holderAt(url);
      return holder === null || (holder !== "unreadable" && sameAgent(holder, record));
    };
    const first = agentUrlOf(subjectUrl, author);
    const hashed = /-[0-9a-f]{6}$/.test(first) ? first : `${first}-${hashOf(author)}`;
    let url = free(first) ? first : hashed;
    for (let count = 2; !free(url); count++) url = `${hashed}-${count}`;
    taken.set(url, record);
    return url;
  });
}

/** The six hex digits agentUrlOf puts after a name's slug. */
function hashOf(text: string): string {
  return fnv1a(text).toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * 2 ** `blocks` names that differ only in the case of their letters and
 * share their whole FNV-1a hash: blocks of x and X one after another,
 * each a pair of two that take one hash to the same, so that any choice
 * of each pair does.
 */
function collidingNames(start: string, blocks: number): string[] {
  const step = (hash: number, text: string) => {
    let next = hash;
    for (let i = 0; i < text.length; i++) {
      next = Math.imul(next ^ text.charCodeAt(i), 0x01000193) >>> 0;
    }
    return next;
  };
  let names = [start];
  let hash = step(0x811c9dc5, start);
  for (let block = 0; block < blocks; block++) {
    const seen = new Map<number, string>();
    for (let variant = 0; ; variant++) {
      let text = "";
      for (let i = 0; i < 24; i++) text += (variant >> i) & 1 ? "X" : "x";
      const after = step(hash, text);
      const other = seen.get(after);
      if (other === undefined) {
        seen.set(after, text);
        continue;
      }
      names = names.flatMap((name) => [name + other, name + text]);
      hash = after;
      break;
    }
  }
  return names;
}

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
