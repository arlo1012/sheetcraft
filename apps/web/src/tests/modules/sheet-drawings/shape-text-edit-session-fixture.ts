import { effectScope, markRaw, reactive, ref, shallowRef } from "vue";
import { vi } from "vitest";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { normalizeSheetDrawings, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type {
  ShapeGroupDrawing,
  ShapeGroupedGroup,
  SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { prepareShapeTextUpdate } from "../../../modules/sheet-drawings/prepare-shape-text-update";
import type { DrawingShapeTextRuntimeOptions } from "../../../modules/sheet-drawings/shape-text-runtime";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useShapeTextEditSession } from "../../../modules/sheet-drawings/useShapeTextEditSession";
import { framedShape } from "./framed-shape-fixture";

export const measurement: DrawingShapeTextRuntimeOptions = {
  measurer: {
    measure: (text) => [...text].length * 10,
    measureMetrics: (text) => ({
      width: [...text].length * 10,
      ascent: 15,
      descent: 5,
      inkLeft: 0,
      inkRight: [...text].length * 10,
    }),
  },
  normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
  resolveNormalLineMetrics: () => ({ ascent: 15, descent: 5, lineAdvance: 20 }),
};
const viewport = createSheetViewportLayout({
  geometry: createSheetGeometry({ rowCount: 100, columnCount: 30, rowHeight: 24, columnWidth: 80 }),
  rows: createRowVisibilityIndex({ rowCount: 100, defaultRowHeight: 24 }),
  viewportSize: { width: 600, height: 400 },
});
export function textRoot(kind: "shape" | "textBox" = "shape") {
  const drawing = framedShape();
  drawing.id = "target";
  drawing.kind = kind;
  drawing.text = "Original\ntext";
  drawing.rotation = 37;
  if (kind === "shape") {
    drawing.shapeFlipX = true;
    drawing.shapeFlipY = true;
    drawing.shapeStyle = { glow: { kind: "none" } };
  } else {
    delete drawing.shapeGeometry;
  }
  drawing.shapeProperties = {
    lockAspectRatio: true,
    altTitle: "Preserved title",
    printObject: false,
  };
  return drawing;
}
export function connectorRoot() {
  const drawing = framedShape();
  drawing.id = "connector";
  drawing.text = "";
  drawing.rotation = 0;
  drawing.shapeGeometry = { preset: "bentConnector3" };
  drawing.shapeFrame.anchor = { mode: "fixed", x: 600, y: 40, size: { width: 140, height: 80 } };
  drawing.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
    end: { kind: "free", xRatio: 1, yRatio: 1 },
  };
  return drawing;
}
function owned(drawing = textRoot()): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = drawing;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.6, heightRatio: 0.35 },
    },
  };
}
export function deepRoot(withOwnedConnector = false): ShapeGroupDrawing {
  const nested: ShapeGroupedGroup = {
    kind: "shapeGroup",
    id: "nested",
    name: "Nested owner",
    rotation: 23,
    shapeProperties: { altDescription: "Nested metadata" },
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.1, widthRatio: 0.7, heightRatio: 0.8 },
    },
    members: [owned()],
  };
  return {
    kind: "shapeGroup",
    id: "outer",
    name: "Outer owner",
    rotation: -18,
    shapeProperties: { locked: false, altTitle: "Outer metadata" },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 80, y: 100, size: { width: 600, height: 400 } },
    },
    members: withOwnedConnector ? [nested, owned(connectorRoot())] : [nested],
  };
}
export function fixture(
  drawings: SheetDrawing[] = [textRoot()],
  paintBoundary?: Parameters<typeof prepareShapeTextUpdate>[4],
) {
  const workbook = reactive(createWorkbook({ id: "text-session", sheetId: "sheet" }));
  const sheet = getActiveSheet(workbook);
  sheet.drawings = normalizeSheetDrawings(drawings);
  const workbookRef = shallowRef(workbook),
    sheetRef = shallowRef(sheet),
    generation = ref(0),
    revision = ref(0),
    busy = ref(false),
    metrics = shallowRef(markRaw(createPictureSheetMetrics(sheet))),
    scope = effectScope();
  const core = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const execute = vi.fn((command: WorkbookCommand) => {
    const result = executeWorkbookCommand(core, command);
    if (result) revision.value++;
    return result;
  });
  const flush = vi.fn(() => true);
  const beforePrepare = vi.fn((_drawing: SheetDrawing) => {});
  const prepare = vi.fn(
    (drawing: SheetDrawing, owner?: SheetDrawing, forest?: readonly SheetDrawing[]) => {
      beforePrepare(drawing);
      return prepareShapeTextUpdate(
        drawing,
        owner,
        viewport,
        measurement,
        paintBoundary,
        metrics.value,
        {
          candidateForest: forest!,
          sourceForest: sheetRef.value.drawings!,
          revision: revision.value,
        },
      );
    },
  );
  const connectedPreflight = vi.fn(() => true);
  const host = {
    getWorkbook: () => workbookRef.value,
    getSheet: () => sheetRef.value,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getMetrics: () => metrics.value,
    isBusy: () => busy.value,
    flush,
  };
  const actions = scope.run(() =>
    useDrawingActions({
      ...host,
      getAddress: () => ({ row: 0, column: 0 }),
      name: (kind) => kind,
      execute,
      prepareDrawing: prepare,
      preflightConnectedCollection: connectedPreflight,
    }),
  )!;
  const replaceCollection = vi.fn(actions.replaceCollection);
  const editor = scope.run(() => useShapeTextEditSession({ ...host, replaceCollection }))!;
  function begin(root = sheet.drawings![0]!, path?: readonly string[]) {
    if (!editor.begin(root, path)) throw Error("Fixture text session did not open");
    return editor.callbacks(editor.snapshot.value!.sessionId);
  }
  return {
    workbook,
    sheet,
    workbookRef,
    sheetRef,
    generation,
    revision,
    busy,
    metrics,
    scope,
    core,
    execute,
    flush,
    beforePrepare,
    prepare,
    connectedPreflight,
    replaceCollection,
    editor,
    begin,
  };
}
