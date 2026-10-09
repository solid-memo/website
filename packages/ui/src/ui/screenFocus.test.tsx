import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import type { RouteChange, RouteRef } from "./router";
import { useScreenFocus } from "./screenFocus";

const home: RouteRef = { screen: "instancePicker" };
const other: RouteRef = { screen: "storagePicker" };

function Screen({
  route,
  change,
  children,
}: {
  route: RouteRef | null;
  change: RouteChange;
  children?: ComponentChildren;
}) {
  const ref = useScreenFocus(route, change);
  return (
    <>
      <button>Elsewhere</button>
      {children !== undefined && (
        <div ref={ref} class="screen" data-testid="screen">
          {children}
        </div>
      )}
    </>
  );
}

describe("useScreenFocus", () => {
  afterEach(() => vi.restoreAllMocks());

  it("leaves focus alone on the first render and after a redirect", () => {
    const { rerender } = render(
      <Screen route={home} change="initial">
        <h2>Instances</h2>
      </Screen>,
    );
    expect(document.body).toHaveFocus();
    rerender(
      <Screen route={other} change="replace">
        <h2>Storages</h2>
      </Screen>,
    );
    expect(document.body).toHaveFocus();
  });

  it("focuses the new screen's heading after a navigation, and starts it at the top", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { rerender } = render(
      <Screen route={home} change="initial">
        <h2>Instances</h2>
      </Screen>,
    );
    rerender(
      <Screen route={other} change="push">
        <h2>Storages</h2>
      </Screen>,
    );
    const heading = screen.getByRole("heading", { name: "Storages" });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("focuses the heading of the part a link opens the screen at", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { rerender } = render(<Screen route={home} change="initial" />);
    rerender(
      <Screen route={other} change="pop">
        <h2>Deck preferences</h2>
        <h3 tabIndex={-1} data-arrival>
          Languages
        </h3>
      </Screen>,
    );
    expect(screen.getByRole("heading", { name: "Languages" })).toHaveFocus();
  });

  it("leaves the scroll to the browser on Back/Forward", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { rerender } = render(<Screen route={home} change="initial" />);
    rerender(
      <Screen route={other} change="pop">
        <h2>Storages</h2>
      </Screen>,
    );
    expect(screen.getByRole("heading", { name: "Storages" })).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("waits for a heading that comes once the screen has loaded", async () => {
    const { rerender } = render(<Screen route={home} change="initial" />);
    rerender(<Screen route={other} change="pop" />);
    rerender(
      <Screen route={other} change="pop">
        <p class="loading">Loading…</p>
      </Screen>,
    );
    expect(document.body).toHaveFocus();
    await act(async () => {
      rerender(
        <Screen route={other} change="pop">
          <section>
            <h2>Storages</h2>
          </section>
        </Screen>,
      );
    });
    expect(screen.getByRole("heading", { name: "Storages" })).toHaveFocus();
  });

  it("waits through content swapped in without a render of its own", async () => {
    const { rerender } = render(<Screen route={home} change="initial" />);
    rerender(
      <Screen route={other} change="pop">
        <p class="loading">Loading…</p>
      </Screen>,
    );
    const region = screen.getByTestId("screen");
    // Still loading: focus waits on.
    await act(async () => {
      region.append(document.createElement("p"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body).toHaveFocus();
    const heading = document.createElement("h2");
    heading.textContent = "Storages";
    heading.setAttribute("tabindex", "0");
    await act(async () => {
      region.append(heading);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(heading).toHaveFocus();
    // A heading that is a Tab stop already stays one.
    expect(heading).toHaveAttribute("tabindex", "0");
  });

  it("focuses a screen without a heading itself", () => {
    const { rerender } = render(<Screen route={home} change="initial" />);
    rerender(
      <Screen route={other} change="push">
        <p>Nothing here.</p>
      </Screen>,
    );
    expect(screen.getByTestId("screen")).toHaveFocus();
  });

  it("focuses once per navigation", () => {
    const { rerender } = render(<Screen route={home} change="initial" />);
    rerender(
      <Screen route={other} change="push">
        <h2>Storages</h2>
      </Screen>,
    );
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    rerender(
      <Screen route={other} change="push">
        <h2>Storages</h2>
        <p>More</p>
      </Screen>,
    );
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });
});
