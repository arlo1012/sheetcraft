import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  getShapeConnectorNumericSize,
  planShapeConnectorSizeChange,
  type ShapeConnectorEditSource,
  type ShapeConnectorSizeEdit,
} from "../../shape-connector-editing.js";
import { resolveSheetShapeConnections } from "../../shape-connector-layout.js";
import type { ShapeConnectorPoint } from "../../shape-connector-route.js";
import { normalizeShapeDrawingForest } from "../../shape-group-planning.js";
import type { ShapeGroupChild, SheetGroupedGraphicDrawing } from "../../shape-group.js";
import type { ShapePresetName } from "../../shape-presets/catalog.js";
import type { SheetDrawing, SheetFramedGraphicDrawing } from "../../sheet-drawings.js";
import { createSheet, getActiveSheet, setSheetDimensionHidden } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, metrics, nested } from "../shape-groups/fixtures.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

const rootSource: ShapeConnectorEditSource = { connectorId: "connector", path: ["connector"] };
const presets = ["line", "lineInv", "bentConnector3", "curvedConnector3"] as const;

function freeShape(preset: ShapePresetName = "line", xSpan = 140, ySpan = 80) {
  const line = connectorShape();
  line.shapeGeometry = {
    preset,
    ...((preset === "bentConnector3" || preset === "curvedConnector3") && {
      adjustments: { adj1: 37000 },
    }),
  };
  line.shapeFrame.anchor = { mode: "fixed", x: 200, y: 300, size: { width: 100, height: 60 } };
  line.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "free", xRatio: 0.25, yRatio: 0.75 },
    end: { kind: "free", xRatio: 0.25 + xSpan / 100, yRatio: 0.75 + ySpan / 60 },
  };
  line.shapeLineEnds = { begin: { kind: "triangle" }, end: { kind: "open" } };
  return line;
}
function freeForest(preset: ShapePresetName = "line", xSpan = 140, ySpan = 80) {
  return normalizeShapeDrawingForest([framedShape("other"), freeShape(preset, xSpan, ySpan)]);
}
function lineNode(forest: readonly SheetDrawing[]) {
  const visit = (
    value: SheetDrawing | ShapeGroupChild,
  ): SheetDrawing | ShapeGroupChild | undefined => {
    if (value.id === "connector") return value;
    if (value.kind === "shapeGroup")
      for (const child of value.members) {
        const found = visit(child);
        if (found) return found;
      }
  };
  for (const root of forest) {
    const value = visit(root);
    if (value?.kind === "shape" && value.shapeConnector) return value;
  }
  throw new Error("Expected connector shape");
}
function resolved(forest: readonly SheetDrawing[], m = metrics()) {
  const value = resolveSheetShapeConnections(forest, m).getConnector("connector")!;
  if (
    value.status === "suspended" ||
    value.begin.status !== "ready" ||
    value.end.status !== "ready"
  )
    throw new Error("Expected ready ordered tips");
  return { ...value, beginPosition: value.begin.position, endPosition: value.end.position };
}
function signedSpan(forest: readonly SheetDrawing[], m = metrics()): ShapeConnectorPoint {
  const value = resolved(forest, m);
  const turn = ((value.carrierLayout!.angleDeg % 360) + 360) % 360;
  const cos =
    turn === 0
      ? 1
      : turn === 180
        ? -1
        : turn === 90 || turn === 270
          ? 0
          : Math.cos((turn * Math.PI) / 180);
  const sin =
    turn === 90
      ? 1
      : turn === 270
        ? -1
        : turn === 0 || turn === 180
          ? 0
          : Math.sin((turn * Math.PI) / 180);
  const x = value.endPosition.x - value.beginPosition.x;
  const y = value.endPosition.y - value.beginPosition.y;
  return { x: x * cos + y * sin, y: -x * sin + y * cos };
}
function expectOnlyEndChanged(original: readonly SheetDrawing[], result: readonly SheetDrawing[]) {
  const expected = structuredClone(original);
  lineNode(expected).shapeConnector!.end = structuredClone(lineNode(result).shapeConnector!.end);
  expect(result).toEqual(expected);
  expect(resolved(result).beginPosition).toEqual(resolved(original).beginPosition);
}
function owned(value: SheetFramedGraphicDrawing): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = value;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.5 },
    },
  };
}

