import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator, type Sheet } from "@sheetcraft/core/workbook";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import type {
  ShapeGroupDrawing,
  ShapeGroupedGroup,
  ShapeGroupLocalFrame,
  SheetGroupedEquationDrawing,
  SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  capturePrintEquationPass,
  EquationPrintUnavailableError,
} from "../../../modules/page-layout/page-print-equations";
import {
  createPrintPreviewDocument,
  createPrintPreviewRenderer,
} from "../../../modules/page-layout/page-print-renderer";
import {
  createPrintShapeMetrics,
  getPrintableShapeLeaves,
  paintPrintShapes,
  preparePrintShapeFonts,
} from "../../../modules/page-layout/page-print-shapes";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import * as shapePaint from "../../../modules/page-layout/page-print-shapes";
import * as mathPixels from "../../../modules/page-layout/page-print-equation-pixels";
import * as bodyPaint from "../../../modules/sheet-drawings/shape-detailed-paint";
import * as textRuntime from "../../../modules/sheet-drawings/shape-text-runtime";
import * as scenePaint from "../../../modules/sheet-grid/canvas/scene-painter";
import * as borders from "../../../modules/sheet-grid/canvas/border-painter";

const local: ShapeGroupLocalFrame = {
  kind: "shape-group-local-v1",
  rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
};
function appearance(id: string, kind: "equation" | "shape") {
  const {
    anchor: _a,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...source
  } = createGraphicDrawing(id, kind, id, { row: 0, column: 0 });
  return source;
}
function math(
  id: string,
  changes: Partial<SheetGroupedEquationDrawing> = {},
): SheetGroupedEquationDrawing {
  return {
    ...appearance(id, "equation"),
    kind: "equation",
    text: "  \\frac{a}{b}  ",
    groupFrame: local,
    ...changes,
  };
}
function shape(
  id: string,
  changes: Partial<SheetGroupedGraphicDrawing> = {},
): SheetGroupedGraphicDrawing {
  return {
    ...appearance(id, "shape"),
    kind: "shape",
    text: "",
    shapeGeometry: { preset: "rect" },
    groupFrame: local,
    ...changes,
  };
}
function group(
  id: string,
  members: ShapeGroupDrawing["members"],
  changes: Partial<ShapeGroupDrawing> = {},
): ShapeGroupDrawing {
  return {
    kind: "shapeGroup",
    id,
    name: id,
    rotation: 0,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 20, size: { width: 240, height: 120 } },
    },
    members,
    ...changes,
  };
}
function inner(
  id: string,
  members: ShapeGroupedGroup["members"],
  changes: Partial<ShapeGroupedGroup> = {},
): ShapeGroupedGroup {
  return { kind: "shapeGroup", id, name: id, rotation: 0, groupFrame: local, members, ...changes };
}
function fixture(drawings: Sheet["drawings"]) {
  const sheet = createSheet("Grouped mathematical print", "sheet");
  sheet.drawings = drawings;
  const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet));
  const renderPass = resolveShapeForestForRender({
    drawings: sheet.drawings!,
    metrics,
    revision: 7,
  });
  return { sheet, metrics, renderPass, pass: capturePrintEquationPass(sheet, metrics, renderPass) };
}
function context() {
  return {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
function mockBodies(order: string[]) {
  return vi.spyOn(bodyPaint, "prepareShapeDetailedPaint").mockImplementation((options) => {
    order.push(options.drawing.id);
    return {
      ...bodyPaint.planShapeDetailedPaint(options),
      kind: "ready",
      canvas: { width: 20, height: 20 } as HTMLCanvasElement,
      actualDensity: 1,
    };
  });
}
const viewport = { x: 0, y: 0, width: 2000, height: 2000 };
afterEach(() => vi.restoreAllMocks());

describe("native Equation group print sources", () => {
  test("gates owned math before a consumer exists, including hidden and nonprinting math", () => {
    const sheet = createSheet("Hidden owned math", "sheet");
    sheet.drawings = [
      group("owner", [inner("hidden", [math("math")], { hidden: true })], {
        shapeProperties: { printObject: false },
      }),
    ];
    const before = JSON.stringify(sheet.drawings);
    expect(() =>
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }),
    ).toThrow(EquationPrintUnavailableError);
    expect(JSON.stringify(sheet.drawings)).toBe(before);
  });
  test("captures raw and structured math by genuine node/root/path in DFS order", () => {
    const document: EquationDocument = {
      kind: "equation-document-v1",
      body: { id: "body", kind: "sequence", children: [{ id: "x", kind: "text", value: "x" }] },
    };
    const raw = math("raw", { equationFlipX: true }),
      structured = math("structured", {
        text: serializeEquationDocument(document),
        equationDocument: document,
        equationFlipY: true,
        rotation: 15,
      }),
      owner = group(
        "owner",
        [shape("back"), raw, inner("inner", [structured, shape("front")], { rotation: 30 })],
        { rotation: 90 },
      ),
      before = JSON.stringify(owner),
      f = fixture([owner]);
    expect(f.pass.entries.map((entry) => entry.sourceNode)).toEqual([raw, structured]);
    expect(f.pass.entries.map((entry) => entry.path)).toEqual([
      ["owner", "raw"],
      ["owner", "inner", "structured"],
    ]);
    expect(
      f.pass.entries.every(
        (entry) => entry.root === owner && entry.input.sourceIdentity === entry.sourceNode,
      ),
    ).toBe(true);
    expect(f.pass.entries.map((entry) => [entry.rotation, entry.mathRotation])).toEqual([
      [90, 0],
      [135, 180],
    ]);
    expect(f.pass.entries[0]!.input.source).toBe("  \\frac{a}{b}  ");
    expect(structured.equationDocument).toBe(document);
    expect(JSON.stringify(owner)).toBe(before);
  });
  test("never sends math through shape fonts, shapeText, body bounds or body paint", async () => {
    const f = fixture([group("owner", [math("one"), inner("inner", [math("two")])])]);
    const font = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont"),
      glyphs = vi.spyOn(textRuntime, "layoutDrawingShapeText"),
      body = vi.spyOn(bodyPaint, "planShapeDetailedPaint"),
      native = vi.fn();
    expect([...getPrintableShapeLeaves(f.sheet, f.metrics, f.renderPass)]).toEqual([]);
    await preparePrintShapeFonts(f.sheet, f.metrics, f.renderPass);
    const preview = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      nativeEquationConsumer: true,
    });
    expect(preview.equationPrintPass!.entries).toHaveLength(2);
    paintPrintShapes(context(), {
      ...f,
      viewport,
      images: createCanvasImageCache(() => {}),
      paintEquationLeaf: native,
    });
    expect(native.mock.calls.map((call) => call[0].sourceNode.id)).toEqual(["one", "two"]);
    expect(font).not.toHaveBeenCalled();
    expect(glyphs).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(() =>
      paintPrintShapes(context(), { ...f, viewport, images: createCanvasImageCache(() => {}) }),
    ).toThrow(/native Equation/i);
  });
  test("native math interleaves with normal leaves in exact nested sibling order", () => {
    const owner = group("owner", [
      shape("back"),
      math("one"),
      inner("inner", [math("two"), shape("middle"), math("three")]),
      shape("front"),
    ]);
    const f = fixture([owner]),
      order: string[] = [],
      bodies = mockBodies(order),
      before = JSON.stringify(owner);
    paintPrintShapes(context(), {
      ...f,
      viewport,
      images: createCanvasImageCache(() => {}),
      beforeRoot: (root) => order.push(`root:${root.id}`),
      paintEquationLeaf: (leaf) => order.push(leaf.sourceNode.id),
    });
    expect(order).toEqual(["root:owner", "back", "one", "two", "middle", "three", "front"]);
    expect(bodies.mock.calls.every((call) => call[0].drawing.kind === "shape")).toBe(true);
    expect(JSON.stringify(owner)).toBe(before);
  });
  test("the whole renderer retains mixed roots, nested native leaves, Eq-only groups and connectors", async () => {
    const connector = shape("connector", {
      shapeGeometry: { preset: "bentConnector3" },
      shapeConnector: {
        kind: "shape-connector-v1",
        begin: { kind: "free", xRatio: 0, yRatio: 0 },
        end: { kind: "free", xRatio: 1, yRatio: 1 },
      },
    });
    const sheet = createSheet("Mixed roots and leaves", "sheet");
    sheet.drawings = [
      createGraphicDrawing("first", "equation", "Math", { row: 0, column: 0 }),
      group("mixed", [
        shape("back"),
        math("one"),
        inner("inner", [math("two"), connector]),
        shape("front"),
      ]),
      group("math-only", [math("three"), math("four")]),
      createGraphicDrawing("last", "equation", "Math", { row: 0, column: 0 }),
    ];
    const preview = createPrintPreviewDocument({
        sheet,
        evaluator: createSheetEvaluator(sheet),
        nativeEquationConsumer: true,
      }),
      order: string[] = [];
    expect(preview.shapeRenderPass.connections).not.toBeNull();
    mockBodies(order);
    vi.spyOn(mathPixels, "createPrintEquationPixels").mockReturnValue({
      prepare: vi.fn(async () => {}),
      paint: vi.fn((_context, _pass, entry) => {
        order.push(entry.sourceNode.id);
      }),
      isReady: vi.fn(() => true),
      clear: vi.fn(),
      dispose: vi.fn(),
    });
    vi.spyOn(scenePaint, "paintSheetScene").mockImplementation(() => {});
    vi.spyOn(borders, "paintSheetBorders").mockImplementation(() => {});
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(context());
    const renderer = createPrintPreviewRenderer();
    await renderer.prepareEquations(preview, { isCurrent: () => true });
    renderer.render({ canvas, document: preview, page: preview.pages[0]!, density: 2 });
    expect(order).toEqual([
      "first",
      "back",
      "one",
      "two",
      "connector",
      "front",
      "three",
      "four",
      "last",
    ]);
    renderer.dispose();
  });
  test("missing native group dispatch fails instead of appending skipped math over later shapes", () => {
    const f = fixture([group("owner", [math("math")])]);
    const preview = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      nativeEquationConsumer: true,
    });
    const mathPaint = vi.fn();
    vi.spyOn(mathPixels, "createPrintEquationPixels").mockReturnValue({
      prepare: vi.fn(async () => {}),
      paint: mathPaint,
      isReady: vi.fn(() => true),
      clear: vi.fn(),
      dispose: vi.fn(),
    });
    vi.spyOn(scenePaint, "paintSheetScene").mockImplementation(() => {});
    vi.spyOn(borders, "paintSheetBorders").mockImplementation(() => {});
    vi.spyOn(shapePaint, "paintPrintShapes").mockImplementation(() => {});
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue(context());
    const renderer = createPrintPreviewRenderer();
    expect(() =>
      renderer.render({ canvas, document: preview, page: preview.pages[0]!, density: 2 }),
    ).toThrow(/source position/i);
    expect(mathPaint).not.toHaveBeenCalled();
    renderer.dispose();
  });
  test("native paint callbacks cannot silently change an owned source during the pass", () => {
    const source = math("math"),
      f = fixture([group("owner", [source])]);
    expect(() =>
      paintPrintShapes(context(), {
        ...f,
        viewport,
        images: createCanvasImageCache(() => {}),
        paintEquationLeaf: () => {
          source.name = "Changed during paint";
        },
      }),
    ).toThrow(/outdated/i);
  });
  test("inherits hidden/collapse while root printObject governs retained member properties", () => {
    const visible = math("visible"),
      owner = group("owner", [
        visible,
        math("own-hidden", { hidden: true }),
        math("own-print-off", { shapeProperties: { printObject: false } }),
        inner("hidden-owner", [math("inherited-hidden")], { hidden: true }),
        inner("print-off-owner", [math("inherited-print-off")], {
          shapeProperties: { printObject: false },
        }),
      ]);
    const f = fixture([owner]);
    expect(f.pass.entries.map((entry) => entry.sourceNode.id)).toEqual([
      "visible",
      "own-print-off",
      "inherited-print-off",
    ]);
    expect(fixture([group("hidden-root", [math("a")], { hidden: true })]).pass.entries).toEqual([]);
    expect(
      fixture([group("nonprinting-root", [math("b")], { shapeProperties: { printObject: false } })])
        .pass.entries,
    ).toEqual([]);
  });
  test("a collapsed root retains native source validation but allocates no math leaves", () => {
    const owner = group("collapsed-root", [inner("inner", [math("collapsed")])], {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 1, offset: 0 } },
          end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
        },
      },
    });
    const sheet = createSheet("Collapsed math", "sheet");
    sheet.drawings = [owner];
    sheet.hiddenRows = new Set([1]);
    const preview = createPrintPreviewDocument({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      nativeEquationConsumer: true,
    });
    expect(preview.equationPrintPass!.entries).toEqual([]);
    const child = owner.members[0]!;
    if (child.kind !== "shapeGroup") throw new Error("fixture");
    const source = child.members[0]!;
    if (source.kind !== "equation") throw new Error("fixture");
    source.text = "x";
    expect(() => preview.equationPrintPass!.assertCurrent()).toThrow(/outdated/i);
  });
  test("source, node replacement, path, and even unrelated forest edits invalidate the whole pass", () => {
    for (const change of ["source", "node", "path", "other-root"] as const) {
      const source = math("math"),
        owner = group("owner", [source]),
        other = createGraphicDrawing("other", "shape", "Other", { row: 0, column: 0 }),
        f = fixture([owner, other]);
      if (change === "source") source.text = "y";
      if (change === "node") owner.members[0] = { ...source };
      if (change === "path") owner.members = [inner("new-owner", [source])];
      if (change === "other-root") other.name = "Changed";
      expect(() => f.pass.assertCurrent()).toThrow(/outdated/i);
    }
  });
  test("capture rejects a native projection with a different source node or owner path", () => {
    const source = math("math"),
      owner = group("owner", [source]),
      f = fixture([owner]);
    const real = f.renderPass.getLeaf(source.id)!;
    for (const replacement of [
      { ...real, sourceNode: { ...source } },
      { ...real, path: ["other", source.id] },
    ]) {
      expect(() =>
        capturePrintEquationPass(f.sheet, f.metrics, {
          ...f.renderPass,
          getLeaf: () => replacement,
        }),
      ).toThrow(EquationPrintUnavailableError);
    }
  });
  test("active group composition with math fails explicitly before any ordinary shape pipeline", () => {
    const sheet = createSheet("Unsupported math composition", "sheet");
    sheet.drawings = [
      group("owner", [
        math("math"),
        inner("other", [shape("shape")], {
          groupEffects: {
            glow: {
              kind: "value",
              value: { color: { kind: "rgb", rgb: "#00FF00" }, opacity: 0.75, sizePt: 30 },
            },
          },
        }),
      ]),
    ];
    const body = vi.spyOn(bodyPaint, "planShapeDetailedPaint"),
      before = JSON.stringify(sheet.drawings);
    expect(() =>
      createPrintPreviewDocument({
        sheet,
        evaluator: createSheetEvaluator(sheet),
        nativeEquationConsumer: true,
      }),
    ).toThrow(/Equation.*(effect|camera|3D)|native.*composition/i);
    expect(body).not.toHaveBeenCalled();
    expect(JSON.stringify(sheet.drawings)).toBe(before);
  });
  test("root and owned math share the existing 128-equation sheet limit", () => {
    const owner = group(
      "owner",
      Array.from({ length: 128 }, (_, index) => math(`math-${index}`)),
    );
    expect(fixture([owner]).pass.entries).toHaveLength(128);
    expect(() =>
      fixture([owner, createGraphicDrawing("extra", "equation", "Math", { row: 0, column: 0 })]),
    ).toThrow(/128 equations/i);
  });
});
