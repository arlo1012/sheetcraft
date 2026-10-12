import { describe, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeShapeGroup,
  type ShapeGroupDrawing,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { prepareShapeTextUpdate } from "../../../modules/sheet-drawings/prepare-shape-text-update";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import {
  preflightShapeTextGlyphBudgets,
  type ShapeTextGlyphBudgetPreflight,
  type ShapeTextPaintOptions,
} from "../../../modules/sheet-drawings/shape-text-paint";
import type { DrawingShapeTextRuntimeOptions } from "../../../modules/sheet-drawings/shape-text-runtime";

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
function leaf(id: string): SheetGroupedGraphicDrawing {
  const {
    anchor: _a,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing(id, "textBox", "", { row: 0, column: 0 });
  appearance.shapeText!.layout.autoFit = "resize-shape";
  return {
    ...appearance,
    kind: "textBox",
    text: "One\ntwo\nthree",
    fontSize: 19,
    rotation: 17,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: -0.1, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.8 },
    },
  };
}
function fixture() {
  const sheet = createSheet("Groups", "s");
  const root = normalizeShapeGroup({
    kind: "shapeGroup",
    id: "root",
    name: "Root",
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 70, size: { width: 320, height: 200 } },
    },
    members: [
      leaf("a"),
      {
        kind: "shapeGroup",
        id: "inner",
        name: "Inner",
        rotation: 29,
        groupFrame: {
          kind: "shape-group-local-v1",
          rect: { xRatio: 0.2, yRatio: 0.3, widthRatio: 0.5, heightRatio: 0.5 },
        },
        members: [leaf("b")],
      },
    ],
  });
  return { root, metrics: createPictureSheetMetrics(sheet) };
}

describe("owned shape group text preflight", () => {
  test("uses complete genuine leaf layouts and preserves AutoFit/fonts/geometry/placement exactly", () => {
    const f = fixture(),
      before = structuredClone(f.root);
    const proof = vi.fn((options: ShapeTextPaintOptions) =>
      preflightShapeTextGlyphBudgets(options),
    );
    expect(
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        f.metrics,
      ),
    ).toBe(f.root);
    expect(f.root).toEqual(before);
    expect(proof).toHaveBeenCalledTimes(2);
    const leaves = resolveShapeGroupProjection(f.root, f.metrics).leaves;
    proof.mock.calls.forEach(([options], index) => {
      expect(options.drawing.id).toBe(leaves[index]!.sourceNode.id);
      expect(options.drawing.width).toBe(leaves[index]!.layout!.rect.width);
      expect(options.drawing.height).toBe(leaves[index]!.layout!.rect.height);
      expect(options.drawing.rotation).toBe(leaves[index]!.layout!.angleDeg);
      expect(options.drawing.fontSize).toBe(19);
      expect(options.drawing.shapeText!.layout.autoFit).toBe("resize-shape");
      expect(options.layout.runs.length).toBeGreaterThan(0);
      expect(options.drawing).not.toHaveProperty("groupFrame");
      expect(options.drawing).not.toHaveProperty("members");
    });
  });
  test("a pure group resize/rotation never triggers resize-shape fitting, even with insufficient text height", () => {
    const f = fixture(),
      candidate: ShapeGroupDrawing = {
        ...f.root,
        rotation: 111,
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: { mode: "fixed", x: 50, y: 30, size: { width: 500, height: 5 } },
        },
      },
      before = structuredClone(candidate);
    expect(
      prepareShapeTextUpdate(candidate, f.root, undefined, measurement, undefined, f.metrics),
    ).toBe(candidate);
    expect(candidate).toEqual(before);
    expect(candidate.members).toBe(f.root.members);
  });
  test("missing metrics reject before any glyph preflight", () => {
    const f = fixture(),
      proof = vi.fn(preflightShapeTextGlyphBudgets);
    expect(() =>
      prepareShapeTextUpdate(f.root, undefined, undefined, measurement, { preflight: proof }),
    ).toThrow(/metrics/);
    expect(proof).not.toHaveBeenCalled();
  });
  test("pending font validation preserves the root and never starts a font load", () => {
    const f = fixture();
    (f.root.members[0] as SheetGroupedGraphicDrawing).shapeText!.fontFamily =
      `SheetcraftLocal_${"0".repeat(64)}`;
    const before = structuredClone(f.root),
      proof = vi.fn(preflightShapeTextGlyphBudgets);
    expect(() =>
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        f.metrics,
      ),
    ).toThrow(/font resource/);
    expect(f.root).toEqual(before);
    expect(proof).not.toHaveBeenCalled();
  });
  test("real numeric glyph text-unit budgets reject without changing the group", () => {
    const f = fixture();
    (f.root.members[0] as SheetGroupedGraphicDrawing).text = "x".repeat(100_001);
    const before = structuredClone(f.root);
    expect(() =>
      prepareShapeTextUpdate(f.root, undefined, undefined, measurement, undefined, f.metrics),
    ).toThrow();
    expect(f.root).toEqual(before);
  });
  test("late native-alpha proof failure rejects the whole group and preserves all leaves", () => {
    const f = fixture(),
      before = structuredClone(f.root);
    const proof = vi
      .fn<(options: ShapeTextPaintOptions) => ShapeTextGlyphBudgetPreflight>(
        preflightShapeTextGlyphBudgets,
      )
      .mockImplementationOnce(preflightShapeTextGlyphBudgets)
      .mockImplementationOnce(() => {
        throw new Error("Actual native-alpha contour budget");
      });
    expect(() =>
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        f.metrics,
      ),
    ).toThrow(/native-alpha/);
    expect(proof).toHaveBeenCalledTimes(2);
    expect(f.root).toEqual(before);
  });
  test("unavailable glyph proof is not counted as an applied candidate", () => {
    const f = fixture(),
      before = structuredClone(f.root);
    const proof = vi.fn<(options: ShapeTextPaintOptions) => ShapeTextGlyphBudgetPreflight>(() => ({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["glyph"],
    }));
    expect(() =>
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        f.metrics,
      ),
    ).toThrow(/paint pixels/);
    expect(f.root).toEqual(before);
  });
  test("missing actual glyph picture paint resources reject before numeric-only proof", () => {
    const f = fixture(),
      drawing = f.root.members[0] as SheetGroupedGraphicDrawing;
    drawing.shapeText!.style = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "glyph",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            offsetXRatio: 0,
            offsetYRatio: 0,
            widthRatio: 1,
            heightRatio: 1,
          },
        },
      },
    };
    const before = structuredClone(f.root),
      proof = vi.fn(preflightShapeTextGlyphBudgets);
    expect(() =>
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        f.metrics,
      ),
    ).toThrow(/paint resources/);
    expect(f.root).toEqual(before);
    expect(proof).not.toHaveBeenCalled();
  });
  test("validates collapsed groups fully but does not synthesize unplaced leaf glyph geometry", () => {
    const f = fixture(),
      sheet = createSheet("Collapsed", "c");
    sheet.hiddenColumns = new Set([0]);
    f.root.shapeFrame = {
      kind: "shape-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
      },
    };
    const proof = vi.fn(preflightShapeTextGlyphBudgets),
      metrics = createPictureSheetMetrics(sheet);
    expect(
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        metrics,
      ),
    ).toBe(f.root);
    expect(proof).not.toHaveBeenCalled();
    f.root.members.push(f.root.members[0]!);
    expect(() =>
      prepareShapeTextUpdate(
        f.root,
        undefined,
        undefined,
        measurement,
        { preflight: proof },
        metrics,
      ),
    ).toThrow();
  });
});

