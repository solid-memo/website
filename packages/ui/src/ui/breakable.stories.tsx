// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { breakable } from "./breakable";

/** A name of several occupations, joined by slashes, as the Swedish register writes it. */
const NAME = "Fastighetstekniker/Drifttekniker/Fastighetsskötare, fastighet";

const meta = {
  title: "Basics/breakable",
  render: () => (
    <div style={{ display: "grid", gap: "1rem", maxWidth: "14rem" }}>
      <p>
        <strong>As written:</strong> {NAME}
      </p>
      <p>
        <strong>breakable:</strong> {breakable(NAME)}
      </p>
    </div>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Card text in a narrow column: as written it overflows in the middle of a word; breakable wraps it after its slashes. */
export const InANarrowColumn: Story = {};
