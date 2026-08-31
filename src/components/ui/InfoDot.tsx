import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";

/**
 * The explanation, one press away
 * ===============================
 *
 * This application explains itself in sentences, and the sentences are always
 * on. A yearly subscription's payment cycle, why an activity has no date, what
 * an averaged monthly figure means — each is a real thing a reader may want to
 * know once, printed permanently on a row they will read a hundred times.
 *
 * So the rule this component exists to enforce: **a fact that answers "why?"
 * is not a fact the card shows.** It is a mark the card shows, and the answer
 * arrives when it is asked for.
 *
 * Three things it has to get right, and the first is the one that has already
 * been got wrong once in this codebase:
 *
 *  - **It is portalled.** `position: fixed` is only relative to the viewport
 *    while no ancestor has a transform, a filter, or `will-change` naming one.
 *    Rows here have `will-change: transform` for the swipe gesture and sit
 *    inside a tab panel that animates, so a fixed popover positioned from a
 *    trigger's viewport box lands hundreds of pixels away. See `RowMenu`.
 *  - **It opens on hover *and* on press.** A tooltip that only appears on
 *    hover does not exist on a phone, and a `title` attribute is invisible to
 *    several screen readers. This is a real button with a real accessible
 *    name, and the text is in the DOM when it is open.
 *  - **It never steals the row.** Rows are clickable; every event stops here.
 */

interface InfoDotProps {
  /** The explanation. Plain text, already translated. */
  children: React.ReactNode;
  /** The accessible name of the trigger — "Why this has no date". */
  label: string;
  /**
   * `info` is the ordinary case: detail somebody may want.
   *
   * `warning` is for a fact that changes what a figure means — an activity
   * whose payment month is unknown, so its cost is not in any month's total.
   * It is amber and it is the only variant that draws attention to itself.
   */
  tone?: "info" | "warning";
  className?: string;
}

export const InfoDot: React.FC<InfoDotProps> = ({ children, label, tone = "info", className = "" }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const box = trigger.getBoundingClientRect();
      const height = bubbleRef.current?.offsetHeight ?? 80;
      const width = Math.min(280, window.innerWidth - 24);
      const below = window.innerHeight - box.bottom;
      const top = below < height + 12 ? Math.max(8, box.top - height - 8) : box.bottom + 8;
      // Centred on the trigger, then pulled inside whichever edge it met.
      const wanted = box.left + box.width / 2 - width / 2;
      const left = Math.max(12, Math.min(wanted, window.innerWidth - width - 12));
      setPosition({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (bubbleRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Icon = tone === "warning" ? AlertTriangle : Info;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`info-dot ${className}`.trim()}
        data-tone={tone}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        // Hover is a convenience on a pointer device, not the mechanism.
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={(event) => {
          // Kept open while the pointer is heading into the bubble itself.
          const to = event.relatedTarget as Node | null;
          if (to && bubbleRef.current?.contains(to)) return;
          setOpen(false);
        }}
        onFocus={() => setOpen(true)}
      >
        <Icon size={13} aria-hidden="true" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className="info-bubble"
            data-tone={tone}
            style={{ top: position.top, left: position.left }}
            onClick={(event) => event.stopPropagation()}
            onMouseLeave={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
};
