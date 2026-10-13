// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
} from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  findShapeGroupNode,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { updateResolvedShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { updateResolvedShapeGroupLeaf } from "../../../modules/sheet-drawings/resolved-shape-group";
import { createTextBoxReferenceResolver } from "../../../modules/sheet-drawings/textbox-reference-display";
import {
  getPrintableShapeLeaves,
  ShapePrintError,
} from "../../../modules/page-layout/page-print-shapes";

function fixture() {
  const workbook = createWorkbook({ id: "linked-render", sheetId: "owner" });
  const sheet = getActiveSheet(workbook);
  const source = createSheet("Source", "source");
  source.cells.set("0:0", { content: { kind: "literal", value: "Current source" } });
  workbook.sheets.set(source.id, source);
  const metrics = createPictureSheetMetrics(sheet);
  const resolver = createTextBoxReferenceResolver({
    workbook,
    evaluator: createWorkbookEvaluator(workbook, sheet.id),
    locale: "en-US",
  });
  return { workbook, sheet, source, metrics, resolver };
}
function box(id: string): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing(id, "textBox", "Linked", { row: 0, column: 0 }),
    text: "",
    textReference: { sheetId: "source", cell: { row: 0, column: 0 } },
  };
}
function framedBox(id: string): SheetFramedGraphicDrawing {
  const { anchor: _a, offsetX: _x, offsetY: _y, width: _w, height: _h, ...appearance } = box(id);
  return normalizeSheetDrawing({
    ...appearance,
    kind: "textBox",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 60, size: { width: 240, height: 100 } },
    },
  }) as SheetFramedGraphicDrawing;
}
function groupedBox(id: string): SheetGroupedGraphicDrawing {
  const { anchor: _a, offsetX: _x, offsetY: _y, width: _w, height: _h, ...appearance } = box(id);
  return {
    ...appearance,
    kind: "textBox",
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
    },
  };
}
function nestedGroup(): ShapeGroupDrawing {
  const nested: ShapeGroupedGroup = {
    kind: "shapeGroup",
    id: "nested",
    name: "Nested",
    rotation: 12,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.8, heightRatio: 0.5 },
    },
    members: [groupedBox("member"), { ...groupedBox("hidden"), hidden: true }],
  };
  return {
    kind: "shapeGroup",
    id: "group",
    name: "Group",
    rotation: 20,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 50, y: 40, size: { width: 400, height: 200 } },
    },
    members: [nested],
  };
}

