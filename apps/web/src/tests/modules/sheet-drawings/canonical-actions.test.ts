import { computed, effectScope, ref } from "vue";
import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { isFramedShapeDrawing } from "@sheetcraft/core/sheet-drawings";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import { framedShape } from "./framed-shape-fixture";
function fixture() {
  const book = ref(createWorkbook({ id: "book", sheetId: "sheet" })),
    sheet = getActiveSheet(book.value),
    revision = ref(0);
  const shape = framedShape();
  sheet.drawings = [shape];
  shape.shapeFrame.anchor = {
    mode: "move-only",
    origin: { column: { index: 2, offset: 4 }, row: { index: 2, offset: 7 } },
    size: { width: 240, height: 120 },
  };
  const metrics = computed(() => {
    void revision.value;
    return createPictureSheetMetrics(sheet);
  });
  const session = createWorkbookSession({
    workbook: book.value,
    idFactory: createSequentialIdFactory(),
  });
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const ok = executeWorkbookCommand(session, command);
    if (ok) revision.value++;
    return ok;
  });
  const flush = vi.fn(() => true),
    scope = effectScope();
  const options = {
    getWorkbook: () => book.value,
    getSheet: () => sheet,
    getRevision: () => revision.value,
    getGeneration: () => 0,
    getAddress: () => ({ row: 0, column: 0 }),
    isBusy: () => false,
    flush,
    execute,
    getMetrics: () => metrics.value,
  };
  const actions = scope.run(() => useDrawingActions({ ...options, name: (k) => k }))!;
  return { book, sheet, revision, metrics, session, execute, flush, scope, options, actions };
}
test("canonical dialog resolves after a real flush changes metrics and commits against its exact surviving source", () => {
  const f = fixture();
  try {
    const owner = f.sheet.drawings![0]!;
    if (!isFramedShapeDrawing(owner)) throw new Error("fixture");
    f.flush.mockImplementation(() => {
      f.sheet.hiddenRows = new Set([0]);
      f.revision.value++;
      return true;
    });
    f.actions.edit(owner);
    expect(f.actions.editing.value?.offsetY).toBe(7);
    expect(f.actions.editing.value?.anchor.row).toBe(2);
    expect(() => f.actions.normalizeDialogDrawing.value?.(f.actions.editing.value!)).not.toThrow();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.actions.confirm({ ...f.actions.editing.value!, name: "changed" })).toBe(true);
    expect(f.sheet.drawings![0]?.name).toBe("changed");
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(60);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  } finally {
    f.scope.stop();
  }
});
test("canonical dialog rejects a metrics change after opening and preserves the draft", () => {
  const f = fixture();
  try {
    const owner = f.sheet.drawings![0]!;
    if (!isFramedShapeDrawing(owner)) throw new Error("fixture");
    f.actions.edit(owner);
    const dialog = f.actions.dialog.value!;
    const before = serializeWorkbook(f.session.workbook);
    f.sheet.hiddenRows = new Set([0]);
    f.revision.value++;
    expect(f.actions.confirm({ ...dialog.initial, text: "kept draft" })).toBe(false);
    expect(f.actions.dialog.value).toBe(dialog);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.sheet.drawings![0]).toBe(owner);
    expect(before.sheets[0]!.drawings).toEqual(
      serializeWorkbook(f.session.workbook).sheets[0]!.drawings,
    );
  } finally {
    f.scope.stop();
  }
});
test("real canvas creation emits canonical defaults in one reversible history transaction", () => {
  const f = fixture();
  try {
    f.sheet.drawings = [];
    const actions = f.scope.run(() => useShapeCreation(f.options))!;
    const choice = SHAPE_GALLERY.flatMap((g) => g.items).find(
      (c) => c.kind === "preset" && c.preset === "rect",
    )!;
    expect(actions.start(choice, false)).toBe(true);
    const request = actions.request.value!;
    expect(actions.commit(request, { ...request.base, shapeGeometry: { preset: "rect" } })).toBe(
      true,
    );
    expect(isFramedShapeDrawing(f.sheet.drawings[0]!)).toBe(true);
    expect(
      isFramedShapeDrawing(f.sheet.drawings[0]!)
        ? f.sheet.drawings[0]!.shapeFrame.anchor.mode
        : undefined,
    ).toBe("move-and-size");
    expect(Object.hasOwn(f.sheet.drawings[0]!, "anchor")).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    expect(after.version).toBe(60);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(f.sheet.drawings).toEqual([]);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
  } finally {
    f.scope.stop();
  }
});
