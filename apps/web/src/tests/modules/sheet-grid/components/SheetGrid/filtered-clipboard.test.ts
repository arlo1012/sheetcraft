import { describe, expect, test } from "vitest";
import { getCellValue, setCellValue } from "@idea10/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

function selectionRects(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return (wrapper.getComponent(SheetSurface).props("overlays") as { rangeRects?: unknown[] })
    .rangeRects;
}

describe("SheetGrid filtered clipboard", () => {
  test("pastes through the history command into visible rows only, then undoes and redoes", async () => {
    const { session, sheet, wrapper } = mountSheetGrid({
      beforeMount(target) {
        setCellValue(target, { row: 1, column: 0 }, "one");
        setCellValue(target, { row: 2, column: 0 }, "hidden");
        setCellValue(target, { row: 3, column: 0 }, "three");
        setCellValue(target, { row: 4, column: 0 }, "four");
        target.filter = {
          range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
          columns: [
            {
              column: 0,
              allowedValues: [
                { kind: "string", value: "one" },
                { kind: "string", value: "three" },
                { kind: "string", value: "four" },
              ],
            },
          ],
        };
      },
    });
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    await triggerCell(wrapper, { row: 4, column: 1 }, "mousedown", { button: 0, shiftKey: true });

    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(
        createTestClipboardEvent("paste", new Map([["text/plain", "pasted"]])).event,
      );
    await wrapper.vm.$nextTick();

    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("pasted");
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe("pasted");
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBe("pasted");
    expect(session.history.undoStack).toHaveLength(1);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBeNull();

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "y", ctrlKey: true });
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBe("pasted");
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBeNull();
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe("pasted");
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBe("pasted");
  });

  test("rejects a merged-target paste without creating history or moving the selection", async () => {
    const { session, sheet, wrapper } = mountSheetGrid({
      beforeMount(target) {
        target.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
      },
    });
    await triggerCell(wrapper, { row: 1, column: 1 }, "mousedown", { button: 0 });
    const before = { active: activeCell(wrapper), selection: selectionRects(wrapper) };

    wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(
        createTestClipboardEvent("paste", new Map([["text/plain", "blocked"]])).event,
      );
    await wrapper.vm.$nextTick();

    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
    expect({ active: activeCell(wrapper), selection: selectionRects(wrapper) }).toEqual(before);
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false);
  });
});
