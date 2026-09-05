import { describe, expect, test } from "vitest";
import {
  getCellContent,
  getCellStyle,
  getCellValue,
  setCellContent,
  setCellStyle,
  setCellValue,
} from "@idea10/core/workbook";
import {
  IDEA10_CLIPBOARD_TYPE,
  WEB_IDEA10_CLIPBOARD_TYPE,
} from "../../../../../modules/sheet-grid/gridClipboardPort";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid clipboard", () => {
  test("aligns the copy outline to gridlines and cancels it with Escape", async () => {
    const { session, wrapper } = mountSheetGrid();
    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
    await wrapper
      .get('[data-row="2"][data-column="2"]')
      .trigger("mousedown", { button: 0, shiftKey: true });

    const copied = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
    await wrapper.vm.$nextTick();

    const clipboardStyle = (wrapper.get("[data-clipboard-range]").element as HTMLElement).style;
    expect({
      left: clipboardStyle.left,
      top: clipboardStyle.top,
      width: clipboardStyle.width,
      height: clipboardStyle.height,
      borderWidth: clipboardStyle.borderWidth,
    }).toEqual({
      left: "95px",
      top: "23px",
      width: "193px",
      height: "49px",
      borderWidth: "2px",
    });

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    wrapper.get("textarea.cell-editor").element.dispatchEvent(escape);
    await wrapper.vm.$nextTick();
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.find("[data-clipboard-range]").exists()).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
  });

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

  test("tiles copied formulas with translated references", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 1 }, 2);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=B1 + 1" },
      },
    );

    const copied = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
    await wrapper.get('[data-row="2"][data-column="2"]').trigger("mousedown", { button: 0 });
    await wrapper
      .get('[data-row="3"][data-column="3"]')
      .trigger("mousedown", { button: 0, shiftKey: true });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", copied.data).event);
    await wrapper.vm.$nextTick();

    expect(getCellContent(sheet, { row: 2, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=D3 + 1" },
    });
    expect(getCellContent(sheet, { row: 2, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=E3 + 1" },
    });
    expect(getCellContent(sheet, { row: 3, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=D4 + 1" },
    });
    expect(getCellContent(sheet, { row: 3, column: 3 })).toEqual({
      kind: "formula",
      formula: { source: "=E4 + 1" },
    });
  });

  test("keeps formula content intact while pasting formats", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const target = { row: 1, column: 2 };
    setCellContent(sheet, target, {
      kind: "formula",
      formula: { source: "=A1 + 1" },
    });

    const result = wrapper.props("applyPaste")?.({
      kind: "formats",
      plan: {
        anchor: target,
        range: { start: target, end: target },
        values: [[2]],
      },
      styles: [[{ bold: true }]],
    });
    expect(result).toEqual({ ok: true });
    await wrapper.vm.$nextTick();

    expect(getCellContent(sheet, target)).toEqual({
      kind: "formula",
      formula: { source: "=A1 + 1" },
    });
    expect(getCellStyle(sheet, target)).toEqual({ bold: true });
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

  test("recognizes a web-prefixed local token when keyboard paste follows a rich clipboard write", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "move with style");
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true });

    const cut = createTestClipboardEvent("cut");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(cut.event);
    const token = cut.data.get(IDEA10_CLIPBOARD_TYPE);
    expect(token).toBeTruthy();

    const webClipboardData = new Map(cut.data);
    webClipboardData.delete(IDEA10_CLIPBOARD_TYPE);
    webClipboardData.set(WEB_IDEA10_CLIPBOARD_TYPE, token ?? "");
    await wrapper.get('[data-row="2"][data-column="2"]').trigger("mousedown", { button: 0 });
    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", webClipboardData).event);
    await wrapper.vm.$nextTick();

    expect(getCellValue(sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("move with style");
    expect(getCellStyle(sheet, { row: 2, column: 2 })).toEqual({ bold: true });
    expect(session.history.undoStack).toHaveLength(1);
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
        borderDiagonalUp: { style: "thin", color: "#112233" },
        borderDiagonalDown: { style: "dashed", color: "#445566" },
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
      borderDiagonalUp: { style: "thin", color: "#112233" },
      borderDiagonalDown: { style: "dashed", color: "#445566" },
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
