/**
 * A loading state: four dots in the logotype's colours bouncing in turn,
 * next to a label saying what is on its way. The dots are decoration; the
 * label is what assistive technology announces.
 */
export function Loading({ label }: { label: string }) {
  return (
    <p class="loading" role="status">
      <LoadingDots />
      {label}
    </p>
  );
}

/** The bouncing dots alone, for a loading state inside a row or a slot. */
export function LoadingDots() {
  return (
    <span class="loading-dots" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
