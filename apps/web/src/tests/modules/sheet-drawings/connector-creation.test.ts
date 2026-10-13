// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createShapeConnectorDrawing } from "../../../modules/sheet-drawings/create-shape-connector";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { SHAPE_GALLERY, type ShapeLineChoice } from "../../../modules/sheet-drawings/shape-gallery";
import { pickNearestShapeConnectorSite } from "../../../modules/sheet-drawings/shape-connector-site-picking";
import { framedShape } from "./framed-shape-fixture";

const choices = SHAPE_GALLERY.flatMap((group) => group.items).filter(
  (choice): choice is ShapeLineChoice => choice.kind === "line",
);
function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook),
    metrics = createPictureSheetMetrics(sheet);
  const base = createGraphicDrawing("new-connector", "shape", "Connector", { row: 0, column: 0 });
  return { workbook, sheet, metrics, base };
}
describe("canonical connector creation", () => {
  test.each(choices)("$tool stores exact ordered free tips in all quadrants", (choice) => {
    const f = fixture();
    for (const [start, end] of [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      [
        { x: 100, y: 80 },
        { x: 20, y: 10 },
      ],
      [
        { x: 20, y: 80 },
        { x: 100, y: 10 },
      ],
      [
        { x: 20, y: 10 },
        { x: 100, y: 80 },
      ],
      [
        { x: 20, y: 10 },
        { x: 20 + 2 ** -20, y: 10 + 2 ** -25 },
      ],
    ] as const) {
      const drawing = createShapeConnectorDrawing({
        ...f,
        forest: [],
        choice,
        start,
        end,
      });
      expect(drawing).not.toBeNull();
      const resolved = resolveSheetShapeConnections([drawing!], f.metrics).getConnector(
        drawing!.id,
      )!;
      expect(resolved.status).toBe("ready");
      if (resolved.begin.status !== "ready" || resolved.end.status !== "ready") throw Error("tips");
      expect(resolved.begin.position.x).toBeCloseTo(start.x, 12);
      expect(resolved.begin.position.y).toBeCloseTo(start.y, 12);
      expect(resolved.end.position.x).toBeCloseTo(end.x, 12);
      expect(resolved.end.position.y).toBeCloseTo(end.y, 12);
      expect(drawing?.shapeFlipX).toBeUndefined();
      expect(drawing?.shapeFlipY).toBeUndefined();
      expect(drawing?.rotation).toBe(0);
      expect(drawing?.shapeGeometry?.preset).toBe(choice.preset);
      expect(drawing?.shapeLineEnds?.begin?.kind ?? "none").toBe(choice.beginArrow);
      expect(drawing?.shapeLineEnds?.end?.kind ?? "none").toBe(choice.endArrow);
    }
  });
  test("actual preset sites override mouse and Shift; stale candidates reject without touching the workbook", () => {
    const f = fixture(),
      target = framedShape();
    target.id = "target";
    target.text = "";
    target.rotation = 37;
    target.shapeGeometry = { preset: "rect" };
    target.shapeFrame.anchor = { mode: "fixed", x: 40, y: 40, size: { width: 80, height: 50 } };
    f.sheet.drawings = [target];
    const context = resolveSheetShapeConnections(f.sheet.drawings, f.metrics);
    const site = context.targets[0]!.sites[0]!;
    const candidate = pickNearestShapeConnectorSite(context, site.position, 0)!;
    const before = serializeWorkbook(f.workbook);
    const create = () =>
      createShapeConnectorDrawing({
        ...f,
        forest: f.sheet.drawings!,
        choice: choices[3]!,
        beginSite: candidate,
        start: { x: 10, y: 10 },
        end: { x: 150, y: 140 },
        shiftKey: true,
      });
    const drawing = create()!;
    expect(drawing.shapeConnector?.begin).toEqual({
      kind: "site",
      targetId: target.id,
      preset: "rect",
      siteIndex: candidate.siteIndex,
    });
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    target.rotation = 60;
    expect(create()).toBeNull();
  });
  test("zero, invalid, outside sheet and over-budget strokes never create a source", () => {
    const f = fixture(),
      choice = choices[0]!;
    for (const end of [
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: Infinity, y: 1 },
      { x: -1, y: 1 },
      { x: 16_385, y: 1 },
      { x: 1, y: -1 },
    ])
      expect(
        createShapeConnectorDrawing({
          ...f,
          forest: [],
          choice,
          start: { x: 0, y: 0 },
          end,
        }),
      ).toBeNull();
  });
});
