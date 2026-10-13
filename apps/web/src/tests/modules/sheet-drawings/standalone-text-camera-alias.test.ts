import { effectScope, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorShapeFrameRect } from "@sheetcraft/core/shape-frame";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { useOwnedShapeFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeFormatPane";
import {
  prepareDrawingShapeTextCandidate,
  type DrawingShapeTextRuntimeOptions,
} from "../../../modules/sheet-drawings/shape-text-runtime";
import { shapeTextFollowsBodyProjection } from "../../../modules/sheet-drawings/shape-text-projection";
import {
  createPictureFormat3d,
  createPictureRotation3d,
} from "../../../modules/sheet-images/picture-effect-edit";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((stop) => stop()));
const measurement: DrawingShapeTextRuntimeOptions = {
  measurer: {
    measure: (text) => text.length * 10,
    measureMetrics: (text) => ({
      width: text.length * 10,
      ascent: 15,
      descent: 5,
      inkLeft: 0,
      inkRight: text.length * 10,
    }),
  },
  normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
  resolveNormalLineMetrics: () => ({ ascent: 15, descent: 5, lineAdvance: 20 }),
};
function camera(xDeg: number): ShapeDetailedStyle["rotation3d"] {
  return { kind: "value", value: { ...createPictureRotation3d(), xDeg } };
}
function depth(depthPt: number): ShapeDetailedStyle["format3d"] {
  return { kind: "value", value: { ...createPictureFormat3d(), depthPt } };
}
function fixture(kind: "shape" | "textBox", framed = false, savedText = true, savedBody = true) {
  const workbook = ref(createWorkbook({ id: "camera-alias", sheetId: "drawings" })),
    sheet = ref(getActiveSheet(workbook.value)),
    revision = ref(0),
    busy = ref(false);
  const metrics = createPictureSheetMetrics(sheet.value);
  const legacy = createGraphicDrawing("d", kind, "Drawing", { row: 0, column: 0 });
  legacy.text = savedText ? "alpha beta" : "";
  legacy.rotation = 37;
  if (savedBody) legacy.shapeStyle = { rotation3d: camera(20), format3d: depth(0) };
  if (savedText) {
    legacy.shapeText = {
      ...createDefaultShapeText(),
      style: { rotation3d: camera(12), format3d: depth(12) },
      characterRuns: [{ start: 0, end: 5, bold: true }],
    };
  } else {
    delete legacy.shapeText;
    legacy.textDirection = "vertical";
  }
  if (framed) {
    const { anchor: _anchor, offsetX, offsetY, width, height, ...appearance } = legacy;
    sheet.value.drawings = [
      normalizeSheetDrawing({
        ...appearance,
        kind,
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: anchorShapeFrameRect(
            "move-only",
            { x: offsetX, y: offsetY, width, height },
            metrics,
          ),
        },
      }),
    ];
  } else sheet.value.drawings = [normalizeSheetDrawing(legacy)];
  const session = createWorkbookSession({
    workbook: workbook.value,
    idFactory: createSequentialIdFactory(),
  });
  const update = vi.fn((next: SheetDrawing, owner: SheetDrawing) => {
    if (sheet.value.drawings?.find((drawing) => drawing.id === owner.id) !== owner) return false;
    const changed = executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(sheet.value.id, [next]),
    );
    if (changed) revision.value++;
    return changed;
  });
  const prepareText = vi.fn((next: SheetGraphicDrawing) =>
    prepareDrawingShapeTextCandidate(next, measurement),
  );
  const scope = effectScope();
  const pane = scope.run(() =>
    useOwnedShapeFormatPane({
      getWorkbook: () => workbook.value,
      getSheet: () => sheet.value,
      getGeneration: () => 0,
      getRevision: () => revision.value,
      getMetrics: () => metrics,
      isBusy: () => busy.value,
      flush: () => true,
      update,
      prepareText,
      isAssetAvailable: () => true,
      getUnsupportedReason: () => "Unavailable",
    }),
  )!;
  cleanup.push(() => scope.stop());
  const source = () => {
    const drawing = sheet.value.drawings![0]!;
    if (drawing.kind !== "shape" && drawing.kind !== "textBox") throw Error("Expected leaf");
    return drawing;
  };
  expect(pane.open(source())).toBe(true);
  const intent = (
    target: "shape" | "text",
    category: "rotation3d" | "format3d",
    value: ShapeDetailedStyle["rotation3d"] | ShapeDetailedStyle["format3d"],
  ): ShapeFormatIntent =>
    ({
      type: "set-style",
      owner: { ...pane.snapshot.value!.owner },
      baseRevision: revision.value,
      intentId: `alias-${revision.value}`,
      target,
      category,
      value,
    }) as ShapeFormatIntent;
  return { workbook, sheet, revision, busy, session, update, prepareText, pane, source, intent };
}

