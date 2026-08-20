// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EditorSheet } from "../src/components/ui/EditorSheet";

/**
 * The bug this file exists for.
 *
 * `EditorSheet` set focus inside an effect that listed `onClose` as a
 * dependency. Every caller passes a fresh closure, so the effect tore down and
 * re-ran on every render — and a render happens on every keystroke, because the
 * draft lives in the parent's state. The effect's first act is to focus the
 * sheet's first field, so:
 *
 *  - typing the second character of a name put the caret back at the start;
 *  - typing in any field other than the first threw focus to the first.
 *
 * The reproduction below is the exact one asked for: type
 * "Amazon Flight Simulator Hardware" one character at a time, never clicking
 * again, and assert every character landed and focus never moved.
 */

afterEach(cleanup);

const LONG_INPUT = "Amazon Flight Simulator Hardware";

/** A panel shaped like the real ones: draft in parent state, fresh handlers. */
const Harness: React.FC<{ onSaved?: (value: string) => void }> = ({ onSaved }) => {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(true);
  const [renders, setRenders] = useState(0);
  void renders;

  if (!open) return <div data-testid="closed">closed</div>;

  return (
    <EditorSheet
      title="Edit item"
      // Deliberately a new closure on every render, which is what every panel
      // in the app does and what used to break typing.
      onClose={() => {
        setOpen(false);
        setRenders((value) => value + 1);
      }}
      footer={
        <button type="button" onClick={() => onSaved?.(name)}>
          Save
        </button>
      }
    >
      <form>
        <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <input aria-label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
      </form>
    </EditorSheet>
  );
};

describe("EditorSheet keeps the caret where the user put it", () => {
  it("accepts a long name typed one character at a time without losing focus", () => {
    render(<Harness />);
    const name = screen.getByLabelText("Name") as HTMLInputElement;

    // The sheet focuses its first field on open, which is the field we type in.
    expect(document.activeElement).toBe(name);

    for (let index = 0; index < LONG_INPUT.length; index += 1) {
      const next = LONG_INPUT.slice(0, index + 1);
      fireEvent.change(name, { target: { value: next } });
      // Focus must survive every single keystroke, not just the last one.
      expect(document.activeElement).toBe(name);
    }

    expect(name.value).toBe(LONG_INPUT);
  });

  it("does not pull focus back to the first field when a later field is edited", () => {
    render(<Harness />);
    const note = screen.getByLabelText("Note") as HTMLInputElement;

    note.focus();
    expect(document.activeElement).toBe(note);

    for (const character of "Bought on sale") {
      fireEvent.change(note, { target: { value: note.value + character } });
      expect(document.activeElement).toBe(note);
    }

    expect(note.value).toBe("Bought on sale");
  });

  it("still closes on Escape, using the latest handler", () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("closed")).toBeTruthy();
  });

  it("restores page scrolling when it unmounts", () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
