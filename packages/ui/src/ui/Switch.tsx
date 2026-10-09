import type { ComponentChildren } from "preact";

/**
 * An on/off switch: a track with a knob, on the left when off and on the
 * right when on. The knob may carry a small icon for the state it is in.
 */
export function Switch({
  checked,
  label,
  onChange,
  children,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  children?: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
    >
      <span class="switch-knob" aria-hidden="true">
        {children}
      </span>
    </button>
  );
}
