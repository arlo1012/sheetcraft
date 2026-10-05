import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SheetNotePreview from "../../../../../modules/sheet-grid/components/SheetNotePreview.vue";
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

  test("shows all visible notes once, keeps hidden notes hoverable and refreshes deletions", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (target) => {
        target.cells.set("0:0", { note: { text: "A1 note" } });
        target.cells.set("1:1", { note: { text: "B2 note" } });
        target.cells.set("900:0", { note: { text: "Offscreen note" } });
      },
    });
    await wrapper.setProps({ showAllNotes: true });
    expect(document.body.querySelectorAll(".sheet-note-preview")).toHaveLength(2);
    await triggerCell(wrapper, { row: 1, column: 1 }, "pointermove");
    expect(document.body.querySelectorAll(".sheet-note-preview")).toHaveLength(2);
    await wrapper.setProps({ hiddenNoteKeys: ["0:0"], showActiveNote: false });
    expect(document.body.querySelectorAll(".sheet-note-preview")).toHaveLength(1);
    sheet.cells.delete("1:1");
    await wrapper.setProps({ workbookRevision: 1 });
    expect(document.body.querySelectorAll(".sheet-note-preview")).toHaveLength(0);
    await triggerCell(wrapper, { row: 0, column: 0 }, "pointermove");
    expect(noteText()).toContain("A1 note");
    await wrapper.setProps({ showAllNotes: false });
    expect(noteText()).toContain("A1 note");
    wrapper.unmount();
    expect(document.body.querySelectorAll(".sheet-note-preview")).toHaveLength(0);
  });

  test("edits the clicked note while all notes are displayed without duplicate editors", async () => {
    const { wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (target) => {
        target.cells.set("0:0", { note: { text: "First" } });
        target.cells.set("1:1", { note: { text: "Second" } });
      },
    });
    await wrapper.setProps({ showAllNotes: true });
    document.body
      .querySelector<HTMLButtonElement>('[data-note-address="B2"] .sheet-cell-note__view')!
      .click();
    expect(wrapper.emitted("editNote")?.[0]).toEqual([{ row: 1, column: 1 }]);
    await wrapper.setProps({
      noteDraft: { address: { row: 1, column: 1 }, text: "Second", author: "Ada" },
    });
    expect(document.body.querySelectorAll(".sheet-note-preview")).toHaveLength(2);
    expect(document.body.querySelectorAll(".sheet-cell-note__text-input")).toHaveLength(1);
    wrapper.unmount();
  });
  test("keeps frozen notes anchored while scrolling other notes into view", async () => {
    const { wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (sheet) => {
        sheet.freezePanes = { rows: 1, columns: 1 };
        sheet.cells.set("0:0", { note: { text: "Frozen" } });
        sheet.cells.set("1:1", { note: { text: "Scrolling" } });
        sheet.cells.set("30:1", { note: { text: "Further down" } });
      },
    });
    await wrapper.setProps({ showAllNotes: true });
    const frozenOrigin = wrapper
      .findAllComponents(SheetNotePreview)
      .find((note) => note.props("address").row === 0)!
      .props("origin");
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 500;
    await scroller.trigger("scroll");
    expect(
      wrapper
        .findAllComponents(SheetNotePreview)
        .find((note) => note.props("address").row === 0)!
        .props("origin"),
    ).toEqual(frozenOrigin);
    expect(document.body.querySelector('[data-note-address="B2"]')).toBeNull();
    expect(document.body.querySelector('[data-note-address="B31"]')).not.toBeNull();
    wrapper.unmount();
  });

  test("moves and resizes the targeted note among multiple previews", async () => {
    const { wrapper } = mountSheetGrid({
      attachTo: document.body,
      beforeMount: (sheet) => {
        sheet.cells.set("0:0", { note: { text: "First" } });
        sheet.cells.set("1:1", { note: { text: "Second" } });
      },
    });
    await wrapper.setProps({ showAllNotes: true });
    const preview = document.body.querySelector<HTMLElement>('[data-note-address="B2"]')!;
    preview.setPointerCapture = vi.fn();
    preview.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 130, clientY: 120 }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(wrapper.emitted("updateNoteBox")?.[0]).toEqual([
      { address: { row: 1, column: 1 }, box: { offsetX: 45, offsetY: 10, width: 128, height: 80 } },
    ]);
    await nextTick();
    const handle = preview.querySelector<HTMLElement>('[data-note-resize="se"]')!;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 2,
        button: 0,
        clientX: 100,
        clientY: 100,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 2, clientX: 150, clientY: 140 }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    expect(wrapper.emitted("updateNoteBox")?.[1]).toEqual([
      {
        address: { row: 1, column: 1 },
        box: { offsetX: 15, offsetY: -10, width: 178, height: 120 },
      },
    ]);
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
