import { describe, expect, test } from "vitest";
import { undoWorkbookCommand } from "@idea10/core/history";
import { getCellValue, setCellValue } from "@idea10/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { createTestClipboardEvent } from "./clipboard-fixture";
import {
  activeCell,
  getFloatingMenu,
  mountSheetGrid,
  triggerAxisHeader,
  triggerCell,
  triggerHeaderCorner,
} from "./fixture";

function selection(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return (
    wrapper.getComponent(SheetSurface).props("headers") as {
      selection: {
        mode: string;
        startRow: number;
        endRow: number;
        startColumn: number;
        endColumn: number;
      };
    }
  ).selection;
}

describe("SheetGrid axis selection", () => {
  test("selects rows and columns from Canvas headers, with Shift extending the same axis", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerAxisHeader(wrapper, "row", 2);
    expect(activeCell(wrapper)).toBe("A3");
    await triggerAxisHeader(wrapper, "row", 4, "pointerdown", { shiftKey: true });
    expect(selection(wrapper)).toMatchObject({ mode: "rows", startRow: 2, endRow: 4 });
    await triggerAxisHeader(wrapper, "column", 3);
    expect(activeCell(wrapper)).toBe("D1");
    expect(selection(wrapper)).toMatchObject({ mode: "columns", startColumn: 3, endColumn: 3 });
  });

  test("uses editor shortcuts and Canvas corner for whole-axis selection", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0 });
    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: " ", shiftKey: true });
    expect(selection(wrapper).mode).toBe("rows");
    await editor.trigger("keydown", { key: " ", ctrlKey: true });
    expect(selection(wrapper).mode).toBe("columns");
    await triggerHeaderCorner(wrapper);
    expect(selection(wrapper).mode).toBe("all");
  });

  test("returns to a cell selection on directional editor navigation", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerAxisHeader(wrapper, "row", 2);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "ArrowRight" });
    expect(activeCell(wrapper)).toBe("B3");
    expect(selection(wrapper).mode).toBe("cells");
  });

  test("preserves perpendicular scrolling when selecting an axis or the corner", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller").element as HTMLDivElement;
    scroller.scrollLeft = 800;
    scroller.scrollTop = 1_200;
    await wrapper.get(".sheet-grid__scroller").trigger("scroll");
    await triggerAxisHeader(wrapper, "row", 50);
    expect(scroller.scrollLeft).toBe(800);
    await triggerAxisHeader(wrapper, "column", 10);
    expect(scroller.scrollTop).toBe(1_200);
    await triggerHeaderCorner(wrapper);
    expect(scroller.scrollLeft).toBe(800);
  });

  test("copies and pastes a whole row through its bounded used extent", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 2, column: 1 }, "row value");
    await triggerAxisHeader(wrapper, "row", 2);
    const copied = createTestClipboardEvent("copy");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(copied.event);
    expect(copied.event.defaultPrevented).toBe(true);
    expect(copied.data.get("text/plain")).toBe("\trow value");

    await triggerAxisHeader(wrapper, "row", 5);
    const pasted = createTestClipboardEvent("paste", copied.data);
    wrapper.get("textarea.cell-editor").element.dispatchEvent(pasted.event);
    expect(pasted.event.defaultPrevented).toBe(true);
    expect(getCellValue(sheet, { row: 5, column: 1 })).toBe("row value");
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 5, column: 1 })).toBeNull();
  });

  test("cuts and moves a whole column through its bounded used extent", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 2, column: 1 }, "column value");
    await triggerAxisHeader(wrapper, "column", 1);
    const cut = createTestClipboardEvent("cut");
    wrapper.get("textarea.cell-editor").element.dispatchEvent(cut.event);
    expect(cut.event.defaultPrevented).toBe(true);
    expect(cut.data.get("text/plain")).toBe("\r\n\r\ncolumn value");

    await triggerAxisHeader(wrapper, "column", 4);
    const pasted = createTestClipboardEvent("paste", cut.data);
    wrapper.get("textarea.cell-editor").element.dispatchEvent(pasted.event);
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 4 })).toBe("column value");
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe("column value");
    expect(getCellValue(sheet, { row: 2, column: 4 })).toBeNull();
  });

  test("clears a selected row through the sparse range command", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 2, column: 1 }, "clear");
    setCellValue(sheet, { row: 3, column: 1 }, "keep");
    await triggerAxisHeader(wrapper, "row", 2);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Delete" });
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe("keep");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("opens axis context actions from the Canvas header", async () => {
    const { wrapper } = mountSheetGrid();
    await triggerAxisHeader(wrapper, "row", 2, "contextmenu", { button: 2 });
    expect(getFloatingMenu().attributes("aria-label")).toBe("Row actions");
  });
});
