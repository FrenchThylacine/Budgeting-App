import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface RowMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Greyed out and unselectable, with the reason available through `title`. */
  disabled?: boolean;
  /** Rendered apart and in the danger tone. */
  destructive?: boolean;
  title?: string;
  onSelect: () => void;
}

interface RowMenuProps {
  items: RowMenuItem[];
  /** The accessible name of the trigger — "More actions for Gym". */
  label: string;
  className?: string;
}

/**
 * The row's other actions, behind one button.
 *
 * Every activity row used to carry six: move up, move down, deactivate,
 * duplicate, edit, delete. Six activities meant thirty-six controls on screen,
 * of which a person uses one, occasionally. The list stopped being a list of
 * what you spend money on and became a toolbar with some text in it.
 *
 * So the row keeps the action people actually take — edit — and everything
 * else moves in here. Nothing is removed: reordering, duplicating, switching
 * off and deleting are all still one press further away than they were, and
 * one press is the correct distance for an action taken once a month.
 *
 * Three things this has to get right, all of which a `<div>` with an `onClick`
 * would get wrong:
 *
 *  - **Keyboard.** Arrow keys move through the items, Home and End jump,
 *    Escape closes and returns focus to the trigger. A menu you can open with
 *    a keyboard and not leave is worse than no menu.
 *  - **It must not close the row.** Rows are clickable — the whole card opens
 *    the editor — so every event here stops propagating.
 *  - **It must not be clipped, and it must land where it is aimed.** This is
 *    the one that was broken. The menu is positioned `fixed` from the
 *    trigger's viewport box — which is correct arithmetic and was landing the
 *    menu 280px right and 520px below where it belonged, off the screen
 *    entirely on a row near the bottom of the list.
 *
 *    `position: fixed` is only relative to the viewport while no ancestor has
 *    a transform, a filter, a perspective, `contain`, or `will-change` naming
 *    one of them. Any of those makes that ancestor the containing block, and
 *    this menu had **two**: `.swipe-content`, which carries
 *    `will-change: transform` for the swipe gesture — an identity matrix is
 *    still a transform — and `.tab-panel`, which is mid-animation whenever a
 *    tab has just changed. So the menu was being placed relative to its own
 *    row.
 *
 *    A portal to `document.body` is the fix that cannot be re-broken by
 *    something a parent does later. React events still propagate through the
 *    React tree rather than the DOM, so the row's own click handler is still
 *    reached — and still stopped.
 */
export const RowMenu: React.FC<RowMenuProps> = ({ items, label, className }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const usable = items.filter((item) => !item.disabled);

  // Positioned after layout and before paint, so the menu never appears at the
  // origin for a frame and then jumps to the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const box = trigger.getBoundingClientRect();
      const height = menuRef.current?.offsetHeight ?? items.length * 38 + 12;
      const width = menuRef.current?.offsetWidth ?? 200;
      // Flip above when there is no room below, and pull inside the left edge
      // on a narrow screen rather than opening off it.
      const below = window.innerHeight - box.bottom;
      const top = below < height + 12 ? Math.max(8, box.top - height - 6) : box.bottom + 6;
      const left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8));
      setPosition({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // Focus the first item on open, so a keyboard user is inside the menu rather
  // than beside it.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])");
    first?.focus();
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons.at(-1)?.focus();
    } else if (event.key === "Tab") {
      // A menu is a modal-ish surface: tabbing out of it closes it rather than
      // leaving an open panel behind the focus ring.
      close(false);
    }
  };

  if (usable.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`btn btn-ghost btn-sm btn-icon row-menu-trigger${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        position &&
        createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="row-menu"
          style={{ top: position.top, left: position.left }}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`row-menu-item${item.destructive ? " is-destructive" : ""}`}
              disabled={item.disabled}
              title={item.title}
              onClick={(event) => {
                event.stopPropagation();
                close();
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
