import { DOMWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCellContent } from "@sheetcraft/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { activeCell, mountSheetGrid, triggerAxisHeader, triggerCell } from "./fixture";

function dispatchMouse(type: string, options: MouseEventInit): void {
  const event = new MouseEvent(
    type === "mousemove" ? "pointermove" : "pointerup",
    options,
  ) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: 1 });
  window.dispatchEvent(event);
}

function formulaReferences(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return (
    (
      wrapper.getComponent(SheetSurface).props("overlays") as {
        referenceGroups?: readonly { key: string; colorIndex: number }[];
      }
    ).referenceGroups ?? []
  );
}

describe("SheetGrid formula drafting", () => {
  test("completes SUM, picks a dragged reference, and commits to the original editor cell", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=s");
    await nextTick();
    const suggestion = new DOMWrapper(document.body).get('[data-formula-suggestion="SUM"]');
    await suggestion.trigger("pointerdown");
    await nextTick();
    expect(editor.element.value).toBe("=SUM(");

    await triggerCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 154,
      clientY: 38,
    });
    dispatchMouse("mousemove", { buttons: 1, clientX: 250, clientY: 42 });
    dispatchMouse("mouseup", { button: 0, clientX: 250, clientY: 42 });
    await nextTick();

    expect(editor.element.value).toBe("=SUM(B1:C2");
    expect(activeCell(wrapper)).toBe("A1");
    expect(formulaReferences(wrapper)).toHaveLength(1);

    await editor.trigger("keydown", { key: "F4" });
    expect(editor.element.value).toBe("=SUM($B$1:$C$2");
    await editor.trigger("keydown", { key: "Enter" });
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM($B$1:$C$2)" },
    });
    expect(activeCell(wrapper)).toBe("A2");
    expect(formulaReferences(wrapper)).toHaveLength(0);
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("dismisses a formula suggestion before Escape cancels the owning draft", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=s");
    await nextTick();
    expect(document.querySelector('[data-formula-suggestion="SUM"]')).not.toBeNull();

    await editor.trigger("keydown", { key: "Escape" });
    expect(document.querySelector('[data-formula-suggestion="SUM"]')).toBeNull();
    expect(editor.classes()).toContain("is-editing");
    await editor.trigger("keydown", { key: "Escape" });

    expect(editor.classes()).not.toContain("is-editing");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("cancels an active reference drag when its local edit is canceled", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=SUM(");

    await triggerCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 154,
      clientY: 12,
    });
    await editor.trigger("keydown", { key: "Escape" });
    dispatchMouse("mouseup", { button: 0, clientX: 250, clientY: 42 });
    await nextTick();

    expect(editor.classes()).not.toContain("is-editing");
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("keeps the caret at the inserted reference before an existing suffix", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.cells.set("0:0", {
          content: { kind: "formula", formula: { source: "=SUM(A1)+42" } },
        });
      },
    });
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "F2" });
    editor.element.focus();
    editor.element.setSelectionRange(7, 7);

    await triggerCell(wrapper, { row: 0, column: 1 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 154,
      clientY: 12,
    });
    await nextTick();

    expect(editor.element.value).toBe("=SUM(B1)+42");
    expect(editor.element.selectionStart).toBe(7);
    expect(editor.element.selectionEnd).toBe(7);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "formula",
      formula: { source: "=SUM(A1)+42" },
    });
  });

  test("renders each formula reference geometry with a stable colored outline", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");

    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=SUM(A1,B2,A1:C2)");
    await nextTick();

    const references = formulaReferences(wrapper);
    expect(references).toHaveLength(3);
    expect(references.map((reference) => reference.key)).toEqual(["0:0-0:0", "1:1-1:1", "0:0-1:2"]);
    expect(references.map((reference) => reference.colorIndex)).toEqual([0, 1, 2]);
  });

  test("uses row and column headers as whole-axis references without ending the draft", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=SUM(");

    await triggerAxisHeader(wrapper, "column", 1);
    expect(editor.element.value).toBe("=SUM(B:B");
    expect(activeCell(wrapper)).toBe("A1");

    await triggerAxisHeader(wrapper, "column", 3, "pointerdown", { shiftKey: true });
    expect(editor.element.value).toBe("=SUM(B:D");
    expect(activeCell(wrapper)).toBe("A1");

    await triggerAxisHeader(wrapper, "row", 2);
    expect(editor.element.value).toBe("=SUM(3:3");
    await triggerAxisHeader(wrapper, "row", 4, "pointerdown", { shiftKey: true });
    expect(editor.element.value).toBe("=SUM(3:5");
    expect(activeCell(wrapper)).toBe("A1");
  });
});
