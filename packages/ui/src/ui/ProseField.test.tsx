import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { DataProse } from "./DataText";
import { draftOf } from "./LangTextField";
import { ProseField } from "./ProseField";

function renderField(value: string, markdown: boolean) {
  const onChange = vi.fn();
  const onMarkdown = vi.fn();
  render(
    <ProseField
      id="theory"
      label="Theory"
      role="theory"
      draft={draftOf(value === "" ? undefined : { en: value }, [])}
      markdown={markdown}
      suggestions={[]}
      disabled={false}
      preview={(text, inMarkdown) => <DataProse class="course-theory" text={text} markdown={inMarkdown} />}
      onChange={onChange}
      onMarkdown={onMarkdown}
    />,
  );
  return { onChange, onMarkdown };
}

describe("ProseField", () => {
  it("edits prose in its languages, previewed as the player shows it", () => {
    const { onChange, onMarkdown } = renderField("One.\n\nTwo.", false);
    const theory = screen.getByRole("textbox", { name: "Theory" });
    expect(theory.tagName).toBe("TEXTAREA");
    fireEvent.click(screen.getByRole("button", { name: "Language: English" }));
    expect(screen.getByText("Language of the theory")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Preview of Theory" }).querySelectorAll(".course-theory p")).toHaveLength(2);
    fireEvent.input(theory, { target: { value: "Three." } });
    expect(onChange).toHaveBeenCalledWith([{ id: 0, value: "Three.", tag: "en" }]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Format with Markdown" }));
    expect(onMarkdown).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Formatting help")).toBeNull();
  });

  it("in Markdown, hints at what would not show as meant, by the rules of prose, and offers its cheat sheet", () => {
    renderField("<b>x</b> and a [link](https://example.org)", true);
    expect(screen.getByText("Formatting help")).toBeInTheDocument();
    const theory = screen.getByRole("textbox", { name: "Theory" });
    expect(theory).toHaveAccessibleDescription(/HTML/);
    // Prose may link.
    expect(theory).not.toHaveAccessibleDescription(/link/i);
    expect(screen.getByRole("region", { name: "Preview of Theory" }).querySelector("a")).toHaveAttribute("href", expect.stringContaining("example.org"));
  });

  it("previews nothing before there is text", () => {
    renderField("", false);
    expect(screen.getByRole("region", { name: "Preview of Theory" })).toHaveTextContent("Nothing to show yet.");
  });
});
