import { effectScope, ref } from "vue";
import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, createSheet } from "@sheetcraft/core/workbook";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { useOwnedShapeFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeFormatPane";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createPictureFormat3d,
  createPictureRotation3d,
} from "../../../modules/sheet-images/picture-effect-edit";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";
function fixture(legacy = false) {
  const wb = ref(createWorkbook({ id: "w", sheetId: "s" })),
    sheet = ref(getActiveSheet(wb.value)),
    revision = ref(0),
    generation = ref(0),
    busy = ref(false);
  const drawing = createGraphicDrawing("d", "shape", "shape", { row: 0, column: 0 });
  delete drawing.shapeText;
  if (legacy) delete drawing.shapeGeometry;
  sheet.value.drawings = [drawing];
  const session = createWorkbookSession({
    workbook: wb.value,
    idFactory: createSequentialIdFactory(),
  });
  const update = vi.fn((next: SheetDrawing, owner: SheetDrawing) => {
    if (sheet.value.drawings?.find((d) => d.id === owner.id) !== owner) return false;
    const changed = executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.value.id, [next]),
    );
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  const pane = scope.run(() =>
    useOwnedShapeFormatPane({
      getWorkbook: () => wb.value,
      getSheet: () => sheet.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      isBusy: () => busy.value,
      flush: () => true,
      update,
      isAssetAvailable: () => true,
      getUnsupportedReason: () => "Pending",
    }),
  )!;
  expect(pane.open(sheet.value.drawings![0]!)).toBe(true);
  const intent = (body: Record<string, unknown>): ShapeFormatIntent =>
    ({
      ...body,
      owner: { ...pane.snapshot.value!.owner },
      baseRevision: revision.value,
      intentId: `i-${revision.value}`,
    }) as ShapeFormatIntent;
  return { wb, sheet, revision, generation, busy, session, update, scope, pane, intent };
}
test.each([false, true])(
  "actual style command/Undo/Redo/internal58 snapshot preserves owner and data; legacy%s",
  (legacy) => {
    const f = fixture(legacy);
    try {
      const before = serializeWorkbook(f.wb.value),
        owner = f.pane.snapshot.value!.owner;
      expect(
        f.pane.onIntent(
          f.intent({
            type: "set-style",
            target: "shape",
            category: "fill",
            value: {
              kind: "value",
              value: { kind: "solid", color: { kind: "rgb", rgb: "#abcdef" }, opacity: 0.5 },
            },
          }),
        ),
      ).toBe(true);
      expect(f.pane.snapshot.value?.owner).toEqual(owner);
      expect(f.pane.snapshot.value?.acceptedIntentId).toBe("i-0");
      const after = serializeWorkbook(f.wb.value);
      expect(after.version).toBe(58);
      expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(serializeWorkbook(f.wb.value)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(serializeWorkbook(f.wb.value)).toEqual(after);
    } finally {
      f.scope.stop();
    }
  },
);
test("unstyled legacy enabled fields succeed without migration and last override may return to inherited", () => {
  const f = fixture(true);
  try {
    const before = serializeWorkbook(f.wb.value).version;
    expect(f.pane.onIntent(f.intent({ type: "set-field", field: "sizeWidthPt", value: 225 }))).toBe(
      true,
    );
    expect(f.sheet.value.drawings?.[0]?.width).toBe(300);
    expect(serializeWorkbook(f.wb.value).version).toBe(before);
    expect(
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "shape",
          category: "shadow",
          value: { kind: "none" },
        }),
      ),
    ).toBe(true);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "shadow", value: undefined }),
      ),
    ).toBe(true);
    expect(f.pane.snapshot.value?.drawing.shapeStyle).toBeUndefined();
  } finally {
    f.scope.stop();
  }
});
test("false/throw/stale revision/owner/permission do not change snapshot or history", () => {
  const f = fixture();
  try {
    const before = serializeWorkbook(f.wb.value),
      old = f.intent({ type: "set-field", field: "sizeWidthPt", value: 225 });
    f.update.mockReturnValueOnce(false);
    expect(f.pane.onIntent(old)).toBe(false);
    f.update.mockImplementationOnce(() => {
      throw Error("rejected");
    });
    expect(f.pane.onIntent(old)).toBe(false);
    expect(serializeWorkbook(f.wb.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.revision.value++;
    expect(f.pane.onIntent(old)).toBe(false);
    const current = f.intent({ type: "set-field", field: "rotationDeg", value: 37 });
    f.busy.value = true;
    expect(f.pane.onIntent(current)).toBe(false);
    f.busy.value = false;
    f.sheet.value.properties.protected = true;
    expect(f.pane.onIntent(current)).toBe(false);
    expect(serializeWorkbook(f.wb.value).sheets[0]?.drawings).toEqual(before.sheets[0]?.drawings);
    f.sheet.value = createSheet("other", "other");
    expect(f.pane.snapshot.value).toBeNull();
    expect(f.pane.onIntent(current)).toBe(false);
  } finally {
    f.scope.stop();
  }
});
test("out-of-Core-range rotation is rejected and independent text controls are available", () => {
  const f = fixture();
  try {
    expect(f.pane.capabilities.value.fields.rotationDeg?.max).toBe(360);
    expect(f.pane.onIntent(f.intent({ type: "set-field", field: "rotationDeg", value: 720 }))).toBe(
      false,
    );
    expect(f.pane.onIntent(f.intent({ type: "set-field", field: "textWrap", value: false }))).toBe(
      true,
    );
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "text", category: "fill", value: { kind: "none" } }),
      ),
    ).toBe(true);
    f.sheet.value.drawings![0]!.text = "text";
    f.revision.value++;
    expect(f.pane.capabilities.value.styles?.shape?.rotation3d?.enabled).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(2);
  } finally {
    f.scope.stop();
  }
});