describe("free connector numeric endpoint dimensions", () => {
  test.each(presets)(
    "%s reads endpoint spans rather than carrier or padded paint size",
    (preset) => {
      for (const [xSpan, ySpan] of [
        [140, 80],
        [0.25, 100],
        [100, 0],
        [0, 60],
      ] as const) {
        const forest = freeForest(preset, xSpan, ySpan);
        const original = structuredClone(forest);
        const size = getShapeConnectorNumericSize(forest, rootSource, metrics());
        expect(size.widthPx).toBeCloseTo(xSpan, 10);
        expect(size.heightPx).toBeCloseTo(ySpan, 10);
        expect(size.canResizeWidth).toBe(xSpan !== 0);
        expect(size.canResizeHeight).toBe(ySpan !== 0);
        if (xSpan < 1) expect(resolved(forest).route.status).toBe("ready");
        expect(forest).toEqual(original);
      }
    },
  );

  test.each(presets)(
    "%s retains signed quadrants, flips and the unedited axis at 37 degrees",
    (preset) => {
      for (const xSign of [-1, 1])
        for (const ySign of [-1, 1])
          for (const [flipX, flipY] of [
            [false, false],
            [true, false],
            [false, true],
            [true, true],
          ] as const)
            for (const axis of ["width", "height"] as const) {
              const line = freeShape(preset, 140 * xSign, 80 * ySign);
              line.rotation = 37;
              if (flipX) line.shapeFlipX = true;
              if (flipY) line.shapeFlipY = true;
              const forest = normalizeShapeDrawingForest([framedShape("other"), line]);
              const original = structuredClone(forest);
              const old = signedSpan(forest);
              const result = planShapeConnectorSizeChange(
                forest,
                rootSource,
                { axis, sizePx: 93.125 },
                metrics(),
              );
              const next = signedSpan(result);
              const selectedAxis = axis === "width" ? "x" : "y";
              const otherAxis = axis === "width" ? "y" : "x";
              expect(next[selectedAxis]).toBeCloseTo(Math.sign(old[selectedAxis]) * 93.125, 9);
              expect(next[otherAxis]).toBeCloseTo(old[otherAxis], 9);
              expectOnlyEndChanged(original, result);
              expect(forest).toEqual(original);
            }
    },
  );

  test.each(presets)(
    "%s cardinal zero components stay zero with real tips and no one-pixel fabrication",
    (preset) => {
      for (const angle of [0, 90, 180, 270])
        for (const axis of ["width", "height"] as const) {
          const line = freeShape(preset, axis === "width" ? -120 : 0, axis === "height" ? -80 : 0);
          // Integral worksheet origins keep the original tips exactly cardinal
          // despite ordinary trigonometric roundoff in the carrier transform.
          line.shapeFrame.anchor = {
            mode: "fixed",
            x: 2000,
            y: 3000,
            size: { width: 100, height: 60 },
          };
          line.rotation = angle;
          line.shapeFlipX = true;
          line.shapeFlipY = true;
          const forest = normalizeShapeDrawingForest([line]);
          const original = structuredClone(forest);
          const result = planShapeConnectorSizeChange(
            forest,
            rootSource,
            { axis, sizePx: 50 },
            metrics(),
          );
          const size = getShapeConnectorNumericSize(result, rootSource, metrics());
          expect(axis === "width" ? size.widthPx : size.heightPx).toBeCloseTo(50, 10);
          expect(axis === "width" ? size.heightPx : size.widthPx).toBeLessThan(1e-10);
          expect(axis === "width" ? size.canResizeHeight : size.canResizeWidth).toBe(false);
          expectOnlyEndChanged(original, result);
          const before = resolved(original),
            after = resolved(result);
          if (angle === 0 || angle === 180)
            expect(after.endPosition[axis === "width" ? "y" : "x"]).toBeCloseTo(
              before.endPosition[axis === "width" ? "y" : "x"],
              10,
            );
          else
            expect(after.endPosition[axis === "width" ? "x" : "y"]).toBeCloseTo(
              before.endPosition[axis === "width" ? "x" : "y"],
              10,
            );
        }
    },
  );

  test.each(presets)(
    "%s aspect lock scales both signed components and preserves begin",
    (preset) => {
      for (const axis of ["width", "height"] as const) {
        const line = freeShape(preset, -140, 80);
        line.rotation = 37;
        line.shapeFlipX = true;
        const forest = normalizeShapeDrawingForest([line]);
        const original = structuredClone(forest),
          old = signedSpan(forest);
        const sizePx = Math.abs(old[axis === "width" ? "x" : "y"]) * 1.5;
        const result = planShapeConnectorSizeChange(
          forest,
          rootSource,
          { axis, sizePx, lockAspectRatio: true },
          metrics(),
        );
        const next = signedSpan(result);
        expect(next.x).toBeCloseTo(old.x * 1.5, 9);
        expect(next.y).toBeCloseTo(old.y * 1.5, 9);
        expectOnlyEndChanged(original, result);
        expect(forest).toEqual(original);
      }
    },
  );

  test("aspect lock can scale a nonzero axis while retaining the other zero axis", () => {
    const forest = freeForest("curvedConnector3", -120, 0);
    const result = planShapeConnectorSizeChange(
      forest,
      rootSource,
      { axis: "width", sizePx: 240, lockAspectRatio: true },
      metrics(),
    );
    expect(getShapeConnectorNumericSize(result, rootSource, metrics())).toEqual({
      widthPx: 240,
      heightPx: 0,
      canResizeWidth: true,
      canResizeHeight: false,
    });
    expectOnlyEndChanged(forest, result);
  });

  test("owned nested sources use the complete inherited carrier angle once", () => {
    const line = freeShape("curvedConnector3", -140, 80);
    line.rotation = 13;
    line.shapeFlipX = true;
    line.shapeFlipY = true;
    const forest = normalizeShapeDrawingForest([
      framedShape("other"),
      {
        ...group("owner"),
        rotation: 11,
        members: [{ ...nested("inner"), rotation: 13, members: [owned(line)] }],
      },
    ]);
    const source = { connectorId: "connector", path: ["owner", "inner", "connector"] };
    const original = structuredClone(forest),
      old = signedSpan(forest);
    expect(resolved(forest).carrierLayout!.angleDeg).toBe(37);
    const result = planShapeConnectorSizeChange(
      forest,
      source,
      { axis: "width", sizePx: 93.125 },
      metrics(),
    );
    expect(signedSpan(result).x).toBeCloseTo(Math.sign(old.x) * 93.125, 9);
    expect(signedSpan(result).y).toBeCloseTo(old.y, 9);
    expectOnlyEndChanged(original, result);
    expect(resolved(result).path).toEqual(source.path);
    expect(forest).toEqual(original);
  });

  test("reliably thin endpoint axes can resize without using padded paint dimensions", () => {
    const line = freeShape("bentConnector3", 0.00001, 1);
    line.shapeFrame.anchor = { mode: "fixed", x: 0, y: 0, size: { width: 100, height: 60 } };
    line.shapeConnector!.begin = { kind: "free", xRatio: 0, yRatio: 0 };
    line.shapeConnector!.end = { kind: "free", xRatio: 0.00001 / 100, yRatio: 1 / 60 };
    const forest = normalizeShapeDrawingForest([line]);
    expect(getShapeConnectorNumericSize(forest, rootSource, metrics()).widthPx).toBeCloseTo(
      0.00001,
      12,
    );
    const result = planShapeConnectorSizeChange(
      forest,
      rootSource,
      { axis: "width", sizePx: 0.25 },
      metrics(),
    );
    expect(signedSpan(result)).toEqual({ x: 0.25, y: 1 });
    expectOnlyEndChanged(forest, result);
  });

  test("the existing 16,384-pixel useful span budget is inclusive", () => {
    const forest = freeForest("line", 100, 80);
    const result = planShapeConnectorSizeChange(
      forest,
      rootSource,
      { axis: "width", sizePx: 16384 },
      metrics(),
    );
    expect(getShapeConnectorNumericSize(result, rootSource, metrics()).widthPx).toBe(16384);
    expectOnlyEndChanged(forest, result);
  });

  test("exact numeric no-ops retain stored ratios and add no history item", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const line = freeShape("curvedConnector3", -140, 80);
    line.rotation = 37;
    line.shapeFlipX = true;
    line.shapeFlipY = true;
    sheet.drawings = normalizeShapeDrawingForest([line]);
    const original = structuredClone(sheet.drawings),
      m = createPictureSheetMetrics(sheet);
    const size = getShapeConnectorNumericSize(sheet.drawings, rootSource, m);
    for (const lockAspectRatio of [false, true]) {
      const result = planShapeConnectorSizeChange(
        sheet.drawings,
        rootSource,
        { axis: "width", sizePx: size.widthPx, lockAspectRatio },
        m,
      );
      expect(result).toEqual(original);
      expect(result).not.toBe(sheet.drawings);
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result))).toBe(
        false,
      );
      expect(session.history.undoStack).toHaveLength(0);
    }
  });

  test("numeric edits commit one command, Undo and Redo with unchanged snapshot schema", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const line = freeShape("curvedConnector3", -140, 80);
    line.rotation = 37;
    line.shapeFlipY = true;
    sheet.drawings = normalizeShapeDrawingForest([framedShape("other"), line]);
    const before = serializeWorkbook(session.workbook),
      m = createPictureSheetMetrics(sheet);
    const result = planShapeConnectorSizeChange(
      sheet.drawings,
      rootSource,
      { axis: "height", sizePx: 120, lockAspectRatio: true },
      m,
    );
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, result))).toBe(
      true,
    );
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(63);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    undoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    redoWorkbookCommand(session);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expectOnlyEndChanged(getActiveSheet(deserializeWorkbook(before)).drawings!, sheet.drawings!);
  });
});

