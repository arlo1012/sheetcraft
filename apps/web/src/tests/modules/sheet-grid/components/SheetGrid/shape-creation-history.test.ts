import { nextTick } from "vue";
import { expect, test, vi } from "vitest";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { executeWorkbookCommand } from "@sheetcraft/core/history";
import { mountSheetGrid } from "./fixture";
import { SHAPE_GALLERY } from "../../../../../modules/sheet-drawings/shape-gallery";
import { createGraphicDrawing } from "../../../../../modules/sheet-drawings/drawing-defaults";
import type { ShapeCreationRequest } from "../../../../../modules/sheet-drawings/useShapeCreation";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";

test("creation mode routes workbook history, finish restores editor focus without stealing a dialog", async () => {
  const f = mountSheetGrid({ attachTo: document.body });
  const choice = SHAPE_GALLERY.flatMap((g) => g.items).find(
    (c) => c.kind === "preset" && c.preset === "rect",
  )!;
  if (choice.kind === "drawingTool") throw new Error("fixture");
  const base = createGraphicDrawing("new", "shape", "Rectangle", { row: 0, column: 0 });
  const request: ShapeCreationRequest = {
    workbook: f.session.workbook,
    sheet: f.sheet,
    requestId: 1,
    choice,
    continuous: true,
    base,
  };
  const commit = vi.fn((_request: ShapeCreationRequest, drawing: SheetGraphicDrawing) =>
    executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [drawing])),
  );
  await f.wrapper.setProps({
    shapeCreationRequest: request,
    shapeCreationCommit: commit,
    shapeCreationCancel: () => {},
  });
  executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [base]));
  const layer = f.wrapper.get("[data-shape-creation-layer]");
  expect(layer.element.parentElement?.className).toBe("sheet-grid__shape-creation-controls");
  expect(layer.element.closest(".sheet-grid__image-controls")).toBeNull();
  expect(f.wrapper.find("[data-sheet-fill-handle]").exists()).toBe(false);
  await layer.trigger("keydown", { key: "z", ctrlKey: true });
  expect(f.sheet.drawings ?? []).toEqual([]);
  await layer.trigger("keydown", { key: "z", metaKey: true, shiftKey: true });
  expect(f.sheet.drawings).toHaveLength(1);
  (layer.element as HTMLElement).focus();
  await f.wrapper.setProps({ shapeCreationRequest: undefined });
  await nextTick();
  expect(document.activeElement).toBe(f.wrapper.get("textarea.cell-editor").element);
  await f.wrapper.get("textarea.cell-editor").trigger("keydown", { key: "z", ctrlKey: true });
  expect(f.sheet.drawings ?? []).toEqual([]);
  await f.wrapper.setProps({ shapeCreationRequest: request });
  const dialog = document.createElement("div"),
    input = document.createElement("input");
  dialog.role = "dialog";
  dialog.append(input);
  document.body.append(dialog);
  input.focus();
  await f.wrapper.setProps({ shapeCreationRequest: undefined });
  await nextTick();
  expect(document.activeElement).toBe(input);
  dialog.remove();
  f.wrapper.unmount();
});
