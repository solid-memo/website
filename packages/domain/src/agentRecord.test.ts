import { describe, expect, it } from "vitest";
import { agentToRecord, agentUrlOf, authorFromAgentRecord } from "./agentRecord";

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";

describe("agentUrlOf", () => {
  it("names the agent after the author, in the subject's document", () => {
    expect(agentUrlOf(`${CATALOG}#deck-1`, "Anton Wiklund <anton@example.com>")).toBe(
      `${CATALOG}#agent-anton-wiklund-anton-example-com`,
    );
    expect(agentUrlOf(CATALOG, "  Åsa Öberg  ")).toBe(`${CATALOG}#agent-asa-oberg`);
  });

  it("names an author without letters or digits by a placeholder and a hash of the name", () => {
    expect(agentUrlOf(`${CATALOG}#deck-1`, "—")).toMatch(new RegExp(`^${CATALOG}#agent-unnamed-[0-9a-f]{6}$`));
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

describe("agent records", () => {
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
