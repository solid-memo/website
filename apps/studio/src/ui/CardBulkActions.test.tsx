import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { planCardEdit, type CardEdit } from "@solid-memo/domain/cardBulk";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CardBulkActions } from "./CardBulkActions";
import { choose } from "../test/choose";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const water = { ...makeCard(deck, "water"), front: { "": "水" }, back: { en: "water" } };
const fire = { ...makeCard(deck, "fire", true), front: { ja: "火" }, back: { en: "fire" }, textFormat: SM.markdown };
const cards = [water, fire];

function renderActions(onEdit = vi.fn(async (_edit: CardEdit, _plan: unknown) => true), busy = false) {
  const plan = vi.fn((edit: CardEdit) => planCardEdit(cards, ["water", "fire"], edit));
  render(<CardBulkActions cards={cards} languages={["en", "ja"]} busy={busy} plan={plan} onEdit={onEdit} />);
  return { plan, onEdit };
}

const bulk = () => screen.getByRole("group", { name: "Selected cards" });
const press = (name: string) => fireEvent.click(within(bulk()).getByRole("button", { name }));

afterEach(() => vi.unstubAllGlobals());

describe("CardBulkActions", () => {
  it("makes an edit with the plan made of the cards as they are", () => {
    const { plan, onEdit } = renderActions();
    press("Retire");
    expect(plan).toHaveBeenCalledWith({ kind: "retire" });
    expect(onEdit).toHaveBeenCalledWith({ kind: "retire" }, plan.mock.results[0]!.value);
    press("Write in Markdown");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "setTextFormat", markdown: true }, expect.anything());
    press("Write as plain text");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "setTextFormat", markdown: false }, expect.anything());
    press("Restore");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "restore" }, expect.anything());
  });

  it("makes no edit that would change none of the cards, and says so", () => {
    const { onEdit } = renderActions();
    const markdownOnly = vi.fn((edit: CardEdit) => planCardEdit([fire], ["fire"], edit));
    render(<CardBulkActions cards={[fire]} languages={[]} busy={false} plan={markdownOnly} onEdit={onEdit} />);
    fireEvent.click(within(screen.getAllByRole("group", { name: "Selected cards" })[1]!).getByRole("button", { name: "Retire" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("None of the selected cards would change.");
  });

  it("deletes the cards once the user confirms", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { onEdit } = renderActions();
    press("Delete");
    expect(confirm).toHaveBeenCalledWith("Delete 2 cards and their progress? You can undo it until your next edit or until you leave this page.");
    expect(onEdit).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    press("Delete");
    expect(onEdit).toHaveBeenCalledWith({ kind: "remove" }, expect.objectContaining({ remove: ["water", "fire"] }));
  });

  it("states the language of the cards' untagged sides, refusing what is no language code", async () => {
    const { onEdit } = renderActions();
    press("State language");
    expect(within(bulk()).getByRole("button", { name: "State language" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Only a side whose language is not stated yet changes. Its text stays as it is.")).toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), { target: { value: "Japanese" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("“Japanese” is not a language code.");
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), { target: { value: "ja" } });
    choose("Of", "front");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "stateLanguage", tag: "ja", side: "front" }, expect.anything());
    // Made, the form closes.
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Language code" })).not.toBeInTheDocument());
  });

  it("states the language of both sides unless one is chosen, and keeps the form open when the edit fails", async () => {
    const { onEdit } = renderActions(vi.fn(async () => false));
    press("State language");
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), { target: { value: "ja" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "stateLanguage", tag: "ja" }, expect.anything());
    await Promise.resolve();
    expect(screen.getByRole("textbox", { name: "Language code" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Language code" })).not.toBeInTheDocument();
  });

  it("opens the find and replace, which makes the edit it previewed, and closes again", () => {
    const { onEdit } = renderActions();
    press("Find and replace");
    fireEvent.input(screen.getByRole("textbox", { name: "Find" }), { target: { value: "water" } });
    fireEvent.input(screen.getByRole("textbox", { name: "Replace with" }), { target: { value: "aqua" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace in 1 card" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ kind: "replaceText", find: "water", replace: "aqua" }), expect.anything());
    press("Find and replace");
    expect(screen.queryByRole("form", { name: "Find and replace" })).not.toBeInTheDocument();
    press("Find and replace");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Find and replace" })).not.toBeInTheDocument();
  });

  it("makes nothing while an edit is being made", () => {
    renderActions(undefined, true);
    for (const name of ["Retire", "Restore", "Write in Markdown", "Write as plain text", "State language", "Find and replace", "Delete"]) {
      expect(within(bulk()).getByRole("button", { name })).toBeDisabled();
    }
  });
});
