import type { ComponentChildren } from "preact";
/** Trash-bin icon; decorative only — the button provides the label. */
export function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/** Shared frame for the small inline icons next to titles and names. */
function Icon({ children }: { children: ComponentChildren }) {
  return (
    <svg
      class="icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A collection: several decks stacked — the "Decks" list. */
export function CollectionIcon() {
  return (
    <Icon>
      <rect x="3" y="12" width="18" height="8" rx="2" />
      <path d="M5 12V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

/** A deck: a fanned pile of cards. */
export function DeckIcon() {
  return (
    <Icon>
      <rect x="7" y="8" width="13" height="13" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h9" />
    </Icon>
  );
}

/** The Browser: a card with a magnifying glass. */
export function BrowserIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="14" height="16" rx="2" />
      <path d="M7 9h6M7 13h4" />
      <circle cx="17" cy="16" r="3" />
      <path d="m19.5 18.5 2 2" />
    </Icon>
  );
}

/** A single card: front and back. */
export function CardIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 12h18" />
      <path d="M8 8.5h4M8 15.5h6" />
    </Icon>
  );
}

/** A checkmark: done for today. */
export function CheckIcon() {
  return (
    <Icon>
      <path d="m5 12 5 5L20 7" />
    </Icon>
  );
}

/** The deck library: books on a shelf. */
export function LibraryIcon() {
  return (
    <Icon>
      <path d="M4 4h4v16H4zM10 4h4v16h-4z" />
      <path d="m16 5 4-1 4 15-4 1z" transform="translate(-2 0)" />
    </Icon>
  );
}

/** Flame: a streak of study days. */
export function FlameIcon() {
  return (
    <Icon>
      <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5.5C10 9.5 11 11 12 11c0-3-1-6 0-9z" />
    </Icon>
  );
}

/** A deck group, folded shut: a folder. */
export function FolderIcon() {
  return (
    <Icon>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

/** A deck group, open: a folder with its front tipped down. */
export function FolderOpenIcon() {
  return (
    <Icon>
      <path d="M3 17V7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1" />
      <path d="M3 17l2.5-6a1.5 1.5 0 0 1 1.4-1H21l-2.6 7.1a1.5 1.5 0 0 1-1.4.9H4a1 1 0 0 1-1-1z" />
    </Icon>
  );
}

/** A chevron pointing right; turned down (style.css) when what it folds is open. */
export function ChevronIcon() {
  return (
    <Icon>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

/** A pencil: rename. */
export function PencilIcon() {
  return (
    <Icon>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

/** Arrows up and down: move to another place in a list. */
export function MoveIcon() {
  return (
    <Icon>
      <path d="M12 3v18" />
      <path d="m8 7 4-4 4 4" />
      <path d="m8 17 4 4 4-4" />
    </Icon>
  );
}

/** Sun: the light theme. */
export function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

/** Moon: the dark theme. */
export function MoonIcon() {
  return (
    <Icon>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Icon>
  );
}

/** An arrow out of a box: the link opens in a new tab. Decorative; the link says so in words. */
export function ExternalIcon() {
  return (
    <svg
      class="external-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
