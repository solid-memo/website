// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { act } from "@testing-library/preact";
import { expect, vi } from "vitest";
import { MEDIUM, NARROW } from "../ui/shell/workspaceLayout";

/**
 * A screen as narrow as a phone's (NARROW, and MEDIUM), or (`medium`)
 * as a tablet's (MEDIUM only), and a way to widen it, and to make it
 * as narrow again, as the browser says it.
 */
export function narrowScreen(medium = false) {
  const listeners = new Set<() => void>();
  let wide = false;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    expect([NARROW, MEDIUM]).toContain(query);
    return {
      get matches() {
        return !wide && (query === MEDIUM || !medium);
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;
  });
  const resize = (to: boolean) => {
    wide = to;
    act(() => listeners.forEach((listener) => listener()));
  };
  return {
    widen: () => resize(true),
    narrow: () => resize(false),
  };
}

/** A screen wide enough for the aside beside the main content (the test DOM's is not). */
export const wideScreen = () => narrowScreen().widen();
