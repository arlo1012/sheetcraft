// 未执行：按用户要求仅编写测试，不运行检查。
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, ref, type EffectScope } from "vue";
import {
  createSetSheetFilterCriteriaCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbook,
  createSheet,
  createWorkbookEvaluator,
  createSheetEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { useCameraActions } from "../../../modules/camera/useCameraActions";
import { paintCameraContent } from "../../../modules/camera/camera-painter";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";

const scopes: EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
});

function fixture(provideEvaluator = true) {
  const workbook = createWorkbook({ id: "cross-camera", sheetId: "owner", sheetName: "Owner" });
  const owner = getActiveSheet(workbook);
  const source = createSheet("Source Data", "source");
  insertSheet(workbook, source);
  owner.defaultColumnWidth = 40;
  owner.defaultRowHeight = 10;
  source.columnWidths.set(0, 140);
  source.columnWidths.set(1, 60);
  source.rowHeights.set(0, 30);
  source.rowHeights.set(1, 40);
  source.rowHeights.set(2, 50);
  setCellContent(source, { row: 0, column: 0 }, { kind: "literal", value: "Status" });
  setCellContent(source, { row: 0, column: 1 }, { kind: "literal", value: "Value" });
  setCellContent(
    source,
    { row: 1, column: 0 },
    { kind: "formula", formula: { source: '="keep"' } },
  );
  setCellContent(
    source,
    { row: 2, column: 0 },
    { kind: "formula", formula: { source: '="drop"' } },
  );
  setCellContent(source, { row: 1, column: 1 }, { kind: "literal", value: 10 });
  setCellContent(source, { row: 2, column: 1 }, { kind: "literal", value: 20 });
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  executeWorkbookCommand(
    session,
    createSetSheetFilterCriteriaCommand(
      source.id,
      {
        start: { row: 0, column: 0 },
        end: { row: 2, column: 1 },
      },
      [{ column: 0, allowedValues: [{ kind: "string", value: "keep" }] }],
    ),
  );
  const evaluator = createWorkbookEvaluator(workbook, owner.id);
  const forSheet = vi.fn((id: string) => evaluator.forSheet!(id));
  const revision = ref(session.history.revision);
  const execute = vi.fn((command: WorkbookCommand) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  scopes.push(scope);
  const actions = scope.run(() =>
    useCameraActions({
      getWorkbook: () => workbook,
      getSheet: () => owner,
      getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 1 } }),
      getGeneration: () => 0,
      getRevision: () => revision.value,
      ...(provideEvaluator ? { getEvaluator: () => ({ ...evaluator, forSheet }) } : {}),
      isBusy: () => false,
      flush: () => true,
      execute,
      name: () => "Camera",
    }),
  )!;
  return { workbook, owner, source, session, revision, execute, forSheet, actions };
}

