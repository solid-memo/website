// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import * as icons from "./icons";

const meta = {
  title: "Basics/Icons",
  render: () => (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))",
        gap: "1rem",
        listStyle: "none",
        padding: 0,
      }}
    >
      {Object.entries(icons).map(([name, Icon]) => (
        <li key={name} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Icon />
          <code>{name}</code>
        </li>
      ))}
    </ul>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every icon of the app, with its name: decorative, each drawn in the text's color. */
export const AllIcons: Story = {};