describe("linked text paint-only carrier projection", () => {
  test.each([box("legacy"), framedBox("framed")])(
    "keeps $id carrier, source fields and frame canonical",
    (drawing) => {
      const f = fixture();
      f.sheet.drawings = [drawing];
      const before = JSON.stringify(drawing);
      const pass = resolveShapeForestForRender({
        drawings: f.sheet.drawings,
        metrics: f.metrics,
        revision: 3,
        textBoxReferenceResolver: f.resolver,
      });
      const leaf = pass.getLeaf(drawing.id)!;
      expect(leaf.sourceRoot).toBe(drawing);
      expect(leaf.sourceNode).toBe(drawing);
      expect(leaf.carrierRoot!.source).toBe(drawing);
      expect(leaf.carrierRoot!.view.text).toBe("");
      expect((leaf.carrierRoot!.view as SheetGraphicDrawing).textReference).toEqual(
        drawing.textReference,
      );
      expect(leaf.paintView!.text).toBe("Current source");
      expect(leaf.paintView!.textReference).toBeUndefined();
      expect(leaf.paintView!.color).toBe(drawing.color);
      expect(leaf.paintView!.fontSize).toBe(drawing.fontSize);
      expect(leaf.paintView!.width).toBe(leaf.carrierRoot!.view.width);
      expect(leaf.paintView!.height).toBe(leaf.carrierRoot!.view.height);
      expect(leaf.paintView!.shapeText!.layout).toEqual(drawing.shapeText!.layout);
      expect(leaf.paintView!.shapeText?.characterRuns).toBeUndefined();
      expect(leaf.paintView!.shapeText).not.toBe(drawing.shapeText);
      expect(Object.isFrozen(drawing.shapeText)).toBe(false);
      expect(JSON.stringify(drawing)).toBe(before);
      expect(() => pass.assertCurrent(f.sheet.drawings!, f.metrics, 3)).not.toThrow();
      const print = [...getPrintableShapeLeaves(f.sheet, f.metrics, pass)];
      expect(print[0]!.drawing).toBe(leaf.paintView);
      expect(print[0]!.sourceIdentity).toBe(leaf.paintIdentity);
      expect(leaf.paintIdentity).toMatchObject({
        sourceRoot: drawing,
        sourceNode: drawing,
        contextIdentity: pass.contextIdentity,
      });
      const inverse = updateResolvedShapeDrawing(
        leaf.carrierRoot!,
        { ...leaf.carrierRoot!.view, offsetX: leaf.carrierRoot!.view.offsetX + 5 },
        f.metrics,
      );
      expect((inverse as SheetGraphicDrawing).text).toBe("");
      expect((inverse as SheetGraphicDrawing).textReference).toEqual(drawing.textReference);
      expect(() =>
        updateResolvedShapeDrawing(leaf.carrierRoot!, leaf.paintView!, f.metrics),
      ).toThrow();
    },
  );

  test("preserves nested and hidden ownership, print order, and canonical group inverses", () => {
    const f = fixture();
    const root = nestedGroup();
    const staticShape = createGraphicDrawing("static", "shape", "Static", { row: 0, column: 0 });
    f.sheet.drawings = [staticShape, root, box("last")];
    const before = JSON.stringify(f.sheet.drawings);
    const pass = resolveShapeForestForRender({
      drawings: f.sheet.drawings,
      metrics: f.metrics,
      revision: 1,
      textBoxReferenceResolver: f.resolver,
    });
    const leaf = pass.getLeaf("member")!;
    const sourceNode = findShapeGroupNode(root, ["group", "nested", "member"])!.node;
    expect(leaf.sourceRoot).toBe(root);
    expect(leaf.sourceNode).toBe(sourceNode);
    expect(leaf.path).toEqual(["group", "nested", "member"]);
    expect(leaf.carrierLeaf!.sourceNode).toBe(sourceNode);
    expect(leaf.carrierLeaf!.view!.text).toBe("");
    expect(leaf.paintView!.text).toBe("Current source");
    expect(pass.getLeaf("hidden")!.sourceNode).toMatchObject({ hidden: true });
    expect(pass.getLeaf("static")!.paintView).toBeUndefined();
    const printed = [...getPrintableShapeLeaves(f.sheet, f.metrics, pass)];
    expect(printed.map(({ drawingId }) => drawingId)).toEqual([
      "static",
      "group/nested/member",
      "last",
    ]);
    expect(printed[1]!.drawing).toBe(leaf.paintView);
    expect(printed[1]!.sourceIdentity).toMatchObject({
      sourceRoot: root,
      sourceNode,
      path: leaf.path,
    });
    const inverse = updateResolvedShapeGroupLeaf(
      leaf.carrierLeaf!,
      { ...leaf.carrierLeaf!.view!, offsetX: leaf.carrierLeaf!.view!.offsetX + 5 },
      f.metrics,
    );
    const inverted = findShapeGroupNode(inverse, leaf.path)!.node as SheetGroupedGraphicDrawing;
    expect(inverted.text).toBe("");
    expect(inverted.textReference).toEqual(
      (sourceNode as SheetGroupedGraphicDrawing).textReference,
    );
    expect(() =>
      updateResolvedShapeGroupLeaf(leaf.carrierLeaf!, leaf.paintView!, f.metrics),
    ).toThrow();
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
    expect(() => pass.assertCurrent(f.sheet.drawings!, f.metrics, 1)).not.toThrow();
    (sourceNode as SheetGroupedGraphicDrawing).textReference!.cell = null;
    expect(() => pass.assertCurrent(f.sheet.drawings!, f.metrics, 1)).toThrow(/outdated/);
  });

  test("refreshes current value while AutoFit frame and Wrap/Overflow remain fixed", () => {
    const f = fixture();
    const drawing = framedBox("fixed");
    drawing.shapeText!.layout.autoFit = "resize-shape";
    drawing.shapeText!.layout.wrap = false;
    drawing.shapeText!.layout.overflow = true;
    f.sheet.drawings = [drawing];
    const before = JSON.stringify(drawing);
    const render = () =>
      resolveShapeForestForRender({
        drawings: f.sheet.drawings!,
        metrics: f.metrics,
        revision: 0,
        textBoxReferenceResolver: f.resolver,
      }).getLeaf("fixed")!;
    const first = render();
    f.source.cells.set("0:0", { content: { kind: "literal", value: "Long display ".repeat(100) } });
    const second = render();
    expect(second.paintView!.text).toBe("Long display ".repeat(100));
    expect(second.paintIdentity).not.toBe(first.paintIdentity);
    expect([second.paintView!.width, second.paintView!.height]).toEqual([
      first.paintView!.width,
      first.paintView!.height,
    ]);
    expect(second.paintView!.shapeText!.layout).toEqual(drawing.shapeText!.layout);
    expect(JSON.stringify(drawing)).toBe(before);
  });

  test("makes missing or failing resolvers unavailable and print rejects them before culling", () => {
    const f = fixture();
    f.sheet.drawings = [box("linked")];
    for (const resolver of [
      undefined,
      {
        resolve() {
          throw new Error("display failed");
        },
      },
    ]) {
      const pass = resolveShapeForestForRender({
        drawings: f.sheet.drawings,
        metrics: f.metrics,
        revision: 0,
        textBoxReferenceResolver: resolver,
      });
      expect(pass.getLeaf("linked")!.textReference?.status).toBe("unavailable");
      expect(pass.getLeaf("linked")!.paintView).toBeUndefined();
      expect(() => [...getPrintableShapeLeaves(f.sheet, f.metrics, pass)]).toThrow(ShapePrintError);
    }
    expect(() => [...getPrintableShapeLeaves(f.sheet, f.metrics)]).toThrow(/Linked text requires/i);
    const drawing = f.sheet.drawings[0]!;
    if (drawing.kind !== "textBox") throw new TypeError("Expected a linked text box.");
    drawing.hidden = true;
    expect([...getPrintableShapeLeaves(f.sheet, f.metrics)]).toEqual([]);
  });
});
