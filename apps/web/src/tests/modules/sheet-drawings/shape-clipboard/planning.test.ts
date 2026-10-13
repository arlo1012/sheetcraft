// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import { isShapeGroupDrawing, traverseShapeGroup } from "@sheetcraft/core/shape-group";
import { resolveShapeGroup } from "@sheetcraft/core/shape-group-layout";
import {
  groupShapeRoots,
  resolveShapeRootLayout,
  isShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import { createSheet } from "@sheetcraft/core/workbook";
import { resolveShapeGroupProjection } from "../../../../modules/sheet-drawings/resolved-shape-group";
import {
  captureShapeClipboardSelection,
  placeShapeClipboardRoots,
  planShapeClipboardPaste,
} from "../../../../modules/sheet-drawings/shape-clipboard-planning";
import { camera, group, metrics, shape, wordArt } from "./fixture";

describe("internal shape object clipboard plans", () => {
  test("exact paths deduplicate descendants and repeats in source stacking order", () => {
    const root = group();
    const art = wordArt();
    const before = structuredClone([root, art]);
    const selection = captureShapeClipboardSelection(
      [root, art],
      [[art.id], [root.id, "inner", "nested"], [root.id], [root.id]],
      metrics(),
    );
    expect(selection.selectedPaths).toEqual([[root.id], [art.id]]);
    expect(selection.roots.map((value) => value.id)).toEqual([root.id, art.id]);
    expect(selection.roots[0]).not.toBe(root);
    expect(selection.sourceForest[0]).not.toBe(selection.roots[0]);
    expect([root, art]).toEqual(before);
  });

  test("a stale descendant is rejected even when its root is also selected", () => {
    expect(() =>
      captureShapeClipboardSelection([group()], [["outer"], ["outer", "nested"]], metrics()),
    ).toThrow("invalid-selection");
    expect(() =>
      captureShapeClipboardSelection([group()], [["outer", "missing"]], metrics()),
    ).toThrow("invalid-selection");
  });

  test("malformed selection data rejects before accessors or overridden iterators execute", () => {
    const getter = vi.fn(() => "outer");
    const path: string[] = [];
    Object.defineProperty(path, "0", { get: getter });
    expect(() => captureShapeClipboardSelection([group()], [path], metrics())).toThrow();
    const paths = [["outer"]];
    Object.defineProperty(paths, Symbol.iterator, { value: getter });
    expect(() => captureShapeClipboardSelection([group()], paths, metrics())).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  test("whole-group clone preserves hidden members, modern glyph/body/run assets and deep source detachment", () => {
    const m = metrics();
    const root = group();
    const before = structuredClone(root);
    const selection = captureShapeClipboardSelection([root], [[root.id]], m);
    let count = 0;
    const plan = planShapeClipboardPaste({
      selection,
      mode: "copy",
      targetForest: [root],
      sourceMetrics: m,
      targetMetrics: m,
      address: { row: 2, column: 3 },
      createId: () => `fresh-${++count}`,
    });
    const cloned = plan.roots[0]!;
    if (!isShapeGroupDrawing(cloned)) throw Error("Expected group");
    expect(traverseShapeGroup(cloned).map(({ node }) => node.id)).toEqual([
      "fresh-1",
      "fresh-2",
      "fresh-3",
      "fresh-4",
      "fresh-5",
    ]);
    const inner = cloned.members[1]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected subgroup");
    const art = inner.members[1]!;
    if (art.kind === "shapeGroup") throw Error("Expected WordArt");
    expect(art.hidden).toBe(true);
    expect(art.wordArt).toBe(true);
    expect(art.shapeStyle?.fill).toMatchObject({ value: { assetId: "body-asset" } });
    expect(art.shapeText?.style?.fill).toMatchObject({ value: { assetId: "glyph-asset" } });
    expect(art.shapeText?.characterRuns?.[0]).toMatchObject({
      fill: { value: { assetId: "run-asset" } },
    });
    art.shapeText!.layout.marginsPt.leftPt = 99;
    expect(root).toEqual(before);
    expect(selection.roots[0]).toEqual(before);
    expect(plan.nextForest).toHaveLength(2);
  });

  test("owned leaf/subgroup extraction preserves resolved geometry, outer lock/print and ancestor hidden state", () => {
    const m = metrics();
    const root = group();
    root.hidden = true;
    const original = resolveShapeGroup(root, m);
    const branch = original.members[1]!;
    const selection = captureShapeClipboardSelection([root], [["outer", "inner"]], m);
    const released = selection.roots[0]!;
    if (!isShapeGroupDrawing(released)) throw Error("Expected real subgroup");
    expect(released.hidden).toBe(true);
    expect(released.shapeProperties).toEqual({
      locked: false,
      printObject: false,
      altTitle: "Inner title",
      lockAspectRatio: true,
    });
    const after = resolveShapeGroup(released, m);
    expect(after.layout.rect.x).toBeCloseTo(branch.layout!.rect.x, 9);
    expect(after.layout.rect.y).toBeCloseTo(branch.layout!.rect.y, 9);
    expect(after.layout.angleDeg).toBe(branch.layout!.angleDeg);
    if (!("members" in branch)) throw Error("Expected branch");
    for (let index = 0; index < branch.members.length; index++) {
      expect(after.members[index]!.layout!.rect.x).toBeCloseTo(
        branch.members[index]!.layout!.rect.x,
        9,
      );
      expect(after.members[index]!.layout!.rect.y).toBeCloseTo(
        branch.members[index]!.layout!.rect.y,
        9,
      );
      expect(after.members[index]!.layout!.angleDeg).toBe(branch.members[index]!.layout!.angleDeg);
    }
    const leaf = captureShapeClipboardSelection([root], [["outer", "inner", "nested"]], m)
      .roots[0]!;
    if (leaf.kind !== "shape" && leaf.kind !== "textBox") throw Error("Expected shape");
    expect(leaf.hidden).toBe(true);
    expect(leaf.rotation).toBe(79);
    expect(leaf).not.toHaveProperty("groupFrame");
  });

  test("subgroup-owned camera survives extraction and translation with the same scene mapping", () => {
    const root = group();
    const branch = root.members[1]!;
    if (branch.kind !== "shapeGroup") throw Error("Expected subgroup");
    branch.group3d = { rotation3d: camera };
    const m = metrics();
    const before = resolveShapeGroupProjection(root, m).leaves.filter(
      (leaf) => leaf.parentPath.at(-1) === "inner",
    );
    const selection = captureShapeClipboardSelection([root], [["outer", "inner"]], m);
    const placed = placeShapeClipboardRoots(selection.roots, m, m, { row: 5, column: 6 })[0]!;
    if (!isShapeGroupDrawing(placed)) throw Error("Expected group");
    const after = resolveShapeGroupProjection(placed, m).leaves;
    expect(placed.group3d).toEqual(branch.group3d);
    for (let index = 0; index < before.length; index++) {
      const prior = before[index]!.groupScene!;
      const next = after[index]!.groupScene!;
      expect(next.scene.widthPx).toBeCloseTo(prior.scene.widthPx, 9);
      expect(next.scene.heightPx).toBeCloseTo(prior.scene.heightPx, 9);
      for (const key of ["a", "b", "c", "d", "e", "f"] as const)
        expect(next.scene.sourceToScene[key]).toBeCloseTo(prior.scene.sourceToScene[key], 9);
    }
  });

  test("inherited camera/shared owner effects reject extraction without flattening or changing sources", () => {
    const root = group();
    root.group3d = { rotation3d: camera };
    const before = structuredClone(root);
    expect(() => captureShapeClipboardSelection([root], [["outer", "inner"]], metrics())).toThrow(
      "unsupported-group-scene",
    );
    expect(() =>
      captureShapeClipboardSelection([root], [["outer", "inner", "nested"]], metrics()),
    ).toThrow("unsupported-group-scene");
    expect(captureShapeClipboardSelection([root], [["outer"]], metrics()).roots).toHaveLength(1);
    expect(root).toEqual(before);
    delete root.group3d;
    root.groupEffects = {
      glow: {
        kind: "value",
        value: { color: { kind: "rgb", rgb: "#123456" }, opacity: 1, sizePt: 5 },
      },
    };
    expect(() => captureShapeClipboardSelection([root], [["outer", "inner"]], metrics())).toThrow(
      "unsupported-owner-effects",
    );
  });

  test("cross-sheet translation uses source sheet-space sizes and target metrics with original anchor modes", () => {
    const m = metrics();
    const root = wordArt();
    root.shapeFrame.anchor = {
      mode: "move-only",
      origin: { column: { index: 2, offset: 7 }, row: { index: 1, offset: 5 } },
      size: { width: 80, height: 40 },
    };
    const other = shape("other", 700, 320);
    const targetSheet = createSheet("Target", "target");
    targetSheet.columnWidths.set(0, 150);
    targetSheet.rowHeights.set(0, 75);
    const target = createPictureSheetMetrics(targetSheet);
    const sourceRect = resolveShapeRootLayout(root, m).rect;
    const otherRect = resolveShapeRootLayout(other, m).rect;
    const result = placeShapeClipboardRoots([root, other], m, target, { row: 1, column: 1 });
    const first = result[0]!;
    if (!("shapeFrame" in first)) throw Error("Expected canonical root");
    expect(first.shapeFrame.anchor.mode).toBe("move-only");
    const at = resolveShapeRootLayout(first, target).rect;
    expect(at).toEqual({ x: 150, y: 75, width: 80, height: 40 });
    const second = result[1]!;
    if (!isShapeGroupEligibleRoot(second) || second.kind !== "shape") throw Error("Expected shape");
    const secondRect = resolveShapeRootLayout(second, target).rect;
    expect(secondRect.x - at.x).toBe(otherRect.x - sourceRect.x);
    expect(secondRect.y - at.y).toBe(otherRect.y - sourceRect.y);
  });

  test("owned connector copy captures outside endpoints before extraction and remaps the copied target closure", () => {
    const m = metrics();
    const a = shape("a", 10, 20);
    const b = shape("b", 500, 300);
    const connector = shape("connector", 200, 100);
    connector.shapeGeometry = { preset: "bentConnector3" };
    connector.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "a", preset: "rect", siteIndex: 3 },
      end: { kind: "site", targetId: "b", preset: "rect", siteIndex: 1 },
    };
    const forest = groupShapeRoots(
      [a, b, connector],
      ["a", "connector"],
      { id: "owner", name: "Owner" },
      m,
    );
    const owner = forest.find((root) => root.id === "owner")!;
    owner.rotation = 37;
    const before = resolveSheetShapeConnections(forest, m).getConnector("connector")!;
    const captured = captureShapeClipboardSelection(forest, [["owner", "connector"]], m);
    const extracted = resolveSheetShapeConnections(captured.roots, m).getConnector("connector")!;
    expect(extracted.begin).toMatchObject({ kind: "free", status: "ready" });
    expect(extracted.end).toMatchObject({ kind: "free", status: "ready" });
    if (before.begin.status !== "ready" || extracted.begin.status !== "ready")
      throw Error("Ready tip");
    expect(extracted.begin.position.x).toBeCloseTo(before.begin.position.x, 8);
    expect(extracted.begin.position.y).toBeCloseTo(before.begin.position.y, 8);
    let id = 0;
    const closure = captureShapeClipboardSelection(
      forest,
      [
        ["owner", "a"],
        ["owner", "connector"],
      ],
      m,
    );
    const plan = planShapeClipboardPaste({
      selection: closure,
      mode: "copy",
      targetForest: forest,
      sourceMetrics: m,
      targetMetrics: m,
      address: { row: 0, column: 0 },
      createId: () => `copy-${++id}`,
    });
    const connection = resolveSheetShapeConnections(plan.roots, m).getConnector("copy-2")!;
    expect(connection.begin).toMatchObject({ kind: "site", targetId: "copy-1" });
    expect(connection.end).toMatchObject({ kind: "free" });
  });

  test("colliding factories reject without mutating either forest or copied snapshot", () => {
    const root = group();
    const m = metrics();
    const selection = captureShapeClipboardSelection([root, shape("reserved")], [["outer"]], m);
    const before = structuredClone(selection);
    expect(() =>
      planShapeClipboardPaste({
        selection,
        mode: "copy",
        targetForest: [],
        sourceMetrics: m,
        targetMetrics: m,
        address: { row: 0, column: 0 },
        createId: () => "reserved",
      }),
    ).toThrow("collision");
    expect(selection).toEqual(before);
    const getter = vi.fn(() => 0);
    const address = { row: 0, column: 0 };
    Object.defineProperty(address, "row", { get: getter });
    expect(() => placeShapeClipboardRoots(selection.roots, m, m, address)).toThrow(
      "invalid-placement",
    );
    expect(getter).not.toHaveBeenCalled();
  });
});
