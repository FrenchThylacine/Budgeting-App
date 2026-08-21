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

  /**
   * `onClose` through a ref, so the set-up effect below can depend on nothing.
   *
   * Every caller passes a fresh closure — an inline arrow, or a handler
   * redefined on each render of the panel. With `onClose` in the dependency
   * array the effect tore down and re-ran on **every keystroke**, and its first
   * act is to focus the sheet's first field: typing the second character of a
   * name moved the caret back to the start, and typing into any later field
   * threw focus to the first one. That is the whole of the "editing is
   * unusable" bug, and it applied to every editor in the app, not just the
   * wishlist.
   *
   * The effect is now genuinely a mount/unmount effect — open once, initialise
   * once — and the latest `onClose` is read at call time. No timers, no
   * repeated `focus()`, no selection restoration: the caret is never moved in
   * the first place.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
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
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
    // Deliberately empty: this is open/close set-up, not per-render work. See
    // `closeRef` above for why a dependency here was the focus bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={() => closeRef.current()}>
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
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => closeRef.current()}
            aria-label="Close editor"
          >
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
