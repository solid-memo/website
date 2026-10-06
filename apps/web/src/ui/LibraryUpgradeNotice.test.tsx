import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Card } from "@solid-memo/domain/deck";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { createI18n, I18nProvider } from "./i18n";
import { describeChanges, LibraryUpgradeNotice } from "./LibraryUpgradeNotice";

const en = createI18n("en");

const card = (id: string): Card => ({ id, url: `https://pod.example/d.ttl#${id}`, front: { "": id }, back: { "": id }, createdAt: "", formatVersion: 2 });
const libraryCard = (id: string) => ({ id, front: { "": id }, back: { "": id }, formatVersion: 1 });
const plan: LibraryUpgradePlan = {
  fromVersion: "1",
  toVersion: "3",
  releaseUrl: "https://solid-memo.com/decks/capitals/v3.ttl",
  notes: [
    { version: "2", notes: "Added Norway." },
    { version: "3", notes: "Fixed Sweden." },
  ],
  add: [libraryCard("no")],
  change: [libraryCard("se"), libraryCard("dk")],
  retire: [],
  restore: [],
  remove: [card("is")],
  kept: [card("fi")],
};

function renderNotice(overrides: Partial<Parameters<typeof LibraryUpgradeNotice>[0]> = {}) {
  const props = { deckName: "Capitals", plan, busy: false, error: null, onUpgrade: vi.fn(), ...overrides };
  const view = render(<LibraryUpgradeNotice {...props} />);
  return { ...view, props };
}

describe("describeChanges", () => {
  it("names what the update does, in a list", () => {
    expect(describeChanges(plan, en)).toBe("adds 1 card, changes 2 cards and removes 1 card");
    expect(describeChanges({ ...plan, add: [], change: [], remove: [], direction: "bidirectional" }, en)).toBe(
      "studies it both ways",
    );
    expect(describeChanges({ ...plan, add: [], change: [], remove: [], title: { en: "Capitals", sv: "Huvudstäder" } }, en)).toBe(
      "updates the deck's name, description or keywords",
    );
    expect(describeChanges({ ...plan, add: [], change: [], remove: [], keywords: { en: ["capitals"], sv: ["huvudstäder"] } }, en)).toBe(
      "updates the deck's name, description or keywords",
    );
  });

  it("counts retirements and cards brought back, not what is added or changed retired", () => {
    const retired = { ...libraryCard("yu"), retired: true as const };
    expect(
      describeChanges({ ...plan, add: [retired], change: [retired], retire: [card("se")], restore: [card("dk"), card("fi")], remove: [] }, en),
    ).toBe("retires 1 card and brings back 2 cards");
    expect(describeChanges({ ...plan, add: [retired], change: [], remove: [] }, en)).toBe("updates cards you no longer study");
  });
});

describe("LibraryUpgradeNotice", () => {
  it("says what the new release changed and what an update would do, then waits", () => {
    const { props } = renderNotice();
    const region = screen.getByRole("region", { name: "Newer library release" });
    expect(region).toHaveTextContent(
      "Capitals came from release 1; release 3 is out. Updating adds 1 card, changes 2 cards and removes 1 card. Your review history is kept, but for the cards removed. 1 card you changed is left as you have it.",
    );
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Release 2: Added Norway.",
      "Release 3: Fixed Sweden.",
    ]);
    expect(props.onUpgrade).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Update to release 3" }));
    expect(props.onUpgrade).toHaveBeenCalledOnce();
  });

  it("says a retired card is kept when the update retires any", () => {
    renderNotice({ plan: { ...plan, change: [], retire: [card("se")], remove: [], kept: [] } });
    expect(screen.getByRole("region", { name: "Newer library release" })).toHaveTextContent(
      "Updating adds 1 card and retires 1 card. Your review history is kept; a retired card is kept, but no longer studied.",
    );
  });

  it("says nothing of removals, kept cards or notes when there are none, and counts kept cards", () => {
    renderNotice({ plan: { ...plan, remove: [], kept: [card("a"), card("b")], notes: [] } });
    const region = screen.getByRole("region", { name: "Newer library release" });
    expect(region).toHaveTextContent("Your review history is kept. 2 cards you changed are left as you have them.");
    expect(screen.queryByRole("list")).toBeNull();
    renderNotice({ plan: { ...plan, remove: [], kept: [] } });
    expect(screen.getAllByRole("region")[1]).toHaveTextContent(/Your review history is kept\.Release 2/);
  });

  it("speaks Swedish, naming both removals and retirements", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <LibraryUpgradeNotice
          deckName="Huvudstäder"
          plan={{ ...plan, add: [], change: [], retire: [card("se")], kept: [] }}
          busy={false}
          error={null}
          onUpgrade={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("region", { name: "Nyare utgåva i biblioteket" })).toHaveTextContent(
      "Huvudstäder kom från utgåva 1; utgåva 3 finns nu. En uppdatering tar 1 kort ur bruk och tar bort 1 kort. Din repetitionshistorik behålls, utom för de borttagna korten; ett kort som tas ur bruk behålls, men studeras inte längre.",
    );
    expect(screen.getByRole("button", { name: "Uppdatera till utgåva 3" })).toBeEnabled();
  });

  it("shows progress and errors", () => {
    renderNotice({ busy: true, error: "write refused" });
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
    expect(screen.getByText("write refused")).toHaveClass("error");
  });
});