test.each([false, true])("stroke-only line has no active fill control; legacy %s", (legacy) => {
  const f = fixture(legacy);
  try {
    const d = f.sheet.value.drawings![0]!;
    if (d.kind !== "shape") throw new Error("Expected the fixture shape.");
    d.shape = "line";
    if (!legacy) d.shapeGeometry = { preset: "line" };
    f.revision.value++;
    expect(f.pane.capabilities.value.styles?.shape?.fill?.enabled).toBe(false);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "fill", value: { kind: "none" } }),
      ),
    ).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
  } finally {
    f.scope.stop();
  }
});

test("existing 3D body accepts and removes projection while preserving legacy text", () => {
  const f = fixture();
  try {
    const drawing = f.sheet.value.drawings![0]!;
    if (drawing.kind !== "shape") throw new Error("Expected shape.");
    drawing.text = "preserved text";
    drawing.shapeStyle = {
      format3d: { kind: "value", value: createPictureFormat3d() },
      rotation3d: { kind: "value", value: createPictureRotation3d("parallel") },
    };
    f.revision.value++;
    const original = serializeWorkbook(f.wb.value);
    expect(f.pane.capabilities.value.styles?.shape?.format3d?.enabled).toBe(true);
    expect(f.pane.capabilities.value.styles?.shape?.rotation3d?.enabled).toBe(true);
    expect(
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "shape",
          category: "rotation3d",
          value: { kind: "value", value: createPictureRotation3d("perspective") },
        }),
      ),
    ).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "shape",
          category: "format3d",
          value: { kind: "none" },
        }),
      ),
    ).toBe(true);
    expect(f.pane.snapshot.value?.drawing.text).toBe("preserved text");
    expect(f.pane.capabilities.value.styles?.shape?.format3d?.enabled).toBe(true);
    expect(
      f.pane.onIntent(
        f.intent({ type: "set-style", target: "shape", category: "rotation3d", value: undefined }),
      ),
    ).toBe(true);
    expect(f.pane.snapshot.value?.drawing.text).toBe("preserved text");
    expect(f.pane.snapshot.value?.drawing.shapeStyle).toEqual({ format3d: { kind: "none" } });
    expect(f.session.history.undoStack).toHaveLength(3);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.wb.value)).toEqual(original);
  } finally {
    f.scope.stop();
  }
});