function canvasHost() {
  const fillText = vi.fn();
  const methods: Record<string, unknown> = {
    fillText,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: (text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 3,
    }),
  };
  const context = new Proxy(methods, {
    get(target, key: string) {
      return target[key] ?? (target[key] = vi.fn());
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { fillText, element: document.createElement("canvas") };
}

describe("camera cross-sheet sources", () => {
  test.each([true, false])(
    "creates from another sheet using its formula-filtered geometry, provided evaluator=%s",
    (provided) => {
      const f = fixture(provided);
      const before = serializeWorkbook(f.workbook);
      const depth = f.session.history.undoStack.length;
      f.actions.open();
      const draft = f.actions.editing.value!;
      expect(draft.camera.sheetId).toBe(f.owner.id);
      expect(draft).toMatchObject({ width: 80, height: 30 });

      f.actions.confirm(draft, "'Source Data'!A1:B3");
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.owner.drawings).toHaveLength(1);
      expect(f.owner.drawings![0]).toMatchObject({
        id: draft.id,
        anchor: { row: 0, column: 0 },
        width: 200,
        height: 70,
        camera: {
          sheetId: f.source.id,
          gridLines: true,
          range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
        },
      });
      if (provided) expect(f.forSheet).toHaveBeenCalledWith(f.source.id);
      expect(f.source.drawings ?? []).toEqual([]);
      expect(f.actions.error.value).toBe(false);
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.session.history.undoStack).toHaveLength(depth + 1);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("edits an existing external camera back to a local source without resizing or duplicating it", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, "'Source Data'!A1:B3");
    const existing = { ...f.owner.drawings![0]!, width: 340, height: 180 } as SheetCameraDrawing;
    f.owner.drawings = [existing];
    f.actions.open(existing);
    const draft = f.actions.editing.value!;

    f.actions.confirm({ ...draft, camera: { ...draft.camera, gridLines: false } }, "Owner!D5:E5");
    expect(f.owner.drawings).toHaveLength(1);
    expect(f.owner.drawings![0]).toMatchObject({
      id: existing.id,
      width: 340,
      height: 180,
      camera: {
        sheetId: f.owner.id,
        gridLines: false,
        range: { start: { row: 4, column: 3 }, end: { row: 4, column: 4 } },
      },
    });
  });

  test("upgrades an edited legacy local camera to an explicit owner sheet ID", () => {
    const f = fixture();
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, "A1:B3");
    const original = f.owner.drawings![0] as SheetCameraDrawing;
    const legacy: SheetCameraDrawing = {
      ...original,
      camera: { range: original.camera.range, gridLines: original.camera.gridLines },
    };
    f.owner.drawings = [legacy];
    f.actions.open(legacy);
    f.actions.confirm(f.actions.editing.value!, "B2:B3");

    expect((f.owner.drawings![0] as SheetCameraDrawing).camera).toEqual({
      sheetId: f.owner.id,
      range: { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
      gridLines: true,
    });
  });

  test("keeps a draft when a previously available source sheet is removed before confirmation", () => {
    const f = fixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.workbook.sheets.delete(f.source.id);
    const before = serializeWorkbook(f.workbook);
    f.actions.confirm(draft, "'Source Data'!A1:B3");

    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBe(draft);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("paints text from the explicit source instead of the same coordinates on the camera owner", () => {
    const f = fixture();
    setCellContent(f.source, { row: 1, column: 1 }, { kind: "literal", value: "Source" });
    setCellContent(f.owner, { row: 1, column: 1 }, { kind: "literal", value: "Owner" });
    f.actions.open();
    f.actions.confirm(f.actions.editing.value!, "'Source Data'!A1:B3");
    const host = canvasHost();
    const images = createCanvasImageCache(() => {});
    try {
      paintCameraContent(
        host.element,
        {
          drawing: f.owner.drawings![0] as SheetCameraDrawing,
          sheet: f.owner,
          evaluator: createWorkbookEvaluator(f.workbook, f.owner.id),
          resolveSheet: (id) => f.workbook.sheets.get(id),
          revision: f.revision.value,
        },
        images,
      );
      expect(host.fillText.mock.calls.some(([text]) => text === "Source")).toBe(true);
      expect(host.fillText.mock.calls.some(([text]) => text === "Owner")).toBe(false);
    } finally {
      images.dispose();
    }
  });

  test.each(["missing sheet", "missing source evaluator", "invalidated range"] as const)(
    "paints REF rather than owner content for an unavailable source: %s",
    (missing) => {
      const f = fixture();
      f.actions.open();
      const draft = f.actions.editing.value!;
      const drawing: SheetCameraDrawing = {
        ...draft,
        camera: {
          ...draft.camera,
          sheetId: f.source.id,
          ...(missing === "invalidated range" ? { range: null } : {}),
        },
      };
      const host = canvasHost();
      const images = createCanvasImageCache(() => {});
      try {
        paintCameraContent(
          host.element,
          {
            drawing,
            sheet: f.owner,
            evaluator:
              missing === "missing source evaluator"
                ? createSheetEvaluator(f.owner)
                : createWorkbookEvaluator(f.workbook, f.owner.id),
            resolveSheet: (id) =>
              missing === "missing sheet" ? undefined : f.workbook.sheets.get(id),
            revision: f.revision.value,
          },
          images,
        );
        expect(host.fillText.mock.calls).toEqual([["#REF!", 8, 24]]);
      } finally {
        images.dispose();
      }
    },
  );
});