describe("standalone Text Options aliases the genuine body camera", () => {
  test.each([
    ["shape", false],
    ["shape", true],
    ["textBox", false],
    ["textBox", true],
  ] as const)(
    "%s framed=%s preserves independent glyph sources through edits/history",
    (kind, framed) => {
      const f = fixture(kind, framed),
        before = serializeWorkbook(f.workbook.value),
        originalText = JSON.stringify(f.source().shapeText),
        owner = f.pane.snapshot.value!.owner,
        originalSource = f.source(),
        originalFrame = isFramedShapeDrawing(originalSource)
          ? JSON.stringify(originalSource.shapeFrame)
          : undefined;
      expect(f.pane.snapshot.value!.shapeStyle?.rotation3d).toEqual(camera(20));
      expect(f.pane.snapshot.value!.textStyle?.rotation3d).toEqual(camera(20));
      expect(f.pane.snapshot.value!.textStyle?.format3d).toEqual(depth(12));
      expect(f.pane.snapshot.value!.independentTextCameraCount).toBe(1);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
      expect(f.session.history.undoStack).toEqual([]);

      expect(f.pane.onIntent(f.intent("text", "rotation3d", camera(45)))).toBe(true);
      expect(f.source().shapeStyle?.rotation3d).toEqual(camera(45));
      expect(f.source().shapeStyle?.format3d).toEqual(depth(0));
      expect(JSON.stringify(f.source().shapeText)).toBe(originalText);
      expect(f.pane.snapshot.value!.owner).toEqual(owner);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBe("alias-0");
      expect(f.pane.snapshot.value!.shapeStyle?.rotation3d).toEqual(camera(45));
      expect(f.pane.snapshot.value!.textStyle?.rotation3d).toEqual(camera(45));
      expect(f.session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.workbook.value);
      expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
      if (kind === "textBox") expect(after.version).toBe(68);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(serializeWorkbook(f.workbook.value)).toEqual(after);

      expect(f.pane.onIntent(f.intent("shape", "rotation3d", camera(30)))).toBe(true);
      expect(f.pane.snapshot.value!.textStyle?.rotation3d).toEqual(camera(30));
      expect(f.pane.onIntent(f.intent("text", "rotation3d", { kind: "none" }))).toBe(true);
      expect(f.pane.snapshot.value!.shapeStyle?.rotation3d).toEqual({ kind: "none" });
      expect(f.pane.snapshot.value!.textStyle?.rotation3d).toEqual({ kind: "none" });
      expect(f.pane.onIntent(f.intent("text", "rotation3d", undefined))).toBe(true);
      expect(f.source().shapeStyle?.rotation3d).toBeUndefined();
      expect(f.pane.snapshot.value!.shapeStyle?.rotation3d).toBeUndefined();
      expect(f.pane.snapshot.value!.textStyle?.rotation3d).toBeUndefined();
      expect(JSON.stringify(f.source().shapeText)).toBe(originalText);
      expect(f.pane.snapshot.value!.independentTextCameraCount).toBe(1);
      expect(f.session.history.undoStack).toHaveLength(4);
      const source = f.source();
      if (isFramedShapeDrawing(source))
        expect(JSON.stringify(source.shapeFrame)).toBe(originalFrame);
    },
  );

  test.each(["shape", "textBox"] as const)("%s text depth stays glyph-owned", (kind) => {
    const f = fixture(kind, true),
      originalBody = JSON.stringify(f.source().shapeStyle);
    expect(f.pane.onIntent(f.intent("text", "format3d", depth(18)))).toBe(true);
    expect(JSON.stringify(f.source().shapeStyle)).toBe(originalBody);
    expect(f.source().shapeText?.style?.format3d).toEqual(depth(18));
    expect(f.source().shapeText?.style?.rotation3d).toEqual(camera(12));
    expect(f.pane.snapshot.value!.textStyle?.rotation3d).toEqual(camera(20));
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("legacy empty TextBox camera is live without materializing text or other body capabilities", () => {
    const f = fixture("textBox", false, false, false),
      before = serializeWorkbook(f.workbook.value);
    expect(f.pane.snapshot.value!.independentTextCameraCount).toBe(0);
    expect(f.pane.snapshot.value!.textStyle?.rotation3d).toBeUndefined();
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.prepareText).not.toHaveBeenCalled();
    expect(f.pane.capabilities.value.styles?.shape?.rotation3d?.enabled).toBe(true);
    expect(f.pane.capabilities.value.styles?.text?.rotation3d?.enabled).toBe(true);
    for (const category of [
      "fill",
      "line",
      "shadow",
      "reflection",
      "glow",
      "softEdges",
      "format3d",
    ] as const)
      expect(f.pane.capabilities.value.styles?.shape?.[category]?.enabled).toBe(false);
    expect(f.pane.onIntent(f.intent("shape", "format3d", depth(24)))).toBe(false);
    expect(f.pane.onIntent(f.intent("text", "rotation3d", camera(45)))).toBe(true);
    expect(f.source().shapeStyle?.rotation3d).toEqual(camera(45));
    expect(f.source().shapeText).toBeUndefined();
    expect(f.source().textDirection).toBe("vertical");
    expect(isFramedShapeDrawing(f.source())).toBe(false);
    expect(f.prepareText).not.toHaveBeenCalled();
    const view = f.source();
    if (isFramedShapeDrawing(view)) throw Error("Expected legacy TextBox");
    expect(shapeTextFollowsBodyProjection(view)).toBe(true);
    const projected = serializeWorkbook(f.workbook.value);
    expect(projected.version).toBe(68);
    expect(serializeWorkbook(deserializeWorkbook(projected))).toEqual(projected);
    expect(f.pane.onIntent(f.intent("text", "rotation3d", undefined))).toBe(true);
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(2);
  });

  test.each(["shape", "textBox"] as const)(
    "%s alias rejects failures without losing old sources/history",
    (kind) => {
      const f = fixture(kind, true),
        before = serializeWorkbook(f.workbook.value),
        source = f.source(),
        edit = f.intent("text", "rotation3d", camera(45));
      f.update.mockReturnValueOnce(false);
      expect(f.pane.onIntent(edit)).toBe(false);
      f.update.mockImplementationOnce(() => {
        throw Error("Rejected");
      });
      expect(f.pane.onIntent(edit)).toBe(false);
      f.prepareText.mockImplementationOnce(() => {
        throw Error("Text paint budget rejected");
      });
      expect(f.pane.onIntent(edit)).toBe(false);
      expect(f.pane.onIntent(f.intent("text", "rotation3d", camera(NaN)))).toBe(false);
      expect(f.source()).toBe(source);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
      expect(f.session.history.undoStack).toEqual([]);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
      f.busy.value = true;
      expect(f.pane.onIntent(edit)).toBe(false);
      f.busy.value = false;
      f.sheet.value.properties.protected = true;
      expect(f.pane.onIntent(edit)).toBe(false);
      f.sheet.value.properties.protected = false;
      f.revision.value++;
      expect(f.pane.onIntent(edit)).toBe(false);
      const current = f.intent("text", "rotation3d", camera(45));
      f.pane.close();
      expect(f.pane.open(source)).toBe(true);
      expect(f.pane.onIntent(current)).toBe(false);
      expect(serializeWorkbook(f.workbook.value)).toEqual(before);
      expect(f.session.history.undoStack).toEqual([]);
    },
  );

  test("camera alias retains the text-preflight exact-owner CAS", () => {
    const f = fixture("shape", true),
      before = serializeWorkbook(f.workbook.value);
    f.prepareText.mockImplementationOnce((next) => {
      f.revision.value++;
      return prepareDrawingShapeTextCandidate(next, measurement);
    });
    expect(f.pane.onIntent(f.intent("text", "rotation3d", camera(45)))).toBe(false);
    expect(f.update).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook.value)).toEqual(before);
    expect(f.session.history.undoStack).toEqual([]);
  });
});
