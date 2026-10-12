import { describe, expect, test } from "vitest";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { isShapeGroupDrawing, type ShapeGroupDrawing } from "../../shape-group.js";
import { resolveShapeGroup, type ResolvedShapeGroupNode } from "../../shape-group-layout.js";
import { isShapeGroupEligibleRoot, resolveShapeRootLayout } from "../../shape-group-planning.js";
import type { ResolvedShapeFrame } from "../../shape-frame.js";
import {
  isFramedShapeDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
} from "../../sheet-drawings.js";
import { createSheet, setSheetDimensionHidden } from "../../workbook.js";
import { group, leaf, metrics, nested, textModel } from "./fixtures.js";

function fixture(): ShapeGroupDrawing {
  const a = {
    ...leaf("a"),
    rotation: 37,
    shapeText: textModel(),
    shapeProperties: { lockAspectRatio: true as const, altTitle: "Survivor" },
  };
  const b = leaf("b");
  b.groupFrame.rect.xRatio = 0.7;
  b.groupFrame.rect.yRatio = 0.6;
  const inner = { ...nested("inner"), members: [a, b], rotation: 13 };
  const c = leaf("c");
  c.groupFrame.rect.xRatio = 0.8;
  c.groupFrame.rect.yRatio = 0.7;
  return {
    ...group("root"),
    rotation: 37,
    members: [inner, c],
    shapeProperties: { locked: false, printObject: false },
  };
}
function ordinary(id: string): SheetGraphicDrawing {
  const { groupFrame: _frame, ...appearance } = leaf(id);
  return {
    ...appearance,
    kind: "icon",
    anchor: { row: 0, column: 0 },
    offsetX: 10,
    offsetY: 20,
    width: 100,
    height: 50,
  };
}
function layouts(values: readonly SheetDrawing[]): Map<string, ResolvedShapeFrame> {
  const result = new Map<string, ResolvedShapeFrame>();
  function collect(node: ResolvedShapeGroupNode): void {
    if (node.layout) result.set(node.node.id, node.layout);
    if ("members" in node) for (const child of node.members) collect(child);
  }
  for (const root of values) {
    if (isShapeGroupDrawing(root)) collect(resolveShapeGroup(root, metrics()));
    else if (isShapeGroupEligibleRoot(root))
      result.set(root.id, resolveShapeRootLayout(root, metrics()));
  }
  return result;
}
function expectWorldPreserved(
  before: Map<string, ResolvedShapeFrame>,
  after: Map<string, ResolvedShapeFrame>,
  ids: readonly string[],
): void {
  for (const id of ids) {
    const initial = before.get(id)!,
      final = after.get(id)!;
    expect(final.angleDeg).toBe(initial.angleDeg);
    expect(final.rect.width).toBeCloseTo(initial.rect.width, 9);
    expect(final.rect.height).toBeCloseTo(initial.rect.height, 9);
    final.corners.forEach((point, index) => {
      expect(point.x).toBeCloseTo(initial.corners[index]!.x, 9);
      expect(point.y).toBeCloseTo(initial.corners[index]!.y, 9);
    });
  }
}

