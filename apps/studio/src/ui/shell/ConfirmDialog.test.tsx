import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { useConfirm } from "./ConfirmDialog";

/** A button that asks before it deletes Mars. */
function Page({ onConfirm }: { onConfirm: () => void }) {
  const { ask, dialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() => ask({ heading: "Delete the planet", text: "Delete Mars? This cannot be undone.", action: "Delete", onConfirm })}
      >
        Delete Mars
      </button>
      {dialog}
    </>
  );
}

const question = () => screen.queryByRole("dialog", { name: "Delete the planet" });

describe("useConfirm", () => {
  it("asks first, in a dialog whose action has the focus, and does it once confirmed", () => {
    const onConfirm = vi.fn();
    render(<Page onConfirm={onConfirm} />);
    expect(question()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete Mars" }));
    expect(question()).toHaveTextContent("Delete Mars? This cannot be undone.");
    const action = within(question()!).getByRole("button", { name: "Delete" });
    expect(action).toHaveFocus();
    expect(action).toHaveClass("danger");
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(question()).toBeNull();
  });

  it("does nothing on Cancel or Close, the focus back where it was", async () => {
    const onConfirm = vi.fn();
    render(<Page onConfirm={onConfirm} />);
    const opener = screen.getByRole("button", { name: "Delete Mars" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(question()!).getByRole("button", { name: "Cancel" }));
    expect(question()).toBeNull();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(within(question()!).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(question()).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
