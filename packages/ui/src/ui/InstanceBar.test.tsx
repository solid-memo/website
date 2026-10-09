import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { InstanceBar } from "./InstanceBar";
import type { Instance } from "@solid-memo/domain/instance";
import { routeToHash, studioHref } from "./router";

const instance: Instance = {
  url: "https://pod.example/solid-memo/main/",
  name: "Japanese study",
};

function renderBar(shown: Instance = instance) {
  render(<InstanceBar instance={shown} />);
}

describe("InstanceBar", () => {
  it("says a guest's instance is kept in this browser, and links nowhere outside the site", () => {
    renderBar({ url: "https://guest.solid-memo.invalid/solid-memo/", name: "My study" });
    expect(screen.getByText("Kept in this browser")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^#\//);
    }
  });

  it("is a navigation landmark named for the instance", () => {
    renderBar();
    expect(screen.getByRole("navigation", { name: "Instance" })).toBeInTheDocument();
  });

  it("shows the instance name", () => {
    renderBar();
    expect(screen.getByText("Japanese study")).toBeInTheDocument();
  });

  it("links the instance's folder in the Pod by what it is, not by its address", () => {
    renderBar();
    expect(screen.getByRole("link", { name: "Open in your Pod (opens in a new tab)" })).toHaveAttribute(
      "href",
      instance.url,
    );
  });

  it("links to the instance's statistics and preferences, to the instance in the Studio, and to the instance picker", () => {
    renderBar();
    const bar = within(screen.getByRole("navigation"));
    expect(bar.getByRole("link", { name: "Statistics" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "statistics", instanceUrl: instance.url }),
    );
    expect(bar.getByRole("link", { name: "Preferences" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "preferences", instanceUrl: instance.url }),
    );
    expect(bar.getByRole("link", { name: "Open in Studio" })).toHaveAttribute("href", studioHref(instance.url));
    expect(bar.getByRole("link", { name: "Switch instance" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "instancePicker" }),
    );
    expect(bar.queryByRole("button")).toBeNull();
  });
});
