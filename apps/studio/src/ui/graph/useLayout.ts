// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A graph's layout (layout.ts) worked out without holding the page up:
 * a batch of steps at a time, each as many as fit in a frame's share of
 * time, the page free to draw and answer between them, and how far it
 * is said as it goes. Making the layout is a batch of its own, as is
 * handing over the positions and routes it ends with. Leaving the
 * screen stops it. A layout finished is
 * kept for the page's life (useRemembered), under the instance, with
 * the mark of the graph it is of: coming back to the same graph draws it
 * at once, and a graph changed since is laid out afresh.
 */

import { useEffect, useMemo, useState } from "preact/hooks";
import type { InstanceGraph } from "@solid-memo/domain/instanceGraph";
import { useRemembered } from "@solid-memo/ui/remembered";
import { createLayout, graphFingerprint, type Positions, type Routes } from "./layout";

/** How long a batch of steps may run, in milliseconds, so the page still draws at a good pace. */
const BATCH_MS = 12;

interface KeptLayout {
  fingerprint: string;
  positions: Positions;
  routes: Routes;
}

/**
 * The layout of `graph`, kept under `key` (an instance's): its positions
 * and routes once done, null until then, and how far it is (0 to 1). It runs only
 * while `run`, as the graph is to be drawn. `clock` tells the time, in
 * milliseconds.
 */
export function useLayout(
  key: string,
  graph: InstanceGraph,
  run: boolean,
  clock: () => number = () => performance.now(),
): { laid: { positions: Positions; routes: Routes } | null; progress: number } {
  const fingerprint = useMemo(() => graphFingerprint(graph), [graph]);
  const [kept, keep] = useRemembered<KeptLayout | null>(`studio.graphLayout.${key}`, null);
  const [progress, setProgress] = useState(0);
  const laid = kept?.fingerprint === fingerprint ? kept : null;

  useEffect(() => {
    if (!run || laid !== null) return;
    setProgress(0);
    let layout: ReturnType<typeof createLayout> | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const batch = () => {
      const start = clock();
      let done = 0;
      do done = layout!.step(1);
      while (!layout!.done && clock() - start < BATCH_MS);
      setProgress(done);
      timer = setTimeout(layout!.done ? finish : batch, 0);
    };
    const finish = () => {
      const positions = layout!.positions();
      const routes = layout!.routes();
      keep(() => ({ fingerprint, positions, routes }));
    };
    timer = setTimeout(() => {
      layout = createLayout(graph);
      timer = setTimeout(batch, 0);
    }, 0);
    return () => clearTimeout(timer);
  }, [fingerprint, run, laid === null]);

  return { laid, progress };
}
