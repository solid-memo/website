// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { ZoomableImage } from "./ZoomableImage";

/** A flag of three bands, drawn here: nothing is fetched. */
const FLAG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#006aa7"/><rect x="90" width="40" height="200" fill="#fecc00"/><rect y="80" width="300" height="40" fill="#fecc00"/></svg>',
)}`;

const meta = {
  title: "Basics/ZoomableImage",
  component: ZoomableImage,
  args: { class: "card-image", src: FLAG, alt: "Flag of Sweden" },
} satisfies Meta<typeof ZoomableImage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card's picture: a tap or Enter enlarges it over the dimmed page; a pinch or a double tap zooms it. */
export const CardPicture: Story = {};

/** Its description in another language than the page's, marked so. */
export const DescriptionInSwedish: Story = { args: { alt: "Sveriges flagga", lang: "sv" } };

/** A picture that takes the place of what had the focus, its button focused. */
export const TakesFocus: Story = { args: { takeFocus: true } };
