import { createContext, createPortal, type ComponentChildren } from "preact";
import { useContext, useId, useLayoutEffect, useRef } from "preact/hooks";
import { MoreIcon } from "./icons";

/** The room kept between the menu and the viewport's edges, in px. */
export const MENU_EDGE = 8;
/** The room between the menu and its button, in px. */
export const MENU_GAP = 4;

interface Size {
  width: number;
  height: number;
}

/**
 * Where a menu of `menu`'s size goes, in the viewport: right-aligned
 * under its button, or above it when there is no room below and there
 * is above; never past the viewport's edges, the left one winning.
 */
export function placeMenu(
  button: Pick<DOMRect, "top" | "bottom" | "right">,
  menu: Size,
  viewport: Size,
): { top: number; left: number } {
  const left = Math.max(MENU_EDGE, Math.min(button.right - menu.width, viewport.width - MENU_EDGE - menu.width));
  const below = button.bottom + MENU_GAP;
  const above = button.top - MENU_GAP - menu.height;
  if (below + menu.height <= viewport.height - MENU_EDGE || above < MENU_EDGE) {
    return { left, top: Math.max(MENU_EDGE, Math.min(below, viewport.height - MENU_EDGE - menu.height)) };
  }
  return { left, top: above };
}

/** What an item does as it is chosen, given by the menu it is in. */
const Choose = createContext<((action?: () => void) => void) | null>(null);

/**
 * A button that opens a menu of what can be done with a thing (the
 * WAI-ARIA menu button): a press, Enter, Space or Down opens it on its
 * first item, Up on its last. In the menu, Up and Down go round the
 * items, Home and End to the first and last; Escape closes it, back on
 * the button, and Tab closes it and goes on from the button; so does a
 * press anywhere else, leaving focus there. Choosing an item closes it,
 * focus back on the button, before the item does what it does, which
 * may take focus on from there; so does pressing the button again.
 *
 * The menu is laid over the page (a portal, fixed in the viewport), so
 * no list it is in clips it, never taller or wider than the viewport,
 * and follows its button as the page scrolls or resizes, closing once
 * the button is out of sight. Whether it is open is the owner's: one menu of a
 * list at a time.
 */
export function ActionsMenu({
  label,
  buttonClass,
  open,
  onOpen,
  onClose,
  children,
}: {
  /** The button's name, which names the menu too. */
  label: string;
  buttonClass: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** MenuItem, MenuLink, MenuGroup and MenuSeparator. */
  children: ComponentChildren;
}) {
  const buttonId = useId();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** The item focused as the menu opens. */
  const start = useRef<"first" | "last">("first");
  const close = useRef(onClose);
  close.current = onClose;

  const items = () => [...menuRef.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')];

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current!;
    // The viewport as shown, less its scrollbars and any bars a phone's browser shows: not 100vh.
    const viewport = () => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    });
    const place = () => {
      const { width, height } = viewport();
      menu.style.maxWidth = `${width - 2 * MENU_EDGE}px`;
      menu.style.maxHeight = `${height - 2 * MENU_EDGE}px`;
      const { top, left } = placeMenu(
        buttonRef.current!.getBoundingClientRect(),
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width, height },
      );
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
    };
    // Its button scrolled out of sight, the menu would be left at the edge, by no row: it closes.
    const follow = () => {
      const { top, bottom } = buttonRef.current!.getBoundingClientRect();
      if (bottom > 0 && top < viewport().height) {
        place();
        return;
      }
      buttonRef.current!.focus({ preventScroll: true });
      close.current();
    };
    place();
    const all = items();
    (start.current === "last" ? all.at(-1) : all[0])!.focus();
    const elsewhere = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.contains(target) && !buttonRef.current!.contains(target)) close.current();
    };
    document.addEventListener("pointerdown", elsewhere, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", elsewhere, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  function opening(from: "first" | "last") {
    start.current = from;
    onOpen();
  }

  /** Back on the button, which a press does not focus in every browser. */
  function shut() {
    buttonRef.current!.focus();
    onClose();
  }

  function choose(action?: () => void) {
    shut();
    action?.();
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      shut();
      return;
    }
    // Not prevented: from the button, Tab goes on to what follows it.
    if (event.key === "Tab") {
      shut();
      return;
    }
    // A link takes Enter but not Space, which would scroll the page under the menu: Space follows it too.
    if (event.key === " " && event.target instanceof HTMLAnchorElement) {
      event.preventDefault();
      event.target.click();
      return;
    }
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    all[(to + all.length) % all.length]!.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        class={`icon ${buttonClass}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? shut() : opening("first"))}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          opening(event.key === "ArrowUp" ? "last" : "first");
        }}
      >
        <MoreIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={buttonId}
            class="actions-menu"
            data-no-drag
            onKeyDown={onMenuKeyDown}
          >
            <Choose.Provider value={choose}>{children}</Choose.Provider>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * An item of an ActionsMenu. One that cannot be done now stays in the
 * menu, focusable, marked so, and does nothing.
 */
export function MenuItem({
  disabled = false,
  danger = false,
  style,
  onSelect,
  children,
}: {
  disabled?: boolean;
  /** It cannot be taken back. */
  danger?: boolean;
  style?: string;
  onSelect: () => void;
  children: ComponentChildren;
}) {
  const choose = useContext(Choose)!;
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      class={danger ? "danger" : undefined}
      style={style}
      aria-disabled={disabled ? "true" : undefined}
      onClick={() => {
        if (!disabled) choose(onSelect);
      }}
    >
      {children}
    </button>
  );
}

/** An item of an ActionsMenu that goes to another page. */
export function MenuLink({ href, children }: { href: string; children: ComponentChildren }) {
  const choose = useContext(Choose)!;
  return (
    <a role="menuitem" tabIndex={-1} href={href} onClick={() => choose()}>
      {children}
    </a>
  );
}

/** Items of an ActionsMenu under a heading of their own, which names them. */
export function MenuGroup({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div role="group" aria-label={label} class="menu-group">
      <div class="menu-heading" aria-hidden="true">
        {label}
      </div>
      {children}
    </div>
  );
}

/** A line between the sections of an ActionsMenu. */
export function MenuSeparator() {
  return <div role="separator" class="menu-separator" />;
}
