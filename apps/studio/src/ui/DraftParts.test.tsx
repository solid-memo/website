import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { AppError } from "@solid-memo/domain/appError";
import { DataProse } from "@solid-memo/ui/DataText";
import { DraftProseField, DraftScope, DraftStatus, DraftTextField, IdField } from "./DraftParts";
import { courseDraft } from "../test/fixtures";

beforeEach(() => localStorage.clear());

/** States the language of the field's main text: English. */
function pickEnglish() {
  fireEvent.click(screen.getByRole("button", { name: "Language: not stated" }));
  fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
}

describe("DraftStatus", () => {
  it("says whether the changes are saved", () => {
    const { rerender } = render(<DraftStatus editor={{ saving: true, failure: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    rerender(<DraftStatus editor={{ saving: false, failure: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved.");
  });

  it("says why a change was refused, or a write failed", () => {
    const { rerender } = render(<DraftStatus editor={{ saving: false, failure: { refusal: { refused: "published", of: "card", id: "q-1" } } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("An earlier release published “q-1”: it can be retired, never deleted.");
    expect(screen.getByRole("status")).toHaveTextContent("");
    rerender(<DraftStatus editor={{ saving: false, failure: { refusal: { refused: "notACourse" } } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Only a course has chapters, steps and questions.");
    rerender(<DraftStatus editor={{ saving: false, failure: { error: new AppError("draftGone") } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("That draft no longer exists.");
  });
});

describe("DraftScope", () => {
  it("holds a draft released, and says where its next version starts", () => {
    render(
      <DraftScope readOnly="released" draftsHref="#/drafts" healthHref="#/health">
        <button type="button">Change</button>
      </DraftScope>,
    );
    expect(screen.getByText(/This draft was released, so it is frozen/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "the drafts" })).toHaveAttribute("href", "#/drafts");
    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
  });

  it("says why the data check holds it, and lets it be changed when nothing does", () => {
    const { rerender } = render(
      <DraftScope readOnly="checking" draftsHref="#/drafts" healthHref="#/health">
        <button type="button">Change</button>
      </DraftScope>,
    );
    expect(screen.getByText(/being checked/)).toBeInTheDocument();
    rerender(
      <DraftScope readOnly={null} draftsHref="#/drafts" healthHref="#/health">
        <button type="button">Change</button>
      </DraftScope>,
    );
    expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();
  });
});

describe("DraftTextField", () => {
  it("saves the text as it is typed, once its language is chosen", () => {
    const onSave = vi.fn();
    render(<DraftTextField id="title" label="Title" role="title" field="the title" text={undefined} disabled={false} onSave={onSave} />);
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Pods" } });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Choose the language of the title to save it.")).toBeInTheDocument();
    pickEnglish();
    expect(onSave).toHaveBeenLastCalledWith({ en: "Pods" });
    expect(screen.queryByText("Choose the language of the title to save it.")).toBeNull();
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), { target: { value: "" } });
    expect(onSave).toHaveBeenLastCalledWith({});
  });

  it("starts from the text saved, in the language last chosen for a deck's text when there is none", () => {
    localStorage.setItem("solid-memo:recentLanguages.deck", JSON.stringify(["sv"]));
    const onSave = vi.fn();
    render(<DraftTextField id="title" label="Title" role="title" field="the title" text={undefined} multiline disabled={false} onSave={onSave} />);
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Poddar" } });
    expect(onSave).toHaveBeenCalledWith({ sv: "Poddar" });
  });
});

describe("DraftProseField", () => {
  const preview = (text: Record<string, string>, markdown: boolean) => <DataProse class="course-theory" text={text} markdown={markdown} />;

  it("saves the prose and its format, previewing it as the course shows it", () => {
    const onSave = vi.fn();
    render(
      <DraftProseField id="theory" label="Theory" role="theory" field="the theory" text={{ en: "Old" }} markdown={false} disabled={false} preview={preview} onSave={onSave} />,
    );
    expect(document.querySelector(".prose-preview .course-theory")).toHaveTextContent("Old");
    fireEvent.input(screen.getByRole("textbox", { name: "Theory" }), { target: { value: "## New" } });
    expect(onSave).toHaveBeenLastCalledWith({ en: "## New" }, false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Format with Markdown" }));
    expect(onSave).toHaveBeenLastCalledWith({ en: "## New" }, true);
    // A heading shows as the app shows one: in bold.
    expect(document.querySelector(".prose-preview .course-theory.md strong")).toHaveTextContent("New");
  });

  it("switches the format without saving text whose language is not chosen", () => {
    const onSave = vi.fn();
    render(<DraftProseField id="theory" label="Theory" role="theory" field="the theory" text={undefined} markdown disabled={false} preview={preview} onSave={onSave} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Theory" }), { target: { value: "Text" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Format with Markdown" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Choose the language of the theory to save it.")).toBeInTheDocument();
  });
});

describe("IdField", () => {
  it("says why an id cannot be a new subject's", () => {
    const onChange = vi.fn();
    const { rerender } = render(<IdField id="new" draft={courseDraft()} value="ch-new" onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "Id" });
    expect(field).toHaveAttribute("aria-invalid", "false");
    expect(field).toHaveAccessibleDescription(/never changed once published/);
    fireEvent.input(field, { target: { value: "ch-pods" } });
    expect(onChange).toHaveBeenCalledWith("ch-pods");
    rerender(<IdField id="new" draft={courseDraft()} value="ch-pods" onChange={onChange} />);
    expect(field).toHaveAccessibleDescription("This draft, or a release before it, already has this id.");
    rerender(<IdField id="new" draft={courseDraft()} value="-x" onChange={onChange} />);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/An id is letters A to Z/);
  });
});
