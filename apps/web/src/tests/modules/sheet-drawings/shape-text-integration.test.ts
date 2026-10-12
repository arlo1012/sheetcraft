import { effectScope, shallowRef } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getFloatingImageSheetRect } from "@sheetcraft/sheet-engine/floating-image-layout";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { prepareShapeTextUpdate } from "../../../modules/sheet-drawings/prepare-shape-text-update";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useOwnedShapeFormatPane } from "../../../modules/sheet-drawings/useOwnedShapeFormatPane";
import {
  prepareDrawingShapeTextCandidate,
  layoutDrawingShapeText,
  getDrawingShapeTextRect,
  type DrawingShapeTextRuntimeOptions,
} from "../../../modules/sheet-drawings/shape-text-runtime";
import {
  editDrawingShapeTextField,
  materializeDrawingShapeText,
} from "../../../modules/sheet-drawings/shape-text-options";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";

const measurement: DrawingShapeTextRuntimeOptions = {
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
};
const viewport = createSheetViewportLayout({
  geometry: createSheetGeometry({ rowCount: 100, columnCount: 30, rowHeight: 24, columnWidth: 80 }),
  rows: createRowVisibilityIndex({ rowCount: 100, defaultRowHeight: 24 }),
  viewportSize: { width: 600, height: 400 },
});
function fixture() {
  const workbook = createWorkbook({ id: "b", sheetId: "s" }),
    sheet = getActiveSheet(workbook);
  const owner = {
    ...createGraphicDrawing("d", "textBox", "Text", { row: 8, column: 5 }),
    text: "one\ntwo\nthree",
    width: 120,
    height: 160,
    rotation: 37,
  };
  sheet.drawings = [owner];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
    revision = shallowRef(0),
    scope = effectScope();
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const result = executeWorkbookCommand(session, command);
    if (result) revision.value++;
    return result;
  });
  const prepare = vi.fn(
    (
      next: Parameters<typeof prepareShapeTextUpdate>[0],
      before?: Parameters<typeof prepareShapeTextUpdate>[1],
    ) => prepareShapeTextUpdate(next, before, viewport, measurement),
  );
  const actions = scope.run(() =>
    useDrawingActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRevision: () => revision.value,
      getGeneration: () => 0,
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => false,
      flush: () => true,
      execute,
      name: (k) => k,
      prepareDrawing: prepare,
    }),
  )!;
  const pane = scope.run(() =>
    useOwnedShapeFormatPane({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRevision: () => revision.value,
      getGeneration: () => 0,
      isBusy: () => false,
      flush: () => true,
      update: actions.update,
      isAssetAvailable: () => true,
      getUnsupportedReason: () => "Unavailable",
      prepareText: (next) => prepareDrawingShapeTextCandidate(next, measurement),
    }),
  )!;
  const intent = (body: Record<string, unknown>) =>
    ({
      ...body,
      owner: pane.snapshot.value!.owner,
      baseRevision: revision.value,
      intentId: `i${revision.value}`,
    }) as ShapeFormatIntent;
  return {
    workbook,
    sheet,
    owner,
    session,
    scope,
    actions,
    pane,
    execute,
    prepare,
    revision,
    intent,
  };
}
describe("live shape text owner transactions", () => {
  test("pane AutoFit submits raw candidate once and keeps rotated local top edge with exact Undo/Redo/snapshot59", () => {
    const f = fixture();
    try {
      expect(f.pane.open(f.owner)).toBe(true);
      const before = serializeWorkbook(f.workbook),
        frame = getFloatingImageSheetRect(f.owner, viewport)!;
      const fixed = pictureFrameLocalToWorld(frame, 37, { x: 0, y: 0 });
      expect(
        f.pane.onIntent(f.intent({ type: "set-field", field: "textResizeToFit", value: true })),
      ).toBe(true);
      expect(f.prepare).toHaveBeenCalledTimes(1);
      expect(f.prepare.mock.calls[0]![0].height).toBe(160);
      const after = f.sheet.drawings![0] as SheetGraphicDrawing;
      expect(after.height).toBeLessThan(160);
      const corner = pictureFrameLocalToWorld(getFloatingImageSheetRect(after, viewport)!, 37, {
        x: 0,
        y: 0,
      });
      expect(corner.x).toBeCloseTo(fixed.x, 8);
      expect(corner.y).toBeCloseTo(fixed.y, 8);
      expect(f.session.history.undoStack).toHaveLength(1);
      const saved = serializeWorkbook(f.workbook);
      expect(saved.version).toBe(59);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(saved);
    } finally {
      f.scope.stop();
    }
  });
  test("preparation rejection keeps dialog draft/history, then same owner can retry", () => {
    const f = fixture();
    try {
      f.actions.edit(f.owner);
      const dialog = f.actions.dialog.value!,
        draft = { ...f.owner, text: "changed" };
      f.prepare.mockImplementationOnce(() => {
        throw new Error("Native glyph budget exceeded");
      });
      expect(f.actions.confirm(draft, dialog)).toBe(false);
      expect(f.actions.dialog.value).toBe(dialog);
      expect(f.sheet.drawings![0]).toBe(f.owner);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.confirm(draft, dialog)).toBe(true);
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.session.history.undoStack).toHaveLength(1);
    } finally {
      f.scope.stop();
    }
  });
  test("reentrant preparation cannot erase another newly added drawing", () => {
    const f = fixture();
    try {
      f.actions.edit(f.owner);
      const dialog = f.actions.dialog.value!;
      f.prepare.mockImplementationOnce((next) => {
        f.sheet.drawings!.push({ ...f.owner, id: "other" });
        return next;
      });
      expect(f.actions.confirm({ ...f.owner, text: "late" }, dialog)).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.drawings!.map((d) => d.id)).toEqual(["d", "other"]);
    } finally {
      f.scope.stop();
    }
  });
  test.each(["one\ntwo\nthree", ""])(
    "manual height disables AutoFit in the same candidate for text %s",
    (text) => {
      const f = fixture();
      try {
        const model = materializeDrawingShapeText(f.owner);
        model.layout.autoFit = "resize-shape";
        const owner = { ...f.owner, text, shapeText: model };
        const result = prepareShapeTextUpdate(
          { ...owner, height: 200 },
          owner,
          viewport,
          measurement,
        ) as SheetGraphicDrawing;
        expect(result.height).toBe(200);
        expect(result.shapeText!.layout.autoFit).toBe("none");
        expect(owner.shapeText.layout.autoFit).toBe("resize-shape");
      } finally {
        f.scope.stop();
      }
    },
  );
  test("clearing AutoFit text fits its reserved blank line and preserves the rotated top edge", () => {
    const f = fixture();
    try {
      const text = materializeDrawingShapeText(f.owner);
      text.layout.autoFit = "resize-shape";
      const owner = { ...f.owner, shapeText: text },
        next = { ...owner, text: "" };
      const result = prepareShapeTextUpdate(
        next,
        owner,
        viewport,
        measurement,
      ) as SheetGraphicDrawing;
      expect(result.height).toBeGreaterThan(20);
      expect(result.height).toBeLessThan(40);
      const before = pictureFrameLocalToWorld(getFloatingImageSheetRect(owner, viewport)!, 37, {
        x: 0,
        y: 0,
      });
      const after = pictureFrameLocalToWorld(getFloatingImageSheetRect(result, viewport)!, 37, {
        x: 0,
        y: 0,
      });
      expect(after.x).toBeCloseTo(before.x, 8);
      expect(after.y).toBeCloseTo(before.y, 8);
      expect(result.shapeText!.layout.autoFit).toBe("resize-shape");
    } finally {
      f.scope.stop();
    }
  });
  test.each(["color", "rotation"] as const)(
    "paint-only %s changes run actual proof without re-running AutoFit",
    (field) => {
      const f = fixture();
      try {
        const text = materializeDrawingShapeText(f.owner);
        text.layout.autoFit = "resize-shape";
        const owner = { ...f.owner, shapeText: text };
        const proof = vi.fn<
          (
            options: import("../../../modules/sheet-drawings/shape-text-paint").ShapeTextPaintOptions,
          ) => never
        >(() => {
          throw new Error("Actual painted-alpha contour budget");
        });
        const next = { ...owner, [field]: field === "color" ? "#ff0000" : 80 };
        expect(() =>
          prepareShapeTextUpdate(next, owner, viewport, measurement, { preflight: proof }),
        ).toThrow(/painted-alpha/);
        expect(proof).toHaveBeenCalledTimes(1);
        expect(proof.mock.calls[0]![0].drawing.height).toBe(owner.height);
      } finally {
        f.scope.stop();
      }
    },
  );
  test("normalized pane paint/overflow/flat changes retain the frame of an existing AutoFit owner", () => {
    const f = fixture();
    try {
      const text = materializeDrawingShapeText(f.owner);
      text.layout.autoFit = "resize-shape";
      const owner = {
        ...f.owner,
        kind: "shape" as const,
        shapeGeometry: { preset: "rect" as const },
        shapeText: text,
      };
      const normalized = (value: SheetGraphicDrawing) =>
        normalizeSheetDrawing(value) as SheetGraphicDrawing;
      for (const next of [
        normalized({ ...owner, shapeStyle: { glow: { kind: "none" } } }),
        normalized(editDrawingShapeTextField(owner, "textOverflow", true)!),
        normalized(editDrawingShapeTextField(owner, "shapeKeepTextFlat", true)!),
      ]) {
        const result = prepareShapeTextUpdate(
          next,
          owner,
          viewport,
          measurement,
        ) as SheetGraphicDrawing;
        expect(result.height).toBe(owner.height);
        expect(result.anchor).toEqual(owner.anchor);
        expect(result.offsetX).toBe(owner.offsetX);
        expect(result.offsetY).toBe(owner.offsetY);
      }
    } finally {
      f.scope.stop();
    }
  });
  test.each(["line", "free"])(
    "empty %s keeps body edits and never requests nonexistent glyph layout",
    (kind) => {
      const owner = createGraphicDrawing("empty", "shape", "", { row: 0, column: 0 });
      if (kind === "line") owner.shapeGeometry = { preset: "line" };
      else {
        delete owner.shapeGeometry;
        owner.shapePath = {
          tool: "freeform",
          viewBox: { width: 100, height: 100 },
          commands: [
            ["M", 0, 0],
            ["L", 100, 100],
          ],
        };
      }
      const next = { ...owner, stroke: "#ff0000", height: 1 };
      expect(prepareShapeTextUpdate(next, owner, undefined)).toBe(next);
    },
  );
});
describe("explicit text fields and desktop flip consumers", () => {
  test("legacy projection materializes only edited field without changing text/basic font", () => {
    const source = createGraphicDrawing("d", "shape", "", { row: 0, column: 0 });
    delete source.shapeText;
    const before = structuredClone(source),
      next = editDrawingShapeTextField(source, "textUnderline", true)!;
    expect(source).toEqual(before);
    expect(next.text).toBe(source.text);
    expect(next.fontSize).toBe(source.fontSize);
    expect(next.shapeText).toMatchObject({
      underline: true,
      layout: { marginsPt: { leftPt: 0 }, blockAlignment: "center" },
    });
    expect(() => editDrawingShapeTextField(source, "textDirection", "invalid" as never)).toThrow();
  });
  test("H flip reflects asymmetric text rect but keeps glyphs readable; V flips runs180 without changing stored rotation", () => {
    const base = {
      ...createGraphicDrawing("d", "shape", "", { row: 0, column: 0 }),
      shapeGeometry: { preset: "rightArrow" as const },
      text: "abr123",
      width: 240,
      height: 160,
    };
    const normal = getDrawingShapeTextRect(base)!,
      h = getDrawingShapeTextRect({ ...base, shapeFlipX: true })!;
    expect(h.x).toBeCloseTo(base.width - normal.x - normal.width);
    expect(h.y).toBe(normal.y);
    expect(
      layoutDrawingShapeText({ ...base, shapeFlipX: true }, measurement).runs.every(
        (r) => r.angle === 0,
      ),
    ).toBe(true);
    const v = { ...base, shapeFlipY: true as const },
      layout = layoutDrawingShapeText(v, measurement);
    expect(layout.runs.length).toBeGreaterThan(0);
    expect(layout.runs.every((r) => r.angle === 180)).toBe(true);
    expect(v.rotation).toBe(0);
  });
});
