// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { RegistrationOptions } from "@solid-memo/domain/instance";
import type { TypeIndexChoice } from "@solid-memo/domain/typeIndexChoice";
import { REGISTRATION_OPTIONS } from "../test/fakes/instances";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";

const PRIVATE = "https://pod.example/settings/privateTypeIndex.ttl";
const PUBLIC = "https://pod.example/settings/publicTypeIndex.ttl";
const PUBLIC_MEANS =
  "Public: anyone can see that this instance exists, its name and where it is. Who can open it is still decided by its access settings.";

function choice(url: string, extra: Partial<TypeIndexChoice> = {}): TypeIndexChoice {
  return {
    url,
    kinds: ["private"],
    fromPreferences: false,
    typeFit: "match",
    holdsInstances: false,
    readableByAnyone: false,
    ...extra,
  };
}

function optionsOf(indexes: TypeIndexChoice[]): RegistrationOptions {
  return {
    privateIndexExists: indexes.some((index) => index.kinds.includes("private")),
    publicIndexExists: indexes.some((index) => index.kinds.includes("public")),
    indexes,
  };
}

describe("RegistrationTargetChooser", () => {
  it("offers the two kinds while the options load, with no warning", () => {
    render(<RegistrationTargetChooser options={null} value="private" onChange={vi.fn()} />);
    expect(screen.queryByText(/no private type index/i)).toBeNull();
    expect(screen.getByLabelText("Private type index")).toBeChecked();
    expect(screen.getByLabelText("Public type index")).toHaveAccessibleDescription(PUBLIC_MEANS);
    expect(screen.queryByLabelText("Another type index in your Pod")).toBeNull();
  });

  it("offers each index by its address, the best private one checked as recommended", () => {
    render(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value="private"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no private type index/i)).toBeNull();
    // What a type index is describes the group alone.
    expect(screen.getByRole("group", { name: "Register in" })).toHaveAccessibleDescription(
      "A type index is a list in your profile that tells apps where your data is. Only you can see a private one.",
    );
    const recommended = screen.getByLabelText(`Private type index (Recommended)${PRIVATE}`);
    expect(recommended).toBeChecked();
    expect(recommended).not.toHaveAccessibleDescription();
    // What public means is said of the public one.
    expect(screen.getByLabelText(`Public type index${PUBLIC}`)).toHaveAccessibleDescription(
      PUBLIC_MEANS,
    );
  });

  it("checks the best index of the kind asked for, or the one asked for by its address", () => {
    const { rerender } = render(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value="public"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^Public type index/)).toBeChecked();
    rerender(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value={{ indexUrl: PRIVATE }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^Private type index/)).toBeChecked();
    expect(screen.queryByLabelText("Address of the type index")).toBeNull();
  });

  it("warns and offers to create the kinds the user has none of, the private one recommended", () => {
    const { rerender } = render(
      <RegistrationTargetChooser options={optionsOf([])} value="private" onChange={vi.fn()} />,
    );
    expect(screen.getByText(/no private type index yet/i)).toBeInTheDocument();
    // The warning describes the group, heard on tabbing to a choice.
    expect(screen.getByRole("group", { name: "Register in" })).toHaveAccessibleDescription(
      /^A type index is a list in your profile.*no private type index yet/i,
    );
    expect(
      screen.getByLabelText("Private type index (will be created) (Recommended)"),
    ).toBeChecked();
    expect(screen.getByLabelText("Public type index (will be created)")).not.toBeChecked();
    rerender(
      <RegistrationTargetChooser options={optionsOf([])} value="public" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Public type index (will be created)")).toBeChecked();
  });

  it("says what is known of each index: what it holds, and what may make it the wrong one", () => {
    render(
      <RegistrationTargetChooser
        options={optionsOf([
          choice("https://pod.example/a.ttl", { holdsInstances: true }),
          choice("https://pod.example/b.ttl", { typeFit: "other" }),
          choice("https://pod.example/c.ttl", { readableByAnyone: true }),
          choice("https://pod.example/d.ttl", {
            kinds: ["private", "public"],
            typeFit: "none",
            readableByAnyone: null,
          }),
          choice("https://pod.example/e.ttl", {
            kinds: ["public"],
            typeFit: "other",
            readableByAnyone: true,
          }),
          choice("https://pod.example/f.ttl", { kinds: ["public"], readableByAnyone: false }),
        ])}
        value="private"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/a\.ttl$/)).toHaveAccessibleDescription(
      "Already lists Solid Memo instances.",
    );
    expect(screen.getByLabelText(/b\.ttl$/)).toHaveAccessibleDescription(
      "It says it is a public type index.",
    );
    expect(screen.getByLabelText(/c\.ttl$/)).toHaveAccessibleDescription(
      "Anyone can read it, so everything registered in it can be seen by anyone.",
    );
    // One document linked as both kinds is offered once, as both.
    expect(screen.getAllByLabelText(/d\.ttl$/)).toHaveLength(1);
    expect(screen.getByLabelText(/d\.ttl$/)).toHaveAccessibleName(
      "Private and public type index https://pod.example/d.ttl",
    );
    expect(screen.getByLabelText(/d\.ttl$/)).toHaveAccessibleDescription(
      `Your profile links it as both your private and your public type index, so it isn't clear who may read it. ${PUBLIC_MEANS}`,
    );
    expect(screen.getByLabelText(/e\.ttl$/)).toHaveAccessibleDescription(
      `It says it is a private type index. ${PUBLIC_MEANS}`,
    );
    expect(screen.getByLabelText(/f\.ttl$/)).toHaveAccessibleDescription(
      `Only you can read it, so other apps won't find what is registered in it. ${PUBLIC_MEANS}`,
    );
  });

  it("notifies on selection changes", () => {
    const onChange = vi.fn();
    render(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value="private"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^Public type index/));
    expect(onChange).toHaveBeenLastCalledWith({ indexUrl: PUBLIC });
  });

  it("notifies the kind while the options load", () => {
    const onChange = vi.fn();
    render(<RegistrationTargetChooser options={null} value="private" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Public type index"));
    expect(onChange).toHaveBeenLastCalledWith("public");
  });

  it("takes another type index of the user's by its address", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value="private"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Another type index in your Pod"));
    expect(onChange).toHaveBeenLastCalledWith({ indexUrl: "" });
    rerender(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value={{ indexUrl: "" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Another type index in your Pod")).toBeChecked();
    const address = screen.getByLabelText("Address of the type index");
    expect(address).toBeRequired();
    expect(address).toHaveAccessibleDescription(
      "It must be in your Pod and say it is a type index. Solid Memo links it from your profile if it isn't already.",
    );
    fireEvent.input(address, { target: { value: " https://pod.example/old/index.ttl " } });
    expect(onChange).toHaveBeenLastCalledWith({ indexUrl: "https://pod.example/old/index.ttl" });
  });

  it("keeps the address of another type index it was given", () => {
    const onChange = vi.fn();
    render(
      <RegistrationTargetChooser
        options={REGISTRATION_OPTIONS}
        value={{ indexUrl: "https://pod.example/old/index.ttl" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Address of the type index")).toHaveValue(
      "https://pod.example/old/index.ttl",
    );
    fireEvent.click(screen.getByLabelText(/^Private type index/));
    fireEvent.click(screen.getByLabelText("Another type index in your Pod"));
    expect(onChange).toHaveBeenLastCalledWith({ indexUrl: "https://pod.example/old/index.ttl" });
  });
});
