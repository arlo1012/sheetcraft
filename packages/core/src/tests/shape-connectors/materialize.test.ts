import { describe, expect, test } from "vitest";
import { materializeShapeConnectorTargets } from "../../shape-connector-materialize.js";
import { resolveSheetShapeConnections } from "../../shape-connector-layout.js";
import { shapeFrameLocalToWorld } from "../../shape-frame.js";
import type { ShapeGroupChild, SheetGroupedGraphicDrawing } from "../../shape-group.js";
import {
  normalizeSheetDrawings,
  type SheetDrawing,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { group, metrics, nested } from "../shape-groups/fixtures.js";
import { connectorShape, framedShape } from "./layout-fixtures.js";

function fixture() {
  return [framedShape("rect"), framedShape("ellipse", "ellipse", 210, 110), connectorShape()];
}

function node(forest: readonly SheetDrawing[], id: string): SheetDrawing | ShapeGroupChild {
  function find(value: SheetDrawing | ShapeGroupChild): SheetDrawing | ShapeGroupChild | undefined {
    if (value.id === id) return value;
    if (value.kind === "shapeGroup")
      for (const member of value.members) {
        const found = find(member);
        if (found) return found;
      }
  }
  for (const root of forest) {
    const found = find(root);
    if (found) return found;
  }
  throw new Error(`Missing fixture node ${id}`);
}

function owned(value: SheetFramedGraphicDrawing): SheetGroupedGraphicDrawing {
  const { shapeFrame: _frame, ...appearance } = value;
  return {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.25 },
    },
  };
}

function stretch(value: SheetFramedGraphicDrawing): void {
  value.shapeFrame.anchor = {
    mode: "move-and-size",
    start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
    end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
  };
}

function expectPositionsPreserved(
  before: ReturnType<typeof resolveSheetShapeConnections>,
  after: ReturnType<typeof resolveSheetShapeConnections>,
  connectorId = "connector",
): void {
  for (const endName of ["begin", "end"] as const) {
    const first = before.getConnector(connectorId)![endName];
    const second = after.getConnector(connectorId)![endName];
    expect(second.status).toBe(first.status);
    if (first.status === "ready" && second.status === "ready") {
      expect(second.position.x).toBeCloseTo(first.position.x, 9);
      expect(second.position.y).toBeCloseTo(first.position.y, 9);
    }
  }
}

