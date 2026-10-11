// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Instance } from "@solid-memo/domain/instance";
import { instanceA, instanceB } from "../../test/fixtures";
import { studioRouteToHash } from "../router";
import { InstanceSwitcher } from "./InstanceSwitcher";

const instanceC: Instance = { url: "https://pod.example/solid-memo/c/", name: "Deck set C" };

describe("InstanceSwitcher", () => {
  it("shows the open instance, and switches to another, at its decks, or to all of them", () => {
    render(<InstanceSwitcher instances={[instanceA, instanceB, instanceC]} instance={instanceB} />);
    const button = screen.getByRole("button", { name: "Switch instance: Deck set B" });
    expect(button).toHaveTextContent("Deck set B");
    fireEvent.click(button);
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["Deck set A", studioRouteToHash({ screen: "home", instanceUrl: instanceA.url })],
      ["Deck set C", studioRouteToHash({ screen: "home", instanceUrl: instanceC.url })],
      ["All instances", "#/studio/instances"],
    ]);
    fireEvent.click(items[2]!);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("is not there for a user with one instance", () => {
    const { container } = render(<InstanceSwitcher instances={[instanceA]} instance={instanceA} />);
    expect(container).toBeEmptyDOMElement();
  });
});