describe("connector numeric size admission and bounded refusal", () => {
  test("bound and mixed tips have truthful dimensions but resizing refuses detachment", () => {
    for (const binding of ["bound", "mixed"] as const) {
      const line = connectorShape();
      line.rotation = 37;
      if (binding === "mixed")
        line.shapeConnector!.end = { kind: "free", xRatio: 1.25, yRatio: 0.75 };
      const forest = normalizeShapeDrawingForest([
        framedShape("rect"),
        framedShape("ellipse", "ellipse", 210, 110),
        line,
      ]);
      const original = structuredClone(forest),
        span = signedSpan(forest);
      const size = getShapeConnectorNumericSize(forest, rootSource, metrics());
      expect(size).toEqual({
        widthPx: Math.abs(span.x),
        heightPx: Math.abs(span.y),
        canResizeWidth: false,
        canResizeHeight: false,
      });
      expect(() =>
        planShapeConnectorSizeChange(forest, rootSource, { axis: "width", sizePx: 150 }, metrics()),
      ).toThrow(/both endpoints.*free/);
      expect(forest).toEqual(original);
    }
  });

  test("zero and rotational-roundoff axes cannot acquire an invented direction", () => {
    for (const angle of [0, 37, 90, 180, 270]) {
      const line = freeShape("lineInv", 0, 80);
      line.rotation = angle;
      const forest = normalizeShapeDrawingForest([line]),
        original = structuredClone(forest);
      expect(getShapeConnectorNumericSize(forest, rootSource, metrics()).canResizeWidth).toBe(
        false,
      );
      expect(() =>
        planShapeConnectorSizeChange(forest, rootSource, { axis: "width", sizePx: 50 }, metrics()),
      ).toThrow(/reliably representable span/);
      expect(forest).toEqual(original);
    }
    const forest = freeForest("line", 0, 0);
    expect(getShapeConnectorNumericSize(forest, rootSource, metrics())).toEqual({
      widthPx: 0,
      heightPx: 0,
      canResizeWidth: false,
      canResizeHeight: false,
    });
    expect(() =>
      planShapeConnectorSizeChange(forest, rootSource, { axis: "height", sizePx: 50 }, metrics()),
    ).toThrow(/span/);
  });

  test("finite positive intent and descriptor-safe own fields are required without getter calls", () => {
    const forest = freeForest(),
      original = structuredClone(forest);
    let getterCalls = 0;
    const getter = {
      axis: "width",
      get sizePx() {
        getterCalls++;
        return 100;
      },
    };
    const badEdits: unknown[] = [
      { axis: "width", sizePx: 0 },
      { axis: "width", sizePx: -1 },
      { axis: "width", sizePx: NaN },
      { axis: "height", sizePx: Infinity },
      { axis: "width", sizePx: 16385 },
      { axis: "width", sizePx: "100" },
      { axis: "depth", sizePx: 100 },
      { axis: "width", sizePx: 100, lockAspectRatio: 1 },
      { axis: "width", sizePx: 100, extra: true },
      getter,
      Object.create({ axis: "width", sizePx: 100 }),
      { axis: "width", sizePx: 100, [Symbol("extra")]: true },
    ];
    for (const edit of badEdits)
      expect(() =>
        planShapeConnectorSizeChange(forest, rootSource, edit as ShapeConnectorSizeEdit, metrics()),
      ).toThrow(/size|axis|data record|data fields|boolean/);
    expect(getterCalls).toBe(0);
    expect(forest).toEqual(original);
  });

  test("stale and malformed source identities reject without metric or getter evaluation", () => {
    const forest = freeForest();
    const badMetrics = {
      columns: {
        visiblePrefix() {
          throw new Error("METRICS READ");
        },
      },
      rows: {},
    } as never;
    for (const source of [
      { connectorId: "gone", path: ["gone"] },
      { connectorId: "connector", path: ["owner", "connector"] },
      { connectorId: "connector", path: ["other"] },
      { connectorId: "other", path: ["other"] },
    ]) {
      expect(() => getShapeConnectorNumericSize(forest, source, badMetrics)).toThrow(
        /source.*(identity|connector)/i,
      );
      expect(() =>
        planShapeConnectorSizeChange(forest, source, { axis: "width", sizePx: 100 }, badMetrics),
      ).toThrow(/source.*(identity|connector)/i);
    }
    for (const source of [
      { connectorId: "", path: ["connector"] },
      { connectorId: "connector", path: [] },
      { connectorId: "connector", path: Array(100).fill("connector") },
      { connectorId: "x".repeat(513), path: ["connector"] },
      {
        get connectorId(): string {
          throw new Error("GETTER EXECUTED");
        },
        path: ["connector"],
      },
    ])
      expect(() => getShapeConnectorNumericSize(forest, source, badMetrics)).toThrow(
        /budget|non-empty|data/,
      );
  });

  test("collapsed carriers and suspended bound endpoints refuse read or resize atomically", () => {
    const sheet = createSheet("Synthetic", "sheet");
    setSheetDimensionHidden(sheet, "column", 0, true);
    const m = createPictureSheetMetrics(sheet);
    for (const binding of ["free", "bound"] as const) {
      const line = binding === "free" ? freeShape() : connectorShape();
      const target = framedShape("rect");
      const value = binding === "free" ? line : target;
      value.shapeFrame.anchor = {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
      };
      const forest = normalizeShapeDrawingForest([
        target,
        framedShape("ellipse", "ellipse", 210, 110),
        line,
      ]);
      const original = structuredClone(forest);
      expect(() => getShapeConnectorNumericSize(forest, rootSource, m)).toThrow(
        /available|collapsed/,
      );
      expect(() =>
        planShapeConnectorSizeChange(forest, rootSource, { axis: "width", sizePx: 100 }, m),
      ).toThrow(/available|collapsed|both endpoints/);
      expect(forest).toEqual(original);
    }
  });

  test("aspect, thin inverse, coordinates and control-point route budgets reject without mutation", () => {
    const cases: [SheetDrawing[], ShapeConnectorSizeEdit][] = [
      [freeForest("line", 1, 100), { axis: "width", sizePx: 16384, lockAspectRatio: true }],
      [freeForest("line", 100, 100), { axis: "width", sizePx: 1e-14 }],
      [freeForest("line", 1e-14, 100), { axis: "width", sizePx: 100 }],
    ];
    const line = freeShape("bentConnector3", 100, 60);
    line.shapeGeometry = { preset: "bentConnector3", adjustments: { adj1: 150000 } };
    cases.push([normalizeShapeDrawingForest([line]), { axis: "width", sizePx: 16384 }]);
    const far = freeShape("line", 100, 60);
    far.shapeFrame.anchor = { mode: "fixed", x: 9999800, y: 300, size: { width: 100, height: 60 } };
    cases.push([normalizeShapeDrawingForest([far]), { axis: "width", sizePx: 16384 }]);
    const tiny = owned(freeShape("line", 100, 60));
    tiny.groupFrame.rect = { xRatio: 0, yRatio: 0, widthRatio: 1e-8, heightRatio: 1e-8 };
    cases.push([
      normalizeShapeDrawingForest([{ ...group("owner"), members: [tiny] }]),
      { axis: "width", sizePx: 16384 },
    ]);
    for (const [forest, edit] of cases) {
      const original = structuredClone(forest);
      const source =
        forest[0]!.kind === "shapeGroup"
          ? { connectorId: "connector", path: ["owner", "connector"] }
          : rootSource;
      expect(() => planShapeConnectorSizeChange(forest, source, edit, metrics())).toThrow(
        /budget|span|represent|accurat/,
      );
      expect(forest).toEqual(original);
    }
  });
});