describe("whole-forest connector endpoint materialization", () => {
  test("detaches only matching site ends and preserves source geometry, appearance, IDs and order", () => {
    const forest = fixture();
    const line = forest[2]!;
    line.name = "Elbow";
    line.text = "Caption";
    line.shapeGeometry = { preset: "bentConnector3", adjustments: { adj1: 37000 } };
    line.shapeLineEnds = { begin: { kind: "triangle" }, end: { kind: "open" } };
    const original = structuredClone(forest);
    const before = resolveSheetShapeConnections(forest, metrics());
    const result = materializeShapeConnectorTargets(forest, ["rect"], metrics());
    const output = result[2]!;
    if (output.kind !== "shape") throw new Error("Expected shape");
    expect(output.shapeConnector!.begin).toEqual({ kind: "free", xRatio: 0, yRatio: 0 });
    expect(output.shapeConnector!.end).toEqual(original[2]!.shapeConnector!.end);
    const expected = structuredClone(original);
    expected[2]!.shapeConnector!.begin = { kind: "free", xRatio: 0, yRatio: 0 };
    expect(result).toEqual(expected);
    expect(forest).toEqual(original);
    expectPositionsPreserved(before, resolveSheetShapeConnections(result, metrics()));
    expect(result).not.toBe(forest);
    expect(result[0]).not.toBe(forest[0]);
    if (output.shapeConnector!.end.kind === "site")
      output.shapeConnector!.end.targetId = "changed output";
    expect(forest[2]!.shapeConnector!.end).toEqual(original[2]!.shapeConnector!.end);
  });

  test("inverse uses carrier geometry, its world angle and inverse flips rather than the route paint frame", () => {
    const forest = fixture();
    forest[2]!.rotation = 90;
    forest[2]!.shapeFlipX = true;
    forest[2]!.shapeFlipY = true;
    const original = structuredClone(forest);
    const before = resolveSheetShapeConnections(forest, metrics());
    const relation = before.getConnector("connector")!;
    if (relation.status === "suspended" || relation.route.status !== "ready")
      throw new Error("Expected route");
    expect(relation.route.paintLayout.rect).not.toEqual(relation.carrierLayout!.rect);
    const result = materializeShapeConnectorTargets(forest, ["rect", "ellipse"], metrics());
    const output = result[2]!;
    if (output.kind !== "shape") throw new Error("Expected shape");
    const begin = output.shapeConnector!.begin;
    const end = output.shapeConnector!.end;
    if (begin.kind !== "free" || end.kind !== "free") throw new Error("Expected free tips");
    expect(begin.xRatio).toBeCloseTo(0.8, 12);
    expect(begin.yRatio).toBeCloseTo(-1 / 3, 12);
    expect(end.xRatio).toBeCloseTo(-0.1, 12);
    expect(end.yRatio).toBeCloseTo(4 / 3, 12);
    const carrier = relation.carrierLayout!;
    for (const [name, value] of [
      ["begin", begin],
      ["end", end],
    ] as const) {
      const position = shapeFrameLocalToWorld(carrier.rect, carrier.angleDeg, {
        x: carrier.rect.width * (1 - value.xRatio),
        y: carrier.rect.height * (1 - value.yRatio),
      });
      const old = relation[name];
      if (old.status !== "ready") throw new Error("Expected site");
      expect(position.x).toBeCloseTo(old.position.x, 10);
      expect(position.y).toBeCloseTo(old.position.y, 10);
    }
    expect(forest).toEqual(original);
    expectPositionsPreserved(before, resolveSheetShapeConnections(result, metrics()));
  });

  test("nested connector and cross-root nested target use the complete parent rotations once", () => {
    const target = owned(framedShape("rect"));
    target.rotation = 17;
    target.shapeFlipX = true;
    const targetOwner = {
      ...group("target-owner"),
      rotation: 31,
      members: [{ ...nested("target-inner"), rotation: 23, members: [target] }],
    };
    const line = owned(connectorShape());
    line.rotation = 13;
    line.shapeFlipX = true;
    line.shapeFlipY = true;
    const lineOwner = {
      ...group("line-owner"),
      rotation: 37,
      members: [{ ...nested("line-inner"), rotation: 23, members: [line] }],
    };
    const forest: SheetDrawing[] = [
      targetOwner,
      framedShape("ellipse", "ellipse", 210, 110),
      lineOwner,
    ];
    const original = structuredClone(forest);
    const before = resolveSheetShapeConnections(forest, metrics());
    expect(before.getConnector("connector")!.carrierLayout!.angleDeg).toBe(73);
    const result = materializeShapeConnectorTargets(forest, ["rect", "ellipse"], metrics());
    const output = node(result, "connector");
    if (output.kind !== "shape") throw new Error("Expected shape");
    const expected = structuredClone(original);
    const replacement = node(expected, "connector");
    if (replacement.kind !== "shape") throw new Error("Expected shape");
    replacement.shapeConnector = structuredClone(output.shapeConnector);
    expect(result).toEqual(expected);
    expect(forest).toEqual(original);
    const after = resolveSheetShapeConnections(result, metrics());
    expect(after.getConnector("connector")!.path).toEqual([
      "line-owner",
      "line-inner",
      "connector",
    ]);
    expectPositionsPreserved(before, after);
  });

  test("both ends on one target materialize independently, including coincident degenerate tips", () => {
    for (const siteIndex of [1, 3]) {
      const target = framedShape("rect");
      const line = connectorShape();
      line.shapeConnector!.end = { kind: "site", targetId: "rect", preset: "rect", siteIndex };
      const before = resolveSheetShapeConnections([target, line], metrics());
      const result = materializeShapeConnectorTargets([target, line], ["rect"], metrics());
      const output = result[1]!;
      if (output.kind !== "shape") throw new Error("Expected shape");
      expect(output.shapeConnector!.begin.kind).toBe("free");
      expect(output.shapeConnector!.end.kind).toBe("free");
      const after = resolveSheetShapeConnections(result, metrics());
      expectPositionsPreserved(before, after);
      expect(after.getConnector("connector")!.status).toBe(
        before.getConnector("connector")!.status,
      );
    }
  });

  test("connector selection detaches only selected connectors and supports a standalone copied closure", () => {
    const forest = [...fixture(), connectorShape("unselected")];
    const original = structuredClone(forest);
    const result = materializeShapeConnectorTargets(forest, ["rect"], metrics(), {
      connectorIds: ["connector"],
    });
    expect(result[3]).toEqual(original[3]);
    const copied = result.filter((entry) => entry.id === "ellipse" || entry.id === "connector");
    expect(() => normalizeSheetDrawings(copied)).not.toThrow();
    expectPositionsPreserved(
      resolveSheetShapeConnections(forest, metrics()),
      resolveSheetShapeConnections(copied, metrics()),
    );
    expect(forest).toEqual(original);
  });

  test("existing containers and non-target IDs are valid no-op selectors, with detached normalized output", () => {
    const forest: SheetDrawing[] = [...fixture(), group("owner"), framedShape("static", "line")];
    const original = structuredClone(forest);
    for (const [targetIds, options] of [
      [[], {}],
      [["owner", "static", "connector"], {}],
      [["rect"], { connectorIds: [] }],
    ] as const) {
      const result = materializeShapeConnectorTargets(forest, targetIds, metrics(), options);
      expect(result).toEqual(original);
      expect(result).not.toBe(forest);
      expect(result[0]).not.toBe(forest[0]);
    }
    expect(forest).toEqual(original);
  });

  test("a no-op validates identities and data without projecting unrelated unavailable geometry", () => {
    const forest = fixture();
    forest[0]!.shapeFrame.anchor = {
      mode: "fixed",
      x: 20_000_000,
      y: 20,
      size: { width: 100, height: 60 },
    };
    const original = structuredClone(forest);
    expect(() => resolveSheetShapeConnections(forest, metrics())).toThrow(/budget/);
    expect(materializeShapeConnectorTargets(forest, [], metrics())).toEqual(original);
    expect(
      materializeShapeConnectorTargets(forest, ["rect"], metrics(), { connectorIds: [] }),
    ).toEqual(original);
    expect(materializeShapeConnectorTargets(forest, ["connector"], metrics())).toEqual(original);
    expect(forest).toEqual(original);
  });

  test("a ready chosen site can materialize while the opposite target and unrelated connector are suspended", () => {
    const sheet = createSheet("Synthetic", "sheet");
    const forest = fixture();
    stretch(forest[0]!);
    forest.push(connectorShape("unrelated"));
    setSheetDimensionHidden(sheet, "column", 0, true);
    const m = createPictureSheetMetrics(sheet);
    const original = structuredClone(forest);
    const before = resolveSheetShapeConnections(forest, m);
    expect(before.getConnector("connector")!.status).toBe("suspended");
    const result = materializeShapeConnectorTargets(forest, ["ellipse"], m, {
      connectorIds: ["connector"],
    });
    const output = result[2]!;
    if (output.kind !== "shape") throw new Error("Expected shape");
    expect(output.shapeConnector!.begin).toEqual(original[2]!.shapeConnector!.begin);
    expect(output.shapeConnector!.end.kind).toBe("free");
    expect(result[3]).toEqual(original[3]);
    expectPositionsPreserved(before, resolveSheetShapeConnections(result, m));
    expect(materializeShapeConnectorTargets(forest, [], m)).toEqual(original);
    expect(materializeShapeConnectorTargets(forest, ["rect"], m, { connectorIds: [] })).toEqual(
      original,
    );
    expect(forest).toEqual(original);
  });

  test("a collapsed chosen site rejects atomically even after an earlier end has been planned", () => {
    const sheet = createSheet("Synthetic", "sheet");
    const forest = fixture();
    stretch(forest[0]!);
    forest[2]!.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "ellipse", preset: "ellipse", siteIndex: 2 },
      end: { kind: "site", targetId: "rect", preset: "rect", siteIndex: 3 },
    };
    setSheetDimensionHidden(sheet, "column", 0, true);
    const original = structuredClone(forest);
    expect(() =>
      materializeShapeConnectorTargets(
        forest,
        ["ellipse", "rect"],
        createPictureSheetMetrics(sheet),
      ),
    ).toThrow(/unavailable|collapsed/);
    expect(forest).toEqual(original);
  });

  test("collapsed root and nested carriers refuse inverse placement with no guessed fallback", () => {
    const sheet = createSheet("Synthetic", "sheet");
    const forest = fixture();
    stretch(forest[2]!);
    const line = owned(connectorShape("nested-connector"));
    const owner = { ...group("owner"), shapeFrame: forest[2]!.shapeFrame, members: [line] };
    const both: SheetDrawing[] = [...forest, owner];
    setSheetDimensionHidden(sheet, "column", 0, true);
    const original = structuredClone(both);
    for (const connectorId of ["connector", "nested-connector"])
      expect(() =>
        materializeShapeConnectorTargets(both, ["rect"], createPictureSheetMetrics(sheet), {
          connectorIds: [connectorId],
        }),
      ).toThrow(/collapsed carrier/);
    expect(both).toEqual(original);
  });

  test("inverse ratios and free local coordinates obey their budgets atomically", () => {
    for (const [x, width] of [
      [-1_500_000, 1],
      [-20_000_000, 100],
    ] as const) {
      const forest = fixture();
      forest[2]!.shapeFrame.anchor = { mode: "fixed", x, y: 50, size: { width, height: 60 } };
      const original = structuredClone(forest);
      expect(() => resolveSheetShapeConnections(forest, metrics())).not.toThrow();
      expect(() => materializeShapeConnectorTargets(forest, ["rect"], metrics())).toThrow(/budget/);
      expect(forest).toEqual(original);
    }
  });

  test("zero ratios stay canonical and existing free endpoints do not materialize again", () => {
    const target = framedShape("rect", "rect", -100, -30);
    const line = connectorShape();
    line.shapeFrame.anchor = { mode: "fixed", x: 0, y: 0, size: { width: 100, height: 60 } };
    line.shapeConnector!.end = { kind: "free", xRatio: 1, yRatio: 1 };
    const result = materializeShapeConnectorTargets([target, line], ["rect"], metrics());
    const output = result[1]!;
    if (output.kind !== "shape") throw new Error("Expected shape");
    const begin = output.shapeConnector!.begin;
    expect(begin).toEqual({ kind: "free", xRatio: 0, yRatio: 0 });
    if (begin.kind === "free") {
      expect(Object.is(begin.xRatio, -0)).toBe(false);
      expect(Object.is(begin.yRatio, -0)).toBe(false);
    }
    expect(output.shapeConnector!.end).toEqual(line.shapeConnector!.end);
    expect(materializeShapeConnectorTargets(result, ["rect"], metrics())).toEqual(result);
  });
});

