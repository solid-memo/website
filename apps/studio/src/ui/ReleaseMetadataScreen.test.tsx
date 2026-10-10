import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { applyDraftChanges, type CheckActivity, type DraftChange, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseField } from "@solid-memo/domain/release/releaseCheck";
import { createI18n, I18nProvider } from "@solid-memo/ui/i18n";
import type { DraftEditor } from "./draftEditor";
import { languageNameOf, ReleaseMetadataScreen } from "./ReleaseMetadataScreen";
import { courseDraft, DRAFT_URL } from "../test/fixtures";

const idle = { saving: false, failure: null };
const links = { draftsHref: "#/drafts", healthHref: "#/health" };
const ENG = "http://publications.europa.eu/resource/authority/language/ENG";
const SWE = "http://publications.europa.eu/resource/authority/language/SWE";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const PROV = "http://www.w3.org/ns/prov#";
const at = (id: string) => `${DRAFT_URL}#${id}`;
const plain = (value: string) => ({ kind: "literal" as const, value, language: "", datatype: "http://www.w3.org/2001/XMLSchema#string" });

function with_(draft: ReleaseDraft, ...changes: DraftChange[]): ReleaseDraft {
  return applyDraftChanges(draft, changes) as ReleaseDraft;
}

/** The course with an author, Ann, and a source the making used. */
function authoredDraft(): ReleaseDraft {
  return with_(
    courseDraft(),
    { kind: "setAgent", id: "ann", agent: { name: "Ann", mbox: "mailto:ann@example.org" } },
    { kind: "setMeta", meta: { creator: [at("ann")] } },
    { kind: "setAttribution", attribution: { ai: true } },
    {
      kind: "setSource",
      iri: "https://wiki.example/",
      source: { statements: [{ predicate: "http://purl.org/dc/terms/title", object: plain("Wiki") }], derivedFrom: true, used: true },
    },
  );
}

function renderScreen(
  draft: ReleaseDraft = authoredDraft(),
  { onEdit = vi.fn<DraftEditor["edit"]>(() => null), field, readOnly = null }: { onEdit?: ReturnType<typeof vi.fn<DraftEditor["edit"]>>; field?: ReleaseField; readOnly?: "released" | null } = {},
) {
  render(<ReleaseMetadataScreen draft={draft} readOnly={readOnly} status={idle} links={links} {...(field === undefined ? {} : { field })} onEdit={onEdit} />);
  return onEdit;
}

beforeEach(() => localStorage.clear());

