import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { InstanceCreator } from "./InstanceCreator";
import type { Storage } from "@solid-memo/domain/storage";

const storage: Storage = { url: "https://pod.example/", source: "profile" };

function renderCreator(
  overrides: Partial<Parameters<typeof InstanceCreator>[0]> = {},
) {
  const props = {
    storage,
    options: { privateIndexExists: true, publicIndexExists: true },
    busy: false,
    error: null,
    onCreate: vi.fn(),
    backHref: "#/instances",
    ...overrides,
  };
  const view = render(<InstanceCreator {...props} />);
  return { ...view, props };
}

describe("InstanceCreator", () => {
  it("prefills the location from the chosen storage", () => {
    renderCreator();
    expect(screen.getByLabelText("Location")).toHaveValue(
      "https://pod.example/solid-memo/main/",
    );
  });

  it("creates an instance with trimmed values and the chosen target", () => {
    const { props, container } = renderCreator();
    fireEvent.input(screen.getByLabelText("Name"), {
      target: { value: " Japanese study " },
    });
    fireEvent.input(screen.getByLabelText("Location"), {
      target: { value: " https://pod.example/solid-memo/japanese/ " },
    });
    fireEvent.click(screen.getByLabelText("Public type index"));
    fireEvent.submit(container.querySelector("form")!);

    expect(props.onCreate).toHaveBeenCalledWith({
      containerUrl: "https://pod.example/solid-memo/japanese/",
      name: "Japanese study",
      registrationTarget: "public",
    });
  });

  it("explains what an instance is and where it is kept", () => {
    renderCreator();
    expect(
      screen.getByText(/An instance is one collection of your decks/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toHaveAccessibleDescription(
      "The folder in your Pod where this instance keeps its decks and study.",
    );
  });

  it("links back to the instance picker", () => {
    renderCreator();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "#/instances");
  });

  it("disables the form while busy and shows errors", () => {
    renderCreator({ busy: true, error: "create failed" });
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create instance" }),
    ).toBeDisabled();
    expect(screen.getByText("create failed")).toBeInTheDocument();
  });
});