describe("materialization admission and bounded selection", () => {
  test("missing target and missing or non-live connector IDs reject before metrics are used", () => {
    const badMetrics = {
      columns: {
        visiblePrefix() {
          throw new Error("METRICS READ");
        },
      },
      rows: {
        visiblePrefix() {
          throw new Error("METRICS READ");
        },
      },
    } as never;
    expect(() => materializeShapeConnectorTargets(fixture(), ["gone"], badMetrics)).toThrow(
      /target gone is missing/,
    );
    for (const connectorId of ["gone", "rect"])
      expect(() =>
        materializeShapeConnectorTargets(fixture(), ["rect"], badMetrics, {
          connectorIds: [connectorId],
        }),
      ).toThrow(/not a current live connector/);
  });

  test("duplicate, empty and oversized identity selections reject without implicit trimming", () => {
    for (const ids of [["rect", "rect"], [""], [" \t"], ["x".repeat(513)]])
      expect(() => materializeShapeConnectorTargets(fixture(), ids, metrics())).toThrow();
    expect(() => materializeShapeConnectorTargets(fixture(), [" rect "], metrics())).toThrow(
      /missing/,
    );
    expect(() =>
      materializeShapeConnectorTargets(fixture(), ["rect"], metrics(), {
        connectorIds: ["connector", "connector"],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      materializeShapeConnectorTargets(fixture(), Array(10001).fill("rect"), metrics()),
    ).toThrow(/budget/);
    const aggregate = Array.from({ length: 2000 }, (_, index) => `id-${index}`.padEnd(512, "x"));
    expect(() => materializeShapeConnectorTargets(fixture(), aggregate, metrics())).toThrow(
      /aggregate identity-character budget/,
    );
  });

  test("ID arrays, options and forests reject getters and custom traversal without invoking them", () => {
    let reads = 0;
    const targetIds = ["rect"];
    Object.defineProperty(targetIds, "0", {
      get() {
        reads++;
        return "rect";
      },
    });
    expect(() => materializeShapeConnectorTargets(fixture(), targetIds, metrics())).toThrow();
    const connectorIds = ["connector"];
    Object.defineProperty(connectorIds, "0", {
      get() {
        reads++;
        return "connector";
      },
    });
    expect(() =>
      materializeShapeConnectorTargets(fixture(), ["rect"], metrics(), { connectorIds }),
    ).toThrow();
    expect(() =>
      materializeShapeConnectorTargets(fixture(), ["rect"], metrics(), {
        get connectorIds() {
          reads++;
          return ["connector"];
        },
      }),
    ).toThrow(/own data/);
    const forest = fixture();
    Object.defineProperty(forest[2]!, "shapeConnector", {
      get() {
        reads++;
        return connectorShape().shapeConnector;
      },
    });
    expect(() => materializeShapeConnectorTargets(forest, ["rect"], metrics())).toThrow();
    const nestedForest = fixture();
    const line = owned(nestedForest.pop()!);
    Object.defineProperty(line, "shapeConnector", {
      get() {
        reads++;
        return connectorShape().shapeConnector;
      },
    });
    expect(() =>
      materializeShapeConnectorTargets(
        [...nestedForest, { ...group("owner"), members: [line] }],
        ["rect"],
        metrics(),
      ),
    ).toThrow();
    const custom = ["rect"];
    custom.map = (() => {
      reads++;
      return [];
    }) as typeof custom.map;
    expect(() => materializeShapeConnectorTargets(fixture(), custom, metrics())).toThrow();
    const sparse: string[] = [];
    sparse.length = 1;
    expect(() => materializeShapeConnectorTargets(fixture(), sparse, metrics())).toThrow();
    expect(reads).toBe(0);
  });

  test("unknown, symbol and inherited options are rejected; ordinary null-prototype options are accepted", () => {
    const unknown = { connectorIds: ["connector"], fallback: undefined };
    expect(() => materializeShapeConnectorTargets(fixture(), ["rect"], metrics(), unknown)).toThrow(
      /own data/,
    );
    const symbol = { connectorIds: ["connector"] };
    Object.defineProperty(symbol, Symbol("hidden"), { value: 1 });
    expect(() => materializeShapeConnectorTargets(fixture(), ["rect"], metrics(), symbol)).toThrow(
      /own data/,
    );
    expect(() =>
      materializeShapeConnectorTargets(
        fixture(),
        ["rect"],
        metrics(),
        Object.create({ connectorIds: ["connector"] }),
      ),
    ).toThrow(/ordinary/);
    const options = Object.assign(Object.create(null) as { connectorIds: string[] }, {
      connectorIds: ["connector"],
    });
    expect(() =>
      materializeShapeConnectorTargets(fixture(), ["rect"], metrics(), options),
    ).not.toThrow();
  });
});