describe("ReleaseMetadataScreen", () => {
  it("saves the version notes as they are typed, and clears them when emptied", () => {
    const onEdit = renderScreen();
    expect(screen.getByRole("heading", { level: 2, name: "Release metadata and provenance" })).toBeInTheDocument();
    const notes = screen.getByRole("textbox", { name: "Version notes" });
    fireEvent.input(notes, { target: { value: "First release." } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { versionNotes: "First release." } }], { debounce: true });
    fireEvent.input(notes, { target: { value: " " } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { versionNotes: null } }], { debounce: true });
  });

  it("states the release's languages from the EU's table, keeping one outside it to leave out", () => {
    const draft = with_(authoredDraft(), { kind: "setMeta", meta: { language: [SWE, "https://other.example/lang"] } });
    const onEdit = renderScreen(draft);
    const languages = screen.getByRole("group", { name: "Languages" });
    expect(within(languages).getByRole("checkbox", { name: "Swedish" })).toBeChecked();
    fireEvent.click(within(languages).getByRole("checkbox", { name: "English" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { language: [SWE, "https://other.example/lang", ENG] } }]);
    fireEvent.click(within(languages).getByRole("checkbox", { name: "https://other.example/lang (not in the table)" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { language: [SWE] } }]);
  });

  it("names an EU language in the reader's language, else by the table's label", () => {
    const sv = createI18n("sv");
    expect(languageNameOf({ iri: ENG, code: "ENG", label: "English" }, sv.languageParts)).toBe("engelska");
    expect(languageNameOf({ iri: "x", code: "QQQ", label: "Qq" }, () => ({ name: "qqq" }))).toBe("Qq");
  });

  it("chooses the licence, typed by the change, and the publisher among the release's agents or the one it names", () => {
    const draft = with_(authoredDraft(), { kind: "setMeta", meta: { publisher: "https://index.example/#publisher" } });
    const onEdit = renderScreen(draft);
    fireEvent.change(screen.getByRole("combobox", { name: "Licence" }), { target: { value: CC0 } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setLicense", license: CC0 }]);
    fireEvent.change(screen.getByRole("combobox", { name: "Licence" }), { target: { value: "" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setLicense", license: null }]);
    const publisher = screen.getByRole("combobox", { name: "Publisher" });
    expect(within(publisher).getByRole("option", { name: "https://index.example/#publisher" })).toBeInTheDocument();
    fireEvent.change(publisher, { target: { value: at("ann") } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { publisher: at("ann") } }]);
    fireEvent.change(publisher, { target: { value: "" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { publisher: null } }]);
  });

  it("adds, renames and removes an author, writing the attribution again for those left", () => {
    const draft = with_(authoredDraft(), { kind: "setMeta", meta: { creator: [at("ann"), "https://elsewhere.example/#me"] } });
    const onEdit = renderScreen(draft);
    expect(screen.getByText("Also named, in another document, and kept as they are: https://elsewhere.example/#me")).toBeInTheDocument();
    const ann = screen.getByRole("group", { name: "Ann" });
    expect(within(ann).getByRole("textbox", { name: "Email (optional)" })).toHaveValue("ann@example.org");
    const save = within(ann).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.input(within(ann).getByRole("textbox", { name: "Name" }), { target: { value: "Ann B." } });
    fireEvent.input(within(ann).getByRole("textbox", { name: "Email (optional)" }), { target: { value: "" } });
    fireEvent.click(save);
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "setAttribution", attribution: null },
      { kind: "setAgent", id: "ann", agent: { name: "Ann B." } },
      { kind: "setAttribution", attribution: { ai: true } },
    ]);
    fireEvent.click(within(ann).getByRole("button", { name: "Remove Ann" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "setAttribution", attribution: null },
      { kind: "setMeta", meta: { creator: ["https://elsewhere.example/#me"] } },
      { kind: "setAgent", id: "ann", agent: null },
    ]);
    const add = screen.getByRole("group", { name: "New author" });
    fireEvent.click(within(add).getByRole("button", { name: "Add the author" }));
    expect(within(add).getByText("Write the author's name.")).toBeInTheDocument();
    fireEvent.input(within(add).getByRole("textbox", { name: "Name" }), { target: { value: "Bo Ek" } });
    expect(within(add).queryByText("Write the author's name.")).toBeNull();
    fireEvent.input(within(add).getByRole("textbox", { name: "Email (optional)" }), { target: { value: "bo@example.org" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add the author" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "setAttribution", attribution: null },
      { kind: "setAgent", id: "bo-ek", agent: { name: "Bo Ek", mbox: "mailto:bo@example.org" } },
      { kind: "setMeta", meta: { creator: [at("ann"), "https://elsewhere.example/#me", at("bo-ek")] } },
      { kind: "setAttribution", attribution: { ai: true } },
    ]);
    expect(within(add).getByRole("textbox", { name: "Name" })).toHaveValue("");
  });

  it("keeps a new author's form when the draft refuses it, and shows an author's mbox that is no email as it is", () => {
    const draft = with_(
      courseDraft(),
      { kind: "setAgent", id: "web", agent: { name: "Web", mbox: "tel:123" } },
      { kind: "setAgent", id: "cy", agent: { name: "Cy" } },
      { kind: "setMeta", meta: { creator: [at("web"), at("cy")] } },
    );
    renderScreen(draft, { onEdit: vi.fn<DraftEditor["edit"]>(() => ({ refused: "released" })) });
    expect(within(screen.getByRole("group", { name: "Web" })).getByRole("textbox", { name: "Email (optional)" })).toHaveValue("tel:123");
    expect(within(screen.getByRole("group", { name: "Cy" })).getByRole("textbox", { name: "Email (optional)" })).toHaveValue("");
    const add = screen.getByRole("group", { name: "New author" });
    fireEvent.input(within(add).getByRole("textbox", { name: "Name" }), { target: { value: "Bo" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add the author" }));
    expect(within(add).getByRole("textbox", { name: "Name" })).toHaveValue("Bo");
  });

  it("says a release with no authors has none, and has no attribution to choose", () => {
    renderScreen(courseDraft());
    expect(screen.getByText("No authors yet.")).toBeInTheDocument();
    const attribution = screen.getByRole("group", { name: "Attribution" });
    expect(within(attribution).getAllByRole("radio")).toHaveLength(1);
    expect(within(attribution).getByRole("radio", { name: "No attribution" })).toBeChecked();
    expect(within(attribution).getByText("Name an author first: the attribution names the release's authors.")).toBeInTheDocument();
  });

  it("attributes the release to its authors, with or without AI, and saves the notes on its making", () => {
    const draft = with_(authoredDraft(), { kind: "setMakingNotes", notes: { en: "Sources: 1 document." } });
    const onEdit = renderScreen(draft);
    const attribution = screen.getByRole("group", { name: "Attribution" });
    expect(within(attribution).getByRole("radio", { name: "Compiled by Ann with the help of AI." })).toBeChecked();
    fireEvent.click(within(attribution).getByRole("radio", { name: "Compiled by Ann." }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setAttribution", attribution: { ai: false } }]);
    fireEvent.click(within(attribution).getByRole("radio", { name: "No attribution" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setAttribution", attribution: null }]);
    const notes = screen.getByRole("textbox", { name: "Notes on how it was made" });
    expect(notes).toHaveValue("Sources: 1 document.");
    fireEvent.input(notes, { target: { value: "Sources: 2 documents." } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMakingNotes", notes: { en: "Sources: 2 documents." } }], { debounce: true });
  });

  it("shows a release attributed without AI as such", () => {
    renderScreen(with_(authoredDraft(), { kind: "setAttribution", attribution: { ai: false } }));
    expect(screen.getByRole("radio", { name: "Compiled by Ann." })).toBeChecked();
  });

  it("lists the sources, edits one at a time with its other statements kept, and removes one", () => {
    const draft = with_(authoredDraft(), {
      kind: "setSource",
      iri: "https://source.example/",
      source: {
        statements: [
          { predicate: "http://purl.org/dc/terms/title", object: plain("Source") },
          { predicate: "http://purl.org/dc/terms/license", object: { kind: "iri", value: CC0 } },
          { predicate: "http://purl.org/dc/terms/creator", object: plain("Cy") },
          { predicate: "http://www.w3.org/2000/01/rdf-schema#comment", object: plain("Footer.") },
          { predicate: "http://www.w3.org/2000/01/rdf-schema#comment", object: plain("Kept.") },
        ],
        derivedFrom: true,
        used: true,
      },
    });
    const onEdit = renderScreen(draft);
    const sources = screen.getByRole("heading", { name: "Sources" }).closest("section")!;
    expect(within(sources).getByText("https://source.example/")).toBeInTheDocument();
    expect(within(sources).getByText("Cy · CC0 1.0 · The release is derived from it · This version's making used it")).toBeInTheDocument();
    expect(within(sources).getByText("Wiki")).toBeInTheDocument();
    fireEvent.click(within(sources).getByRole("button", { name: "Edit Source" }));
    const form = within(sources).getByRole("group", { name: "https://source.example/" });
    expect(within(form).getByText("1 more statement of it is kept as it is.")).toBeInTheDocument();
    expect(within(form).getByRole("textbox", { name: "Evidence for its licence" })).toHaveValue("Footer.");
    fireEvent.input(within(form).getByRole("textbox", { name: "Title" }), { target: { value: "The source" } });
    fireEvent.click(within(form).getByRole("checkbox", { name: "This version's making used it" }));
    fireEvent.click(within(form).getByRole("button", { name: "Save the source" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      {
        kind: "setSource",
        iri: "https://source.example/",
        source: {
          statements: [
            { predicate: "http://purl.org/dc/terms/title", object: plain("The source") },
            { predicate: "http://purl.org/dc/terms/creator", object: plain("Cy") },
            { predicate: "http://purl.org/dc/terms/license", object: { kind: "iri", value: CC0 } },
            { predicate: "http://www.w3.org/2000/01/rdf-schema#comment", object: plain("Footer.") },
            { predicate: "http://www.w3.org/2000/01/rdf-schema#comment", object: plain("Kept.") },
          ],
          derivedFrom: true,
          used: false,
        },
      },
    ]);
    expect(within(sources).queryByRole("group", { name: "https://source.example/" })).toBeNull();
    fireEvent.click(within(sources).getByRole("button", { name: "Edit Wiki" }));
    fireEvent.click(within(sources).getByRole("button", { name: "Cancel" }));
    expect(within(sources).queryByRole("button", { name: "Save the source" })).toBeNull();
    fireEvent.click(within(sources).getByRole("button", { name: "Remove Wiki" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setSource", iri: "https://wiki.example/", source: null }]);
  });

  it("keeps a source's form open when the draft refuses the change, and says an earlier version's making used one", () => {
    const base = courseDraft();
    const draft: ReleaseDraft = {
      ...base,
      root: { ...base.root, wasDerivedFrom: [...base.root.wasDerivedFrom, "https://bare.example/"] },
      triples: [...base.triples, { subject: at("old"), predicate: `${PROV}used`, object: { kind: "iri", value: "https://old.example/" } }],
      published: { ids: {}, activities: ["old"] },
    };
    renderScreen(draft, { onEdit: vi.fn<DraftEditor["edit"]>(() => ({ refused: "released" })) });
    expect(screen.getByText("An earlier version's making used it.")).toBeInTheDocument();
    // That making still names it: there is nothing of this version's to remove.
    expect(screen.queryByRole("button", { name: "Remove https://old.example/" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove https://bare.example/" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit https://old.example/" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the source" }));
    expect(screen.getByRole("button", { name: "Save the source" })).toBeInTheDocument();
  });

  it("adds a source by its web address, refusing another address or one listed already", () => {
    const onEdit = renderScreen();
    const add = screen.getByRole("group", { name: "New source" });
    const address = within(add).getByLabelText("Address");
    fireEvent.input(address, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add the source" }));
    expect(within(add).getByText("Give the source's web address, starting with https:// or http://.")).toBeInTheDocument();
    expect(address).toHaveAttribute("aria-invalid", "true");
    fireEvent.input(address, { target: { value: "https://wiki.example/" } });
    expect(address).toHaveAttribute("aria-invalid", "false");
    fireEvent.click(within(add).getByRole("button", { name: "Add the source" }));
    expect(within(add).getByText("The release names this source already.")).toBeInTheDocument();
    fireEvent.input(address, { target: { value: "https://new.example" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Title" }), { target: { value: "New" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Creator" }), { target: { value: "Di" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Licence (its address)" }), { target: { value: CC0 } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Evidence for its licence" }), { target: { value: "Footer: CC0." } });
    fireEvent.click(within(add).getByRole("button", { name: "Add the source" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      {
        kind: "setSource",
        iri: "https://new.example/",
        source: {
          statements: [
            { predicate: "http://purl.org/dc/terms/title", object: plain("New") },
            { predicate: "http://purl.org/dc/terms/creator", object: plain("Di") },
            { predicate: "http://purl.org/dc/terms/license", object: { kind: "iri", value: CC0 } },
            { predicate: "http://www.w3.org/2000/01/rdf-schema#comment", object: plain("Footer: CC0.") },
          ],
          derivedFrom: true,
          used: true,
        },
      },
    ]);
    expect(address).toHaveValue("");
  });

  it("refuses a licence that is not an address, in a new source's form and in one being edited", () => {
    const onEdit = renderScreen();
    const add = screen.getByRole("group", { name: "New source" });
    fireEvent.input(within(add).getByLabelText("Address"), { target: { value: "https://new.example/" } });
    const license = within(add).getByRole("textbox", { name: "Licence (its address)" });
    fireEvent.input(license, { target: { value: "CC BY 4.0" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add the source" }));
    expect(within(add).getByText("Give the licence's web address, starting with https:// or http://, or leave it empty.")).toBeInTheDocument();
    expect(license).toHaveAttribute("aria-invalid", "true");
    expect(within(add).getByLabelText("Address")).toHaveAttribute("aria-invalid", "false");
    fireEvent.input(license, { target: { value: "" } });
    expect(license).toHaveAttribute("aria-invalid", "false");
    onEdit.mockClear();
    const sources = screen.getByRole("heading", { name: "Sources" }).closest("section")!;
    fireEvent.click(within(sources).getByRole("button", { name: "Edit Wiki" }));
    const form = within(sources).getByRole("group", { name: "https://wiki.example/" });
    const edited = within(form).getByRole("textbox", { name: "Licence (its address)" });
    fireEvent.input(edited, { target: { value: "CC BY 4.0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save the source" }));
    expect(within(form).getByText("Give the licence's web address, starting with https:// or http://, or leave it empty.")).toBeInTheDocument();
    expect(edited).toHaveAttribute("aria-invalid", "true");
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.input(edited, { target: { value: CC0 } });
    expect(edited).toHaveAttribute("aria-invalid", "false");
    fireEvent.click(within(form).getByRole("button", { name: "Save the source" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("asks how the release uses a source, in a new source's form and in one being edited", () => {
    const onEdit = renderScreen();
    const unused = "Tick at least one: the release is derived from it, or this version's making used it.";
    const add = screen.getByRole("group", { name: "New source" });
    fireEvent.input(within(add).getByLabelText("Address"), { target: { value: "https://new.example/" } });
    fireEvent.click(within(add).getByRole("checkbox", { name: "The release is derived from it" }));
    fireEvent.click(within(add).getByRole("checkbox", { name: "This version's making used it" }));
    fireEvent.click(within(add).getByRole("button", { name: "Add the source" }));
    expect(within(add).getByText(unused)).toBeInTheDocument();
    const sources = screen.getByRole("heading", { name: "Sources" }).closest("section")!;
    fireEvent.click(within(sources).getByRole("button", { name: "Edit Wiki" }));
    const form = within(sources).getByRole("group", { name: "https://wiki.example/" });
    fireEvent.click(within(form).getByRole("checkbox", { name: "The release is derived from it" }));
    fireEvent.click(within(form).getByRole("checkbox", { name: "This version's making used it" }));
    fireEvent.click(within(form).getByRole("button", { name: "Save the source" }));
    expect(within(form).getByText(unused)).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(within(form).getByRole("checkbox", { name: "The release is derived from it" }));
    expect(within(form).queryByText(unused)).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Save the source" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps a new source's form when the draft refuses it, and says a release without sources has none", () => {
    renderScreen(courseDraft(), { onEdit: vi.fn<DraftEditor["edit"]>(() => ({ refused: "released" })) });
    expect(screen.getByText("No sources yet.")).toBeInTheDocument();
    const add = screen.getByRole("group", { name: "New source" });
    fireEvent.input(within(add).getByLabelText("Address"), { target: { value: "https://new.example/" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add the source" }));
    expect(within(add).getByLabelText("Address")).toHaveValue("https://new.example/");
  });
});

describe("ReleaseMetadataScreen's checks", () => {
  const check: CheckActivity = { check: "ai", label: "Facts", scope: "every step", outcome: "two fixed", endedAt: "2026-10-08T12:00:00Z", language: "en" };

  it("records a check by machine or AI, every text asked, as no human review", () => {
    const onEdit = renderScreen(courseDraft());
    expect(screen.getByText("No checks recorded yet.")).toBeInTheDocument();
    const add = screen.getByRole("group", { name: "New check" });
    fireEvent.click(within(add).getByRole("button", { name: "Record the check" }));
    expect(within(add).getByText("Write what it looked at, its scope and its outcome.")).toBeInTheDocument();
    fireEvent.click(within(add).getByRole("radio", { name: "AI" }));
    expect(within(add).queryByText("Write what it looked at, its scope and its outcome.")).toBeNull();
    fireEvent.input(within(add).getByRole("textbox", { name: "What it looked at" }), { target: { value: "Facts" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Scope" }), { target: { value: "every step" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Outcome" }), { target: { value: "two fixed" } });
    fireEvent.input(within(add).getByLabelText("Ended on"), { target: { value: "" } });
    fireEvent.click(within(add).getByRole("button", { name: "Record the check" }));
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.input(within(add).getByLabelText("Ended on"), { target: { value: "2026-10-08" } });
    fireEvent.change(within(add).getByRole("combobox", { name: "Written in" }), { target: { value: "sv" } });
    fireEvent.click(within(add).getByRole("button", { name: "Record the check" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "addCheckActivity", id: "check-1", activity: { ...check, endedAt: "2026-10-08T00:00:00Z", language: "sv" } },
    ]);
    expect(within(add).getByRole("textbox", { name: "What it looked at" })).toHaveValue("");
    fireEvent.change(within(add).getByRole("combobox", { name: "Written in" }), { target: { value: "en" } });
    expect(within(add).getByRole("combobox", { name: "Written in" })).toHaveValue("en");
  });

  it("writes a new check in Swedish on a Swedish page, never as a human review", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <ReleaseMetadataScreen draft={courseDraft()} readOnly={null} status={idle} links={links} onEdit={vi.fn<DraftEditor["edit"]>(() => null)} />
      </I18nProvider>,
    );
    expect(within(screen.getByRole("group", { name: "Ny kontroll" })).getByRole("combobox", { name: "Skriven på" })).toHaveValue("sv");
    expect(screen.getByText(/Studion kan inte spara någon mänsklig granskning/u)).toBeInTheDocument();
  });

  it("keeps a new check's form when the draft refuses it", () => {
    renderScreen(courseDraft(), { onEdit: vi.fn<DraftEditor["edit"]>(() => ({ refused: "released" })) });
    const add = screen.getByRole("group", { name: "New check" });
    fireEvent.input(within(add).getByRole("textbox", { name: "What it looked at" }), { target: { value: "Facts" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Scope" }), { target: { value: "all" } });
    fireEvent.input(within(add).getByRole("textbox", { name: "Outcome" }), { target: { value: "none" } });
    fireEvent.click(within(add).getByRole("button", { name: "Record the check" }));
    expect(within(add).getByRole("textbox", { name: "What it looked at" })).toHaveValue("Facts");
  });

  it("edits a check, keeping its time on the same day, deletes one, and only deletes one written otherwise", () => {
    const base = with_(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity: check });
    const draft: ReleaseDraft = {
      ...base,
      triples: [
        ...base.triples,
        { subject: at("odd"), predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", object: { kind: "iri", value: `${PROV}Activity` } },
      ],
    };
    const onEdit = renderScreen(draft);
    expect(screen.getByText("Scope: every step; an AI check, not a human review.")).toBeInTheDocument();
    expect(screen.getByText("Facts (AI)")).toBeInTheDocument();
    expect(screen.getByText("Written otherwise than the Studio writes a check: it can be deleted, not edited.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit odd" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove odd" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "deleteActivity", id: "odd" }]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Facts (AI)" }));
    const form = screen.getByRole("group", { name: "Facts (AI)" });
    expect(within(form).getByRole("radio", { name: "AI" })).toBeChecked();
    fireEvent.input(within(form).getByRole("textbox", { name: "Outcome" }), { target: { value: "three fixed" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save the check" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "editCheckActivity", id: "review-1", activity: { ...check, outcome: "three fixed" } }]);
    expect(screen.queryByRole("button", { name: "Save the check" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Facts (AI)" }));
    fireEvent.input(screen.getByLabelText("Ended on", { selector: "#release-check-day" }), { target: { value: "2026-10-09" } });
    fireEvent.click(screen.getByRole("radio", { name: "A machine", checked: false }));
    fireEvent.click(screen.getByRole("button", { name: "Save the check" }));
    expect(onEdit).toHaveBeenLastCalledWith([
      { kind: "editCheckActivity", id: "review-1", activity: { ...check, check: "machine", endedAt: "2026-10-09T00:00:00Z" } },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Facts (AI)" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Save the check" })).toBeNull();
  });

  it("keeps a check's form open when the draft refuses the change, and edits one in Swedish", () => {
    const draft = with_(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity: { ...check, language: "sv" } });
    renderScreen(draft, { onEdit: vi.fn<DraftEditor["edit"]>(() => ({ refused: "released" })) });
    fireEvent.click(screen.getByRole("button", { name: "Edit Facts (AI)" }));
    expect(within(screen.getByRole("group", { name: "Facts (AI)" })).getByRole("combobox", { name: "Written in" })).toHaveValue("sv");
    fireEvent.click(screen.getByRole("button", { name: "Save the check" }));
    expect(screen.getByRole("button", { name: "Save the check" })).toBeInTheDocument();
  });

  it("shows the checks carried from earlier versions as they are", () => {
    const base = with_(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity: check });
    const draft: ReleaseDraft = {
      ...base,
      triples: [...base.triples, { subject: at("bare"), predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", object: { kind: "iri", value: `${PROV}Activity` } }],
      published: { ids: {}, activities: ["review-1", "bare"] },
    };
    renderScreen(draft);
    expect(screen.getByText("No checks recorded yet.")).toBeInTheDocument();
    const carried = screen.getByRole("heading", { name: "From earlier versions" }).parentElement!;
    expect(within(carried).getByText("Facts (AI)")).toBeInTheDocument();
    expect(within(carried).getByText("bare")).toBeInTheDocument();
    expect(within(carried).queryByRole("button", { name: /Edit|Remove/ })).toBeNull();
  });
});

describe("ReleaseMetadataScreen, held", () => {
  it("opens at the part the release check links to", () => {
    for (const [field, name] of [
      ["authors", "Authors"],
      ["making", "How it was made"],
      ["sources", "Sources"],
      ["checks", "Checks"],
    ] as const) {
      renderScreen(authoredDraft(), { field });
      expect(screen.getByRole("heading", { level: 3, name })).toHaveAttribute("data-arrival", "true");
      cleanup();
    }
    renderScreen(authoredDraft(), { field: "versionNotes" });
    expect(screen.getByRole("textbox", { name: "Version notes" })).toHaveAttribute("data-arrival", "true");
    cleanup();
    renderScreen(authoredDraft(), { field: "languages" });
    expect(screen.getByRole("group", { name: "Languages" })).toHaveAttribute("data-arrival", "true");
    cleanup();
    renderScreen(authoredDraft(), { field: "license" });
    expect(screen.getByRole("combobox", { name: "Licence" }).parentElement).toHaveAttribute("data-arrival", "true");
    cleanup();
    renderScreen(authoredDraft(), { field: "publisher" });
    expect(screen.getByRole("combobox", { name: "Publisher" })).toHaveAttribute("data-arrival", "true");
  });

  it("changes nothing in a draft released", () => {
    renderScreen(authoredDraft(), { readOnly: "released" });
    expect(screen.getByRole("textbox", { name: "Version notes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record the check" })).toBeDisabled();
  });
});
