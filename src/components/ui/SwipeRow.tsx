import React, { useCallback, useEffect, useId, useRef, useState } from "react";

export interface SwipeAction {
  /** Shown on the revealed panel and used as the button's accessible name. */
  label: string;
  icon: React.ReactNode;
  onAction: () => void;
  /** Renders in the danger tone and is never fired by the gesture itself. */
  destructive?: boolean;
}

interface SwipeRowProps {
  children: React.ReactNode;
  /** Revealed by swiping right-to-left, on the trailing edge. */
  trailing?: SwipeAction[];
  /** Revealed by swiping left-to-right, on the leading edge. */
  leading?: SwipeAction[];
  /** Describes the row, so the revealed buttons can name what they act on. */
  label: string;
  className?: string;
}

/** How far the finger must travel before the panel is considered open. */
export const OPEN_THRESHOLD = 56;
/** Movement below this is a tap or a scroll, not a swipe. */
export const INTENT_THRESHOLD = 10;
export const PANEL_WIDTH = 84;

export type SwipeIntent = "none" | "swipe" | "scroll";

/**
 * What a movement means, decided once and then held for the gesture.
 *
 * Re-deciding on every frame lets a swipe turn into a scroll halfway through,
 * which feels like the row is fighting the finger. Vertical wins ties: reading
 * a list is the common act, and a page that will not scroll is a worse failure
 * than a swipe that does not open.
 */
export function resolveSwipeIntent(dx: number, dy: number): SwipeIntent {
  if (Math.abs(dx) < INTENT_THRESHOLD && Math.abs(dy) < INTENT_THRESHOLD) return "none";
  return Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
}

/**
 * Where the row rests when the finger lifts.
 *
 * Always fully open or fully shut — a row parked part-way shows half a label,
 * which is unreadable and looks broken.
 */
export function snapOffset(travelled: number, leadingCount: number, trailingCount: number): number {
  if (travelled <= -OPEN_THRESHOLD) return noNegativeZero(-trailingCount * PANEL_WIDTH);
  if (travelled >= OPEN_THRESHOLD) return leadingCount * PANEL_WIDTH;
  return 0;
}

/**
 * `-0` and `0` render identically, but they are not equal under Object.is and
 * they read as a bug in any log or assertion that shows one.
 */
function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Constrain the drag to what the row actually has to reveal. */
export function clampOffset(dx: number, leadingCount: number, trailingCount: number): number {
  return noNegativeZero(
    Math.max(-trailingCount * PANEL_WIDTH, Math.min(leadingCount * PANEL_WIDTH, dx)),
  );
}

/**
 * Swipe to reveal a row's actions.
 *
 * The gesture **reveals** buttons rather than performing anything itself. A
 * swipe that deletes on release has no confirmation step and no way to see what
 * it is about to do — which is the wrong shape for an action that destroys a
 * financial record. Revealing gives a visible target, a second deliberate tap,
 * and somewhere to read the label first.
 *
 * That choice also supplies the accessible alternative for free: the buttons
 * are real buttons in the DOM at all times, reachable with Tab and announced
 * normally. Nothing here is available only to a finger.
 *
 * Only touch pointers swipe. A mouse drag across a card is far more often a
 * text selection or the start of a scroll, and hijacking it would break both.
 */
export const SwipeRow: React.FC<SwipeRowProps> = ({
  children,
  trailing = [],
  leading = [],
  label,
  className = "",
}) => {
  const [offset, setOffset] = useState(0);
  /**
   * Gesture state lives in refs, not in state.
   *
   * Pointer events for one gesture can arrive within a single tick, and a
   * `useState` flag read inside those handlers is still the value from the last
   * render — so the first moves of every swipe were silently dropped. Refs are
   * written and read synchronously, which is what a gesture needs. `offset` is
   * state because it is the only part that renders.
   */
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const decided = useRef<SwipeIntent>("none");

  const applyOffset = useCallback((next: number) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);
  const rowRef = useRef<HTMLDivElement>(null);
  const groupId = useId();

  const close = useCallback(() => {
    offsetRef.current = 0;
    setOffset(0);
  }, []);

  // Any tap outside closes an open row, so a revealed Delete cannot sit there
  // waiting to be hit by accident.
  useEffect(() => {
    if (offset === 0) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [offset, close]);

  const handlePointerDown = (event: React.PointerEvent): void => {
    if (event.pointerType !== "touch") return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    decided.current = "none";
    draggingRef.current = true;
    setDragging(true);
    // Keeps the gesture attached to this element even when the finger leaves
    // it, so a fast swipe does not end halfway through.
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      /* capture is an optimisation, never a requirement */
    }
  };

  const handlePointerMove = (event: React.PointerEvent): void => {
    if (!draggingRef.current || event.pointerType !== "touch") return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;

    if (decided.current === "none") {
      decided.current = resolveSwipeIntent(dx, dy);
      if (decided.current === "none") return;
    }
    if (decided.current !== "swipe") return;

    applyOffset(clampOffset(dx, leading.length, trailing.length));
  };

  const handlePointerUp = (): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (decided.current !== "swipe") return;
    // Snap open or shut rather than resting part-way, so the row is never left
    // in a state where half a label is readable.
    applyOffset(snapOffset(offsetRef.current, leading.length, trailing.length));
  };

  const renderPanel = (actions: SwipeAction[], side: "leading" | "trailing") => (
    <div className={`swipe-panel swipe-panel-${side}`} aria-hidden={offset === 0}>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`swipe-action${action.destructive ? " swipe-action-destructive" : ""}`}
          // Removed from the tab order while hidden, so Tab does not stop on a
          // control nobody can see. The same actions remain available on the
          // card itself, which is what keyboard users actually use.
          tabIndex={offset === 0 ? -1 : 0}
          onClick={() => {
            action.onAction();
            close();
          }}
          aria-label={`${action.label}: ${label}`}
        >
          {action.icon}
          <span className="swipe-action-label">{action.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={rowRef}
      className={`swipe-row ${className}`}
      data-open={offset !== 0 || undefined}
      aria-describedby={offset !== 0 ? `${groupId}-hint` : undefined}
    >
      {leading.length > 0 && renderPanel(leading, "leading")}
      {trailing.length > 0 && renderPanel(trailing, "trailing")}

      <div
        className="swipe-content"
        style={{
          transform: `translateX(${offset}px)`,
          // No transition mid-drag: the row must track the finger exactly, or
          // it feels like it is lagging behind.
          transition: dragging ? "none" : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {children}
      </div>

      {offset !== 0 && (
        <span id={`${groupId}-hint`} className="sr-only">
          Actions revealed. Press Escape to close.
        </span>
      )}
    </div>
  );
};
