import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface EditorSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Rendered in a sticky footer, so the primary action is always reachable. */
  footer: React.ReactNode;
  children: React.ReactNode;
  /** The element to focus on open. Defaults to the first focusable control. */
  initialFocusRef?: React.RefObject<HTMLElement>;
}

/**
 * A dedicated editor: a centred dialog on a large screen, a full-screen sheet
 * on a small one.
 *
 * Editing used to happen inside the card being edited, which meant a long form
 * unfolded in the middle of a list and pushed everything below it out of view.
 * On a phone the fields ended up in a column narrower than the labels, and the
 * save button was often below the fold with no indication it existed.
 *
 * The two presentations are one component because they are the same task. Only
 * the frame differs: a phone has no room for a dialog that is not the whole
 * screen, and a desktop should not lose the context around it.
 */
export const EditorSheet: React.FC<EditorSheetProps> = ({
  title,
  subtitle,
  onClose,
  footer,
  children,
  initialFocusRef,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Keep a ref to onClose so the keyboard handler can always call the latest
  // version without re-running the effect when the parent re-renders.
  // This is the critical fix: previously onClose was listed as a dependency,
  // so every keystroke (parent re-render → new inline arrow → new onClose
  // identity) caused the effect to re-run, which called target?.focus() and
  // stole the cursor from wherever the user was typing.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // ── Mount / unmount only ─────────────────────────────────────────────────
  // Focuses the first field and locks page scroll. Both are one-time setup
  // actions — re-running them on every parent re-render would steal focus
  // from whichever field the user is currently typing in.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the field the user came to change, not the close button.
    const target =
      initialFocusRef?.current ??
      sheetRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select, textarea',
      ) ??
      sheetRef.current;
    target?.focus();

    // The page behind must not scroll while a sheet covers it: on a phone that
    // produces two scrolling surfaces and the wrong one usually moves.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // initialFocusRef intentionally omitted: we only want to focus once on open.
  // If the ref changes while the sheet is open the focus should stay where it
  // is, not jump again.

  // ── Keyboard shortcuts (Escape / Tab-trap) ───────────────────────────────
  // Registered once; reads onCloseRef.current so it always calls the latest
  // handler without needing to be re-registered on every render.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-sheet-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sheet-header">
          <div style={{ minWidth: 0 }}>
            <h2 id="editor-sheet-title" className="text-title" style={{ margin: 0, overflowWrap: "anywhere" }}>
              {title}
            </h2>
            {subtitle && <p className="text-note" style={{ margin: "2px 0 0" }}>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close editor">
            <X size={18} />
          </button>
        </header>

        <div className="sheet-body">{children}</div>

        {/* Sticky, so the primary action never scrolls out of reach on a long
            form — the failure the inline version had on every phone. */}
        <footer className="sheet-footer">{footer}</footer>
      </div>
    </div>
  );
};

/**
 * Fields that most edits do not touch.
 *
 * Everything needed for the common case stays visible; the rest is one tap
 * away. Showing twenty fields at once does not make an editor powerful, it
 * makes the four that matter harder to find.
 */
export const AdvancedFields: React.FC<{ label?: string; children: React.ReactNode }> = ({
  label = "Advanced",
  children,
}) => (
  <details className="sheet-advanced">
    <summary>{label}</summary>
    <div className="sheet-advanced-body">{children}</div>
  </details>
);
