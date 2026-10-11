import { useRef } from "preact/hooks";
import { draggedSize, splitterKey, type PaneSize } from "./splitter";

/**
 * A bar that sizes the pane after it (`controls`): the aside's width
 * (`vertical`, a bar left of it) or the dock's height (`horizontal`, a
 * bar above it). It is a focusable separator, as screen readers know
 * one, its value the pane's size in CSS pixels: the arrow keys move it
 * (splitterKey), Home and End make the pane as small or as big as it
 * may be, and the pointer drags it. Each size it gives goes to
 * `onChange`.
 */
export function Splitter({
  label,
  controls,
  orientation,
  value,
  size,
  onChange,
}: {
  label: string;
  /** The id of the pane it sizes. */
  controls: string;
  orientation: "vertical" | "horizontal";
  value: number;
  size: PaneSize;
  onChange: (value: number) => void;
}) {
  // Where a drag began: the pointer along the bar's axis, and the pane's size then.
  const drag = useRef<{ start: number; from: number } | null>(null);
  const along = (event: PointerEvent) =>
    orientation === "vertical" ? event.clientX : event.clientY;

  return (
    <div
      role="separator"
      class={`studio-splitter studio-splitter-${orientation}`}
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      onKeyDown={(event) => {
        const next = splitterKey(event.key, orientation, value, size);
        if (next === null) return;
        event.preventDefault();
        onChange(next);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { start: along(event), from: value };
      }}
      onPointerMove={(event) => {
        if (drag.current !== null)
          onChange(draggedSize(drag.current.from, drag.current.start, along(event), size));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    />
  );
}
