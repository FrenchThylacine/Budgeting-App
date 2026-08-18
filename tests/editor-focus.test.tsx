// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { EditorSheet } from "../src/components/ui/EditorSheet";

/**
 * Editor focus and remount regression test.
 *
 * Ensures that typing inside an EditorSheet form does not trigger a re-focus
 * on the first element when parent re-renders produce new inline function references.
 */

const DummyEditor: React.FC<{ onSave: () => void }> = ({ onSave }) => {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <EditorSheet
      title="Test Editor"
      onClose={() => {
        /* inline arrow */
      }}
      footer={<button onClick={onSave}>Save</button>}
    >
      <form onSubmit={(e) => e.preventDefault()}>
        <input
          data-testid="name-input"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          data-testid="notes-input"
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </form>
    </EditorSheet>
  );
};

describe("EditorSheet focus stability", () => {
  it("allows continuous typing in secondary fields without focus stealing", () => {
    render(<DummyEditor onSave={() => {}} />);

    const nameInput = screen.getByTestId("name-input") as HTMLInputElement;
    const notesInput = screen.getByTestId("notes-input") as HTMLTextAreaElement;

    // Initial focus targets first input
    expect(document.activeElement).toBe(nameInput);

    // Focus secondary textarea
    notesInput.focus();
    expect(document.activeElement).toBe(notesInput);

    // Type character by character into textarea
    fireEvent.change(notesInput, { target: { value: "A" } });
    expect(notesInput.value).toBe("A");
    // Crucial: focus must remain on notesInput, NOT reset to nameInput
    expect(document.activeElement).toBe(notesInput);

    fireEvent.change(notesInput, { target: { value: "Amazon headphones" } });
    expect(notesInput.value).toBe("Amazon headphones");
    expect(document.activeElement).toBe(notesInput);
  });
});
