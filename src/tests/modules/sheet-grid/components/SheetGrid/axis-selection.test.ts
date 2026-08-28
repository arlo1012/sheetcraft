import { describe, expect, test } from "vitest";
import { getCellValue, getRowHeight, setCellValue } from "../../../../../modules/workbook/workbook";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { activeCell, getFloatingDialog, hasFloatingDialog, mountSheetGrid } from "./fixture";

describe("SheetGrid axis selection", () => {
  test("selects rows and columns from headers, with Shift extending the same axis", async () => {
    const { wrapper } = mountSheetGrid();

    await wrapper.get('[data-select-row="2"]').trigger("mousedown", {
      button: 0,
    });
    expect(activeCell(wrapper)).toBe("A3");
    expect(wrapper.get('[data-row="2"][data-column="5"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.get('[data-row="1"][data-column="5"]').attributes("aria-selected")).toBe(
      "false",
    );

    await wrapper.get('[data-select-row="4"]').trigger("mousedown", {
      button: 0,
      shiftKey: true,
    });
    expect(wrapper.get('[data-row="3"][data-column="5"]').attributes("aria-selected")).toBe("true");

    await wrapper.get('[data-select-column="3"]').trigger("mousedown", {
      button: 0,
    });
    expect(activeCell(wrapper)).toBe("D1");
    expect(wrapper.get('[data-row="5"][data-column="3"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.get('[data-row="5"][data-column="2"]').attributes("aria-selected")).toBe(
      "false",
    );
  });

  test("uses the corner and keyboard shortcuts for whole-axis selection", async () => {
    const { wrapper } = mountSheetGrid();

    await wrapper.get('[data-row="2"][data-column="2"]').trigger("mousedown", { button: 0 });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: " ", shiftKey: true });
    expect(wrapper.get('[data-row="2"][data-column="8"]').attributes("aria-selected")).toBe("true");

    await wrapper.get("input.cell-editor").trigger("keydown", { key: " ", ctrlKey: true });
    expect(wrapper.get('[data-row="8"][data-column="2"]').attributes("aria-selected")).toBe("true");

    await wrapper.get("button.sheet-grid__corner").trigger("click");
    expect(wrapper.get('[data-row="8"][data-column="8"]').attributes("aria-selected")).toBe("true");
    const rangeStyle = wrapper.get("[data-selection-range]").attributes("style") ?? "";
    expect(rangeStyle).toContain("width: 960px");
    expect(rangeStyle).toContain("height: 600px");

    await wrapper.get('[data-row="1"][data-column="1"]').trigger("mousedown", { button: 0 });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "a", ctrlKey: true });
    expect(wrapper.get('[data-row="8"][data-column="8"]').attributes("aria-selected")).toBe("true");

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "F2" });
    const editingSelectAll = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    wrapper.get("input.cell-editor").element.dispatchEvent(editingSelectAll);
    expect(editingSelectAll.defaultPrevented).toBe(false);
  });

  test("returns to a cell selection on directional navigation", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.get('[data-select-row="2"]').trigger("mousedown", {
      button: 0,
    });

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "ArrowRight" });
    expect(activeCell(wrapper)).toBe("B3");
    expect(wrapper.get('[data-row="2"][data-column="8"]').attributes("aria-selected")).toBe(
      "false",
    );
  });

  test("exposes keyboard-operable row and column headers", async () => {
    const { wrapper } = mountSheetGrid();
    const rowHeader = wrapper.get('[data-select-row="2"]');
    const columnHeader = wrapper.get('[data-select-column="3"]');

    expect(rowHeader.attributes("type")).toBe("button");
    expect(rowHeader.attributes("aria-label")).toBe("Select row 3");
    (rowHeader.element as HTMLButtonElement).focus();
    await rowHeader.trigger("keydown", { key: "Enter" });
    expect(activeCell(wrapper)).toBe("A3");
    expect(rowHeader.attributes("aria-pressed")).toBe("true");

    expect(columnHeader.attributes("type")).toBe("button");
    expect(columnHeader.attributes("aria-label")).toBe("Select column D");
    await columnHeader.trigger("keydown", { key: " " });
    expect(activeCell(wrapper)).toBe("D1");
    expect(columnHeader.attributes("aria-pressed")).toBe("true");
  });

  test("preserves perpendicular scrolling when selecting an axis", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    const element = scroller.element as HTMLDivElement;
    element.scrollLeft = 800;
    element.scrollTop = 1_200;
    await scroller.trigger("scroll");

    await wrapper.get('[data-select-row="50"]').trigger("mousedown", {
      button: 0,
    });
    expect(element.scrollLeft).toBe(800);

    await wrapper.get('[data-select-column="10"]').trigger("mousedown", {
      button: 0,
    });
    expect(element.scrollTop).toBe(1_200);

    await wrapper.get("button.sheet-grid__corner").trigger("click");
    expect(element.scrollLeft).toBe(800);
    expect(element.scrollTop).toBe(1_200);
  });

  test("rejects copy, cut, and paste for whole-axis selections without materializing values", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    await wrapper.get('[data-select-column="1"]').trigger("mousedown", {
      button: 0,
    });

    const copied = createTestClipboardEvent("copy");
    wrapper.get("input.cell-editor").element.dispatchEvent(copied.event);
    await wrapper.vm.$nextTick();
    expect(copied.event.defaultPrevented).toBe(true);
    expect(copied.data.get("text/plain")).toBeUndefined();
    expect(wrapper.get('[aria-live="polite"]').text()).toContain("whole rows and columns");

    const pasted = createTestClipboardEvent("paste", new Map([["text/plain", "1"]]));
    wrapper.get("input.cell-editor").element.dispatchEvent(pasted.event);
    await wrapper.vm.$nextTick();
    expect(pasted.event.defaultPrevented).toBe(true);
    expect(sheet.cells.size).toBe(0);
    expect(wrapper.get('[aria-live="polite"]').text()).toContain("Pasting into whole rows");
  });

  test("clears a whole row through the sparse range command", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 2, column: 1 }, "clear");
    setCellValue(sheet, { row: 3, column: 1 }, "keep");
    await wrapper.get('[data-select-row="2"]').trigger("mousedown", {
      button: 0,
    });

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Delete" });
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe("keep");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("returns focus to the grid after a pointer header selection", async () => {
    const { session, sheet, wrapper } = mountSheetGrid({ attachTo: document.body });
    setCellValue(sheet, { row: 2, column: 1 }, "clear");

    try {
      const pointerSelection = new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        cancelable: true,
      });
      wrapper.get('[data-select-row="2"]').element.dispatchEvent(pointerSelection);
      await wrapper.vm.$nextTick();
      const editor = wrapper.get<HTMLInputElement>("input.cell-editor");
      expect(pointerSelection.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(editor.element);

      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Delete",
          bubbles: true,
          cancelable: true,
        }),
      );
      await wrapper.vm.$nextTick();

      expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
      expect(session.history.undoStack).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });

  test("inserts and deletes selected rows from the context menu as single history entries", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 2, column: 0 }, "selected");
    setCellValue(sheet, { row: 3, column: 0 }, "move");

    await wrapper.get('[data-select-row="2"]').trigger("contextmenu", {
      clientX: 16,
      clientY: 72,
    });
    const dialog = getFloatingDialog();
    expect(dialog.text()).toContain("Insert 1 row below");
    await dialog.get(".sheet-axis-context-menu__count-row input").setValue(2);
    await dialog.get('[data-axis-action="insert-after"]').trigger("click");
    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("selected");
    expect(getCellValue(sheet, { row: 3, column: 0 })).toBeNull();
    expect(getCellValue(sheet, { row: 5, column: 0 })).toBe("move");
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellValue(sheet, { row: 3, column: 0 })).toBe("move");

    setCellValue(sheet, { row: 4, column: 0 }, "keep");
    await wrapper.get('[data-select-row="2"]').trigger("mousedown", {
      button: 0,
    });
    await wrapper.get('[data-select-row="3"]').trigger("mousedown", {
      button: 0,
      shiftKey: true,
    });
    await wrapper.get('[data-select-row="3"]').trigger("contextmenu", {
      clientX: 16,
      clientY: 96,
    });
    expect(getFloatingDialog().text()).toContain("Delete 2 rows");
    await getFloatingDialog().get('[data-axis-action="delete"]').trigger("click");

    expect(getCellValue(sheet, { row: 2, column: 0 })).toBe("keep");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("inserts and deletes selected columns from the context menu", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 2 }, "selected");
    setCellValue(sheet, { row: 0, column: 3 }, "move");

    await wrapper.get('[data-select-column="2"]').trigger("contextmenu", {
      clientX: 240,
      clientY: 16,
    });
    const dialog = getFloatingDialog();
    expect(dialog.text()).toContain("Insert 1 column after");
    await dialog.get(".sheet-axis-context-menu__count-row input").setValue(2);
    await dialog.get('[data-axis-action="insert-after"]').trigger("click");

    expect(getCellValue(sheet, { row: 0, column: 2 })).toBe("selected");
    expect(getCellValue(sheet, { row: 0, column: 3 })).toBeNull();
    expect(getCellValue(sheet, { row: 0, column: 5 })).toBe("move");
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    setCellValue(sheet, { row: 0, column: 4 }, "keep");
    await wrapper.get('[data-select-column="2"]').trigger("mousedown", { button: 0 });
    await wrapper.get('[data-select-column="3"]').trigger("mousedown", {
      button: 0,
      shiftKey: true,
    });
    await wrapper.get('[data-select-column="3"]').trigger("contextmenu", {
      clientX: 336,
      clientY: 16,
    });
    await getFloatingDialog().get('[data-axis-action="delete"]').trigger("click");

    expect(getCellValue(sheet, { row: 0, column: 2 })).toBe("keep");
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("resizes and clears a selected row from the keyboard-opened action dialog", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 2, column: 1 }, "clear");
    const rowHeader = wrapper.get('[data-select-row="2"]');

    (rowHeader.element as HTMLButtonElement).focus();
    await rowHeader.trigger("keydown", { key: "F10", shiftKey: true });
    const dialog = getFloatingDialog();
    expect(dialog.attributes("aria-label")).toBe("Row actions");
    const sizeInput = dialog.get(".sheet-axis-context-menu__size-row input");
    await sizeInput.trigger("blur");
    expect(session.history.undoStack).toHaveLength(0);

    await sizeInput.setValue(40);
    (sizeInput.element as HTMLInputElement).focus();
    await sizeInput.trigger("keydown", { key: "Enter" });
    expect(getRowHeight(sheet, 2)).toBe(40);
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get('[data-select-row="2"]').trigger("contextmenu", {
      clientX: 16,
      clientY: 72,
    });
    await getFloatingDialog().get('[data-axis-action="clear"]').trigger("click");
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(2);
  });

  test("restores the triggering header focus when the keyboard-opened menu closes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { wrapper } = mountSheetGrid({ attachTo: host });
    try {
      const rowHeader = wrapper.get('[data-select-row="2"]');

      (rowHeader.element as HTMLButtonElement).focus();
      await rowHeader.trigger("keydown", { key: "F10", shiftKey: true });
      const dialog = getFloatingDialog();
      const actions = dialog.findAll<HTMLButtonElement>("[data-axis-action]");
      expect(document.activeElement).toBe(actions[0]?.element);

      await actions[0]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(actions[1]?.element);
      await actions[1]?.trigger("keydown", { key: "End" });
      expect(document.activeElement).toBe(actions.at(-1)?.element);
      await actions.at(-1)?.trigger("keydown", { key: "Home" });
      expect(document.activeElement).toBe(actions[0]?.element);

      await dialog.trigger("keydown", { key: "Escape" });

      expect(hasFloatingDialog()).toBe(false);
      expect(document.activeElement).toBe(rowHeader.element);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  test("defers a header selection while composing", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get("input.cell-editor");
    await editor.trigger("compositionstart");

    await wrapper.get('[data-select-row="2"]').trigger("mousedown", {
      button: 0,
    });
    expect(activeCell(wrapper)).toBe("A1");

    await editor.trigger("compositionend", { data: "" });
    expect(activeCell(wrapper)).toBe("A3");
  });
});
