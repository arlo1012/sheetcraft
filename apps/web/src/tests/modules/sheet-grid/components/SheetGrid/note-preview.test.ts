import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mountSheetGrid, triggerCell } from "./fixture";

function noteText(): string | undefined {
  return document.body.querySelector(".sheet-cell-note__view")?.textContent?.trim();
}

describe("SheetGrid note preview", () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => document.body.replaceChildren());

  test("updates the selected note as the active cell changes", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (target) => {
        target.cells.set("0:0", { note: { author: "Ada", text: "A1 note" } });
        target.cells.set("1:1", { note: { author: "Ben", text: "B2 note" } });
      },
    });

    await nextTick();
    expect(noteText()).toContain("A1 note");

    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    expect(noteText()).toContain("B2 note");

    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0 });
    expect(document.body.querySelector(".sheet-note-preview")).toBeNull();

    wrapper.unmount();
    sheet.cells.clear();
  });

  test("keeps hover previews available while active-note display is hidden", async () => {
    const { wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (sheet) => {
        sheet.cells.set("1:1", { note: { text: "B2 note" } });
      },
    });

    await wrapper.setProps({ showActiveNote: false });
    expect(document.body.querySelector(".sheet-note-preview")).toBeNull();

    await triggerCell(wrapper, { row: 1, column: 1 }, "pointermove");
    expect(noteText()).toContain("B2 note");

    wrapper.unmount();
  });

  test("refreshes note text when the workbook revision changes", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (target) => {
        target.cells.set("0:0", { note: { text: "Initial note" } });
      },
    });

    await nextTick();
    expect(noteText()).toContain("Initial note");

    sheet.cells.set("0:0", { note: { text: "Edited note" } });
    await wrapper.setProps({ workbookRevision: 1 });
    expect(noteText()).toContain("Edited note");

    wrapper.unmount();
  });

  test("uses a draft at its target address and saves it from the in-place editor", async () => {
    const { wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (sheet) => sheet.cells.set("1:1", { note: { text: "Existing note" } }),
    });
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });

    await wrapper.setProps({
      noteDraft: {
        address: { row: 1, column: 1 },
        author: "Ada",
        text: "Draft note",
      },
      noteError: "Save failed",
    });
    await nextTick();

    const author = document.body.querySelector<HTMLInputElement>(".sheet-cell-note__author-input")!;
    const text = document.body.querySelector<HTMLTextAreaElement>(".sheet-cell-note__text-input")!;
    expect(author.value).toBe("Ada");
    expect(text.value).toBe("Draft note");
    expect(document.body.textContent).toContain("Save failed");

    text.value = "Edited note";
    text.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    text.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );

    expect(wrapper.emitted("saveNote")?.[0]).toEqual([
      { author: "Ada", text: "Edited note", restoreFocus: true },
    ]);
    wrapper.unmount();
  });
  test("keeps a new note's unsaved text while its draft box changes and saves on outside click", async () => {
    const { wrapper } = mountSheetGrid({ attachTo: document.body });
    const draft = { address: { row: 0, column: 0 }, author: "Ada", text: "" };
    await wrapper.setProps({ noteDraft: draft });
    await nextTick();
    const text = document.body.querySelector<HTMLTextAreaElement>(".sheet-cell-note__text-input")!;
    expect(text).not.toBeNull();
    text.value = "First line\nSecond line";
    text.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    await wrapper.setProps({
      noteDraft: { ...draft, box: { offsetX: 40, offsetY: 20, width: 208, height: 120 } },
    });
    expect(text.value).toBe("First line\nSecond line");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(wrapper.emitted("saveNote")?.[0]).toEqual([
      { text: "First line\nSecond line", author: "Ada", restoreFocus: false },
    ]);
    wrapper.unmount();
  });
});