test("explicit owned member text editing honors AutoFit and pins its world local top edge", () => {
  const f = fixture(),
    candidate = structuredClone(f.root);
  const member = candidate.members[0]!;
  if (member.kind === "shapeGroup") throw Error("not leaf");
  member.text = "One\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten";
  const before = resolveShapeGroupProjection(candidate, f.metrics).leaves[0]!;
  const prepared = prepareShapeTextUpdate(
    candidate,
    f.root,
    undefined,
    measurement,
    undefined,
    f.metrics,
  );
  if (prepared.kind !== "shapeGroup") throw Error("not group");
  const after = resolveShapeGroupProjection(prepared, f.metrics).leaves[0]!;
  expect(after.layout!.rect.height).toBeGreaterThan(before.layout!.rect.height);
  const a = pictureFrameLocalToWorld(before.layout!.rect, before.layout!.angleDeg, { x: 0, y: 0 });
  const b = pictureFrameLocalToWorld(after.layout!.rect, after.layout!.angleDeg, { x: 0, y: 0 });
  expect(b.x).toBeCloseTo(a.x);
  expect(b.y).toBeCloseTo(a.y);
  expect(after.sourceNode.shapeText!.layout.autoFit).toBe("resize-shape");
  expect(prepared.members[1]).toEqual(candidate.members[1]);
  expect(candidate.members[0]).toEqual(member);
});
test("manual owned member height change disables its AutoFit without touching other members", () => {
  const f = fixture(),
    candidate = structuredClone(f.root);
  candidate.members[0]!.groupFrame.rect.heightRatio *= 1.25;
  const prepared = prepareShapeTextUpdate(
    candidate,
    f.root,
    undefined,
    measurement,
    undefined,
    f.metrics,
  );
  if (prepared.kind !== "shapeGroup") throw Error("not group");
  const member = prepared.members[0]!;
  if (member.kind === "shapeGroup") throw Error("not leaf");
  expect(member.shapeText!.layout.autoFit).toBe("none");
  expect(prepared.members[1]).toEqual(candidate.members[1]);
});

test("owned member E/W width edit reflows AutoFit without fitting the whole group", () => {
  const f = fixture();
  const member = f.root.members[0]!;
  if (member.kind === "shapeGroup") throw Error("not leaf");
  member.text = "One two three four five six seven eight nine ten eleven twelve";
  const candidate = structuredClone(f.root);
  candidate.members[0]!.groupFrame.rect.widthRatio *= 0.3;
  const before = resolveShapeGroupProjection(candidate, f.metrics).leaves[0]!;
  const result = prepareShapeTextUpdate(
    candidate,
    f.root,
    undefined,
    measurement,
    undefined,
    f.metrics,
  );
  if (result.kind !== "shapeGroup") throw Error("not group");
  const after = resolveShapeGroupProjection(result, f.metrics).leaves[0]!;
  expect(after.layout!.rect.height).toBeGreaterThan(before.layout!.rect.height);
  expect(after.layout!.rect.width).toBeCloseTo(before.layout!.rect.width);
  expect(after.sourceNode.shapeText!.layout.autoFit).toBe("resize-shape");
  expect(result.members[1]).toEqual(candidate.members[1]);
});