describe("shape-owned exact-path Delete", () => {
  test("nested affected singleton dissolves and a rotated outer owner contracts without survivor jumps", () => {
    const root = fixture(),
      before = structuredClone(root),
      initial = layouts([root]);
    const next = planDeleteShapeGroupNodes(
      [ordinary("under"), root, ordinary("above")],
      [["root", "inner", "b"]],
      metrics(),
    );
    expect(next.map((node) => node.id)).toEqual(["under", "root", "above"]);
    const owner = next[1]!;
    if (!isShapeGroupDrawing(owner)) throw Error("Expected surviving root owner");
    expect(owner.members.map((member) => member.id)).toEqual(["a", "c"]);
    expect(owner.rotation).toBe(37);
    expectWorldPreserved(initial, layouts(next), ["a", "c"]);
    expect((owner.members[0] as ReturnType<typeof leaf>).fontSize).toBe(19);
    expect(root).toEqual(before);
  });
  test("recursive singleton cascade releases the actual survivor identity and root lock/print policy", () => {
    const root = fixture();
    root.members.pop();
    const initial = layouts([root]);
    const next = planDeleteShapeGroupNodes([root], [["root", "inner", "b"]], metrics());
    expect(next.map((node) => node.id)).toEqual(["a"]);
    const survivor = next[0]!;
    if (!isFramedShapeDrawing(survivor)) throw Error("Expected framed survivor");
    expect(survivor.shapeFrame.anchor.mode).toBe("move-and-size");
    expect(survivor.shapeProperties).toEqual({
      lockAspectRatio: true,
      locked: false,
      printObject: false,
      altTitle: "Survivor",
    });
    expect(survivor.shapeText).toEqual(textModel());
    expectWorldPreserved(initial, layouts(next), ["a"]);
  });
  test("surviving nested subgroup is promoted intact and untouched recovery singletons remain owners", () => {
    const inner = { ...nested("inner"), members: [leaf("a"), leaf("b")], rotation: 37 };
    const root = { ...group("root"), members: [inner, leaf("c")] };
    const initial = layouts([root]);
    const next = planDeleteShapeGroupNodes([root], [["root", "c"]], metrics());
    const promoted = next[0]!;
    if (!isShapeGroupDrawing(promoted)) throw Error("Expected promoted subgroup");
    expect(promoted.id).toBe("inner");
    expect(promoted.members).toEqual(inner.members);
    expectWorldPreserved(initial, layouts(next), ["inner", "a", "b"]);
    const singleton = { ...group("single"), members: [leaf("single-child")] };
    const untouched = planDeleteShapeGroupNodes([singleton, root], [["root"]], metrics());
    expect(untouched).toEqual([singleton]);
    expect(planDeleteShapeGroupNodes([singleton], [], metrics())).toEqual([singleton]);
  });
  test("ancestor deletion validates stale descendants first, then prunes duplicates and empties", () => {
    const root = fixture(),
      before = structuredClone(root);
    expect(() =>
      planDeleteShapeGroupNodes(
        [root],
        [
          ["root", "inner"],
          ["root", "inner", "missing"],
        ],
        metrics(),
      ),
    ).toThrow(/missing/);
    expect(() => planDeleteShapeGroupNodes([root], [["other", "inner", "a"]], metrics())).toThrow(
      /reparented/,
    );
    expect(
      planDeleteShapeGroupNodes([root], [["root"], ["root", "inner", "a"], ["root"]], metrics()),
    ).toEqual([]);
    expect(
      planDeleteShapeGroupNodes(
        [root],
        [
          ["root", "inner", "a"],
          ["root", "inner", "b"],
          ["root", "c"],
        ],
        metrics(),
      ),
    ).toEqual([]);
    expect(root).toEqual(before);
  });
  test("whole collapsed root removal is safe, owned deletion is refused, and unrelated collapse stays unchanged", () => {
    const sheet = createSheet("Synthetic", "sheet"),
      root = fixture();
    root.shapeFrame.anchor = {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
      end: { column: { index: 1, offset: 0 }, row: { index: 1, offset: 0 } },
    };
    setSheetDimensionHidden(sheet, "column", 0, true);
    const m = createPictureSheetMetrics(sheet);
    expect(planDeleteShapeGroupNodes([root], [["root"]], m)).toEqual([]);
    expect(() => planDeleteShapeGroupNodes([root], [["root", "inner", "a"]], m)).toThrow(
      /collapsed/,
    );
    expect(planDeleteShapeGroupNodes([root, ordinary("ordinary")], [["ordinary"]], m)).toEqual([
      root,
    ]);
  });
  test("ordinary IDs share the forest namespace and invalid unselected geometry rejects the complete plan", () => {
    const root = fixture();
    expect(() => planDeleteShapeGroupNodes([root, ordinary("a")], [["root"]], metrics())).toThrow(
      /Duplicate/,
    );
    (root.members[0] as ReturnType<typeof nested>).members[0]!.groupFrame.rect.widthRatio =
      Number.MAX_VALUE;
    expect(() =>
      planDeleteShapeGroupNodes([ordinary("ordinary"), root], [["ordinary"]], metrics()),
    ).toThrow();
  });
});
