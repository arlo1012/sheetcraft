import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mountSheetGrid, triggerCell } from "./fixture";

function noteText(): string | undefined {
  return document.body.querySelector(".sheet-note-preview__text")?.textContent?.trim();
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
});
