import { describe, expect, test, vi } from "vitest";
import {
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import { normalizeShapeGroup, type ShapeGroupDrawing } from "../../shape-group.js";
import { groupShapeRoots, ungroupShapeRoot } from "../../shape-group-planning.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { createSheet } from "../../workbook.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { group } from "../shape-groups/fixtures.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";

function shape(
  id: string,
  preset: "rect" | "ellipse" | "bentConnector3" = "rect",
): SheetFramedGraphicDrawing {
  return {
    ...framedShapeDrawing({ mode: "fixed", x: 100, y: 100, size: { width: 200, height: 120 } }),
    id,
    text: "",
    shapeGeometry: { preset },
  };
}
function connected() {
  const target = shape("target");
  const line = shape("connection", "bentConnector3");
  line.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: target.id, preset: "rect", siteIndex: 3 },
    end: { kind: "free", xRatio: 1, yRatio: 1 },
  };
  return { target, line, forest: [target, line] };
}
describe("live connector canonical admission", () => {
  test("normalizes canonical endpoints without aliasing or adding resolved caches", () => {
    const { line } = connected();
    const actual = normalizeSheetDrawing(line);
    expect(actual).toEqual(line);
    expect(actual.shapeConnector).not.toBe(line.shapeConnector);
    line.shapeConnector!.end = { kind: "free", xRatio: 999, yRatio: 999 };
    expect(actual.shapeConnector!.end).toEqual({ kind: "free", xRatio: 1, yRatio: 1 });
    expect(actual).not.toHaveProperty("resolvedRoute");
  });
  test("legacy placement cannot silently gain or discard connector state", () => {
    const { line } = connected();
    const { shapeFrame: _frame, ...appearance } = line;
    expect(() =>
      normalizeSheetDrawing({
        ...appearance,
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 120,
      }),
    ).toThrow(/canonical/);
  });
  test("rejects wrong kinds, missing line geometry and path conflicts", () => {
    const { line } = connected();
    for (const input of [
      { ...line, kind: "textBox" },
      { ...line, shapeGeometry: { preset: "rect" } },
      { ...line, shapeGeometry: undefined },
      {
        ...line,
        shapePath: {
          tool: "scribble",
          commands: [
            ["M", 0, 0],
            ["L", 1, 1],
          ],
        },
      },
    ])
      expect(() => normalizeSheetDrawing(input as never)).toThrow();
  });
  test("rejects undefined, inherited or accessor connector payloads without evaluating them", () => {
    const { line } = connected();
    const getter = vi.fn(() => line.shapeConnector);
    const access = { ...line };
    Object.defineProperty(access, "shapeConnector", { get: getter });
    expect(() => normalizeSheetDrawing(access)).toThrow(/data fields/);
    expect(getter).not.toHaveBeenCalled();
    expect(() => normalizeSheetDrawing({ ...line, shapeConnector: undefined })).toThrow();
    const inherited = Object.assign(
      Object.create({ shapeConnector: line.shapeConnector }) as object,
      line,
    );
    delete (inherited as { shapeConnector?: unknown }).shapeConnector;
    expect(() => normalizeSheetDrawing(inherited as never)).toThrow(/ordinary/);
  });
  test("whole-forest admission rejects missing, replaced, wrong-kind and out-of-range targets", () => {
    const { target, line, forest } = connected();
    expect(normalizeSheetDrawings(forest)).toEqual(forest);
    expect(() => normalizeSheetDrawings([line])).toThrow(/target/i);
    expect(() =>
      normalizeSheetDrawings([{ ...target, shapeGeometry: { preset: "ellipse" } }, line]),
    ).toThrow(/preset/i);
    expect(() => normalizeSheetDrawings([{ ...target, shapeGeometry: undefined }, line])).toThrow(
      /target/i,
    );
    const outside = {
      ...line,
      shapeConnector: {
        ...line.shapeConnector!,
        begin: {
          kind: "site" as const,
          targetId: target.id,
          preset: "rect" as const,
          siteIndex: 4,
        },
      },
    };
    expect(() => normalizeSheetDrawings([target, outside])).toThrow(/site/i);
  });
  test("an apparent target's connector or line category cannot create an endpoint dependency cycle", () => {
    const { line } = connected();
    line.shapeConnector!.begin = {
      kind: "site",
      targetId: line.id,
      preset: "bentConnector3",
      siteIndex: 0,
    };
    expect(() => normalizeSheetDrawings([line])).toThrow(/target/i);
  });
  test("owned leaves preserve the same feature and reject placing it on an owner", () => {
    const { target, line } = connected();
    const { shapeFrame: _targetFrame, ...targetAppearance } = target;
    const { shapeFrame: _lineFrame, ...lineAppearance } = line;
    const root: ShapeGroupDrawing = {
      ...group("owner"),
      members: [
        {
          ...targetAppearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
          },
        },
        {
          ...lineAppearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0.5, yRatio: 0.5, widthRatio: 0.5, heightRatio: 0.5 },
          },
        },
      ],
    };
    expect(normalizeShapeGroup(root).members[1]).toEqual(root.members[1]);
    expect(normalizeSheetDrawings([root])).toEqual([root]);
    expect(() =>
      normalizeShapeGroup({ ...root, shapeConnector: line.shapeConnector } as never),
    ).toThrow(/field/);
  });
  test("same IDs preserve attachment through group and ungroup, while clipboard clones remap the complete closure", () => {
    const { forest } = connected();
    const metrics = createPictureSheetMetrics(createSheet("Synthetic", "sheet"));
    const owned = groupShapeRoots(
      forest,
      ["target", "connection"],
      { id: "owner", name: "Group" },
      metrics,
    );
    const released = ungroupShapeRoot(owned, "owner", metrics);
    expect(
      normalizeSheetDrawings(released).find((node) => node.id === "connection"),
    ).toHaveProperty("shapeConnector.begin.targetId", "target");
    let index = 0;
    const copied = cloneShapeRootsForClipboard(owned, { createId: () => `copy-${++index}` });
    expect(copied[0]).toHaveProperty("members.1.shapeConnector.begin.targetId", "copy-2");
    expect(owned[0]).toHaveProperty("members.1.shapeConnector.begin.targetId", "target");
  });
  test("ordinary documents without live connectors do not acquire the new graph's node budget", () => {
    const base = legacyShapeDrawing();
    const drawings = Array.from({ length: 10001 }, (_, index) => ({
      ...base,
      id: `ordinary-${index}`,
    }));
    expect(normalizeSheetDrawings(drawings)).toHaveLength(10001);
  });
  test("invalid collection commands fail before any original target or connector changes", () => {
    const { line, forest } = connected();
    const before = structuredClone(forest);
    expect(() => createSetSheetDrawingsCommand("sheet", [line])).toThrow();
    expect(forest).toEqual(before);
  });
});
