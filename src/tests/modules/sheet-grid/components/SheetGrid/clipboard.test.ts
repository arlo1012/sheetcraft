import { describe, expect, test } from "vitest";
import {
  getCellStyle,
  getCellValue,
  setCellStyle,
  setCellValue,
} from "../../../../../modules/workbook/workbook";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid clipboard", () => {
  test("copies TSV and pastes the exact local value matrix as one history entry", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "0012");
    setCellValue(sheet, { row: 0, column: 1 }, 2);
    setCellValue(sheet, { row: 1, column: 1 }, true);
    await wrapper
      .get('[data-row="1"][data-column="1"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    const copied = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
    await wrapper.vm.$nextTick();
    expect(copied.event.defaultPrevented).toBe(true);
    expect(copied.data.get("text/plain")).toBe("0012\t2\r\n\tTRUE");
    expect(wrapper.find("[data-clipboard-range]").exists()).toBe(true);

    await wrapper.get('[data-row="3"][data-column="3"]').trigger("mousedown", { button: 0 });
    const pasted = createTestClipboardEvent("paste", copied.data);
    wrapper.get("textarea.cell-editor").element.dispatchEvent(pasted.event);
    await wrapper.vm.$nextTick();

    expect(getCellValue(sheet, { row: 3, column: 3 })).toBe("0012");
    expect(getCellValue(sheet, { row: 3, column: 4 })).toBe(2);
    expect(getCellValue(sheet, { row: 4, column: 3 })).toBeNull();
    expect(getCellValue(sheet, { row: 4, column: 4 })).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 192px");

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellValue(sheet, { row: 3, column: 3 })).toBeNull();
    expect(getCellValue(sheet, { row: 4, column: 4 })).toBeNull();
  });

  test("delays cut clearing and moves an overlapping range atomically", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A");
    setCellValue(sheet, { row: 0, column: 1 }, "B");
    setCellValue(sheet, { row: 1, column: 0 }, "C");
    setCellValue(sheet, { row: 1, column: 1 }, "D");
    await wrapper
      .get('[data-row="1"][data-column="1"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    const cut = createTestClipboardEvent("cut");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(cut.event);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("A");
    expect(session.history.undoStack).toHaveLength(0);

    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", cut.data).event);
    await wrapper.vm.$nextTick();

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("A");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("D");
    expect(session.history.undoStack).toHaveLength(1);
    expect(wrapper.find("[data-clipboard-range]").exists()).toBe(false);
  });

  test("copies local styles and leaves destination styles intact for external text", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "styled");
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        bold: true,
        fillColor: "#fde68a",
        verticalAlign: "bottom",
        wrapText: true,
      },
    );
    setCellStyle(sheet, { row: 2, column: 2 }, { italic: true });

    const copied = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", copied.data).event);
    await wrapper.vm.$nextTick();
    expect(getCellStyle(sheet, { row: 1, column: 1 })).toEqual({
      bold: true,
      fillColor: "#fde68a",
      verticalAlign: "bottom",
      wrapText: true,
    });

    await wrapper.get('[data-row="2"][data-column="2"]').trigger("mousedown", { button: 0 });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(
        createTestClipboardEvent("paste", new Map([["text/plain", "external"]])).event,
      );
    await wrapper.vm.$nextTick();
    expect(getCellStyle(sheet, { row: 2, column: 2 })).toEqual({ italic: true });
  });

  test("tiles a single external cell over a selected range", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper
      .get('[data-row="1"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });
    const external = createTestClipboardEvent("paste", new Map([["text/plain", "7"]]));

    wrapper.get("textarea.cell-editor").element.dispatchEvent(external.event);
    await wrapper.vm.$nextTick();

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe(7);
    expect(getCellValue(sheet, { row: 1, column: 2 })).toBe(7);
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("rejects an incompatible external matrix without a partial write", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper
      .get('[data-row="1"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });
    const external = createTestClipboardEvent("paste", new Map([["text/plain", "1\t2"]]));

    wrapper.get("textarea.cell-editor").element.dispatchEvent(external.event);
    await wrapper.vm.$nextTick();

    expect(sheet.cells.size).toBe(0);
    expect(session.history.undoStack).toHaveLength(0);
    expect(wrapper.get('[aria-live="polite"]').text()).toContain("does not fit");
  });

  test("ignores non-text clipboard content without clearing the selected cells", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "keep A1");
    setCellValue(sheet, { row: 0, column: 1 }, "keep B1");
    await wrapper
      .get('[data-row="0"][data-column="1"]')
      .trigger("mousedown", { button: 0, shiftKey: true });
    const image = createTestClipboardEvent("paste", new Map([["image/png", "opaque"]]));

    wrapper.get("textarea.cell-editor").element.dispatchEvent(image.event);
    await wrapper.vm.$nextTick();

    expect(image.event.defaultPrevented).toBe(true);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBe("keep A1");
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe("keep B1");
    expect(session.history.undoStack).toHaveLength(0);
    expect(wrapper.get('[aria-live="polite"]').text()).toContain("does not contain text");
  });

  test("leaves editing clipboard events to the native input", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    const pasted = createTestClipboardEvent("paste", new Map([["text/plain", "99"]]));

    editor.element.dispatchEvent(pasted.event);

    expect(pasted.event.defaultPrevented).toBe(false);
    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });
});
