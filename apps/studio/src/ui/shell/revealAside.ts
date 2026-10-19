// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * How a screen asks for the aside to be seen: the graph, as a node is
 * selected in its drawing, its search or its tables, whose details the
 * aside shows. On a screen not wide (MEDIUM) the aside is a drawer,
 * closed until asked for, and this opens it, with the focus in it; beside
 * the page it does nothing, the aside shown there or hidden as the user
 * chose. The shell (StudioShell) provides it to the main content.
 */

import { createContext } from "preact";

export const RevealAside = createContext<() => void>(() => undefined);
