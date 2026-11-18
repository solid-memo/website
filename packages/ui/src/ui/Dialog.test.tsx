// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("closes on its Close, giving the focus back to where it was", async () => {
    function Opener() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            Keys
          </button>
          {shown && (
            <Dialog heading="Keys" class="key-help" onClose={() => setShown(false)}>
              <p>Nothing to focus</p>
            </Dialog>
          )}
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Keys" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Keys" })).toHaveClass("dialog", "key-help");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });

  it("gives its content the dialog to close it by, and its keys to onKeyDown", () => {
    const ref: { current: HTMLDialogElement | null } = { current: null };
    const onKeyDown = vi.fn();
    const onClose = vi.fn();
    render(
      <Dialog heading="Pause" dialogRef={ref} onClose={onClose} onKeyDown={onKeyDown}>
        <button type="button" onClick={() => ref.current!.close()}>
          Done
        </button>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Done" }), { key: "j" });
    expect(onKeyDown).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  // Last: the test DOM keeps the focus it gave the field from the next test's opener.
  it("opens as a modal named by its heading, its field marked autoFocus focused", () => {
    render(
      <Dialog heading="Find and replace" onClose={() => {}}>
        <input aria-label="Find" autoFocus />
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Find and replace" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveClass("dialog");
    expect(screen.getByRole("textbox", { name: "Find" })).toHaveFocus();
  });
});
