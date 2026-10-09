import { describe, expect, it } from "vitest";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { fireEvent, render, screen } from "@testing-library/preact";
import { focusScreen, usePanelFocus } from "./panelFocus";

function Panel({ focus }: { focus?: boolean }) {
  const ref = usePanelFocus<HTMLDivElement>(focus);
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      <button>Inside</button>
    </div>
  );
}

/** An opener that stays, and a panel below it, as the guest's Discard does. */
function StayingOpener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div>
          <Panel />
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
      <button>Elsewhere</button>
    </>
  );
}

/** An opener the panel takes the place of, as most do. */
function ReplacedOpener() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <div class="screen">
        <h2>Screen</h2>
      </div>
      {open ? <PanelWithClose onClose={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>Open</button>}
    </main>
  );
}

function PanelWithClose({ onClose }: { onClose: () => void }) {
  const ref = usePanelFocus<HTMLDivElement>();
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      <button onClick={onClose}>Close</button>
    </div>
  );
}

describe("usePanelFocus", () => {
  it("focuses the panel as it mounts, unless told not to", () => {
    const { unmount } = render(<Panel />);
    expect(screen.getByTestId("panel")).toHaveFocus();
    unmount();
    render(<Panel focus={false} />);
    expect(screen.getByTestId("panel")).not.toHaveFocus();
  });

  it("gives the focus back to the opener when it is still there", () => {
    render(<StayingOpener />);
    const open = screen.getByRole("button", { name: "Open" });
    open.focus();
    fireEvent.click(open);
    expect(screen.getByTestId("panel")).toHaveFocus();
    screen.getByRole("button", { name: "Inside" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(open).toHaveFocus();
  });

  it("leaves the focus be when it is elsewhere as the panel goes", () => {
    render(<StayingOpener />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(elsewhere).toHaveFocus();
  });

  it("focuses the screen's heading when the opener is gone, or the focus was lost", () => {
    render(<ReplacedOpener />);
    const open = screen.getByRole("button", { name: "Open" });
    open.focus();
    fireEvent.click(open);
    expect(screen.getByTestId("panel")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const heading = screen.getByRole("heading", { name: "Screen" });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");

    // Lost meanwhile (a busy button disabled): the same.
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(heading).toHaveFocus();
  });

  it("does not hand the focus back to what was inside the panel", () => {
    function Holder({ shown }: { shown: boolean }) {
      return <main>{shown && <PanelFocusingChild />}</main>;
    }
    function PanelFocusingChild() {
      const ref = usePanelFocus<HTMLDivElement>();
      return (
        <div ref={ref} tabIndex={-1}>
          <SelfFocusingField />
        </div>
      );
    }
    // Its layout effect runs before the panel's: the focus is inside the panel as it mounts.
    function SelfFocusingField() {
      const ref = useRef<HTMLInputElement>(null);
      useLayoutEffect(() => ref.current!.focus(), []);
      return <input ref={ref} aria-label="Field" />;
    }
    const { rerender } = render(<Holder shown />);
    screen.getByLabelText("Field").focus();
    rerender(<Holder shown={false} />);
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("focusScreen", () => {
  it("focuses the main content when the screen has no heading, keeping a tabindex of its own", () => {
    render(<main tabIndex={0}>Loading</main>);
    focusScreen();
    expect(screen.getByRole("main")).toHaveFocus();
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "0");
  });

  it("does nothing on a page without either", () => {
    render(<p>Nothing</p>);
    const before = document.activeElement;
    focusScreen();
    expect(document.activeElement).toBe(before);
  });
});
