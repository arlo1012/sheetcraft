// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  groupShapeRoots,
  isShapeGroupEligibleRoot,
  normalizeShapeDrawingForest,
} from "@sheetcraft/core/shape-group-planning";
import {
  normalizeShapeGroup,
  findShapeGroupNode,
  isSheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheet } from "@sheetcraft/core/workbook";
import {
  assertDrawingClipboardForestLayouts,
  isDrawingClipboardEligibleRoot,
  resolveDrawingClipboardRootLayout,
} from "../../../../modules/sheet-drawings/drawing-clipboard-eligibility";
import {
  captureShapeClipboardSelection,
  planCrossSheetShapeClipboardCut,
  planShapeClipboardPaste,
  placeShapeClipboardRoots,
} from "../../../../modules/sheet-drawings/shape-clipboard-planning";
import { group, shape } from "../shape-clipboard/fixture";
import { equationDrawing, rawEquationSource } from "./clipboard-fixture";

function metrics() {
  return createPictureSheetMetrics(createSheet("Sheet", "sheet"));
}

describe("Equation clipboard source planning", () => {
  test.each([true, false])(
    "standalone admission and explicit grouping preserve the %s structured source",
    (structured) => {
      const equation = equationDrawing("math", structured);
      const m = metrics();
      const before = JSON.stringify(equation);
      expect(isDrawingClipboardEligibleRoot(equation)).toBe(true);
      expect(isShapeGroupEligibleRoot(equation)).toBe(true);
      const captured = captureShapeClipboardSelection([equation], [[equation.id]], m);
      expect(captured.selectedPaths).toEqual([["math"]]);
      expect(captured.sourceRootIds).toEqual(["math"]);
      expect(captured.roots).toEqual(normalizeShapeDrawingForest([equation]));
      expect(captured.roots[0]).not.toBe(equation);
      expect(captured.sourceForest[0]).not.toBe(captured.roots[0]);
      const grouped = groupShapeRoots(
        [equation, shape()],
        [equation.id, "shape"],
        { id: "group", name: "Group" },
        m,
      )[0]!;
      if (grouped.kind !== "shapeGroup") throw new Error("Expected genuine group.");
      const math = findShapeGroupNode(grouped, [grouped.id, equation.id])!.node;
      expect(isSheetGroupedEquationDrawing(math)).toBe(true);
      if (math.kind !== "equation") throw new Error("Expected genuine math member.");
      expect(math.text).toBe(equation.text);
      expect(math.equationDocument).toEqual(equation.equationDocument);
      expect(JSON.stringify(equation)).toBe(before);
    },
  );

  test("Equation document node IDs stay opaque to drawing ownership paths", () => {
    const equation = equationDrawing();
    expect(() =>
      captureShapeClipboardSelection([equation], [["math", "fraction"]], metrics()),
    ).toThrow("invalid-selection");
    const {
      anchor: _anchor,
      offsetX: _x,
      offsetY: _y,
      width: _width,
      height: _height,
      ...appearance
    } = equation;
    const framed = normalizeSheetDrawing({ ...appearance, shapeFrame: shape().shapeFrame });
    expect(framed.kind).toBe("equation");
    if (framed.kind !== "equation") throw new Error("Expected math root.");
    expect(framed.equationDocument).toEqual(equation.equationDocument);
    const owner = group();
    const first = owner.members[0],
      second = owner.members[1];
    if (!first || !second) throw new Error("Expected two group members.");
    owner.members = [
      {
        ...appearance,
        kind: "equation",
        groupFrame: first.groupFrame,
      },
      second,
    ];
    const normalized = normalizeShapeGroup(owner);
    const math = findShapeGroupNode(normalized, [owner.id, equation.id])!.node;
    expect(math.kind).toBe("equation");
    expect(() =>
      captureShapeClipboardSelection([normalized], [[owner.id, "fraction"]], metrics()),
    ).toThrow("invalid-selection");
    const invalid = { ...owner, members: [{ ...owner.members[0]!, shapeStyle: {} }, second] };
    expect(() => normalizeShapeDrawingForest([invalid])).toThrow();
  });

  test.each([true, false])(
    "copy cloning and cross-sheet translation preserve %s structured source and legacy geometry",
    (structured) => {
      const source = equationDrawing("math", structured);
      const sibling = equationDrawing("sibling", structured);
      sibling.anchor = { row: 5, column: 4 };
      const m = metrics();
      const target = createSheet("Target", "target");
      target.columnWidths.set(0, 150);
      target.rowHeights.set(0, 75);
      const targetMetrics = createPictureSheetMetrics(target);
      const before = JSON.stringify([source, sibling]);
      const captured = captureShapeClipboardSelection(
        [source, sibling],
        [["sibling"], ["math"]],
        m,
      );
      const originalBoxes = captured.roots.map((root) => {
        if (!isDrawingClipboardEligibleRoot(root)) throw Error("Expected admitted root");
        return resolveDrawingClipboardRootLayout(root, m).rect;
      });
      const createId = vi.fn().mockReturnValueOnce("copy-1").mockReturnValueOnce("copy-2");
      const plan = planShapeClipboardPaste({
        selection: captured,
        mode: "copy",
        targetForest: [],
        sourceMetrics: m,
        targetMetrics,
        address: { row: 1, column: 1 },
        createId,
      });
      expect(createId).toHaveBeenCalledTimes(2);
      expect(plan.roots.map((root) => root.id)).toEqual(["copy-1", "copy-2"]);
      const [first, second] = plan.roots;
      if (first?.kind !== "equation" || second?.kind !== "equation")
        throw Error("Expected equation roots");
      expect(first).toMatchObject({
        anchor: { row: 1, column: 1 },
        offsetX: 0,
        offsetY: 0,
        width: 310,
        height: 140,
        rotation: 37,
        text: source.text,
      });
      expect(first).not.toHaveProperty("shapeFrame");
      expect(first).not.toHaveProperty("groupFrame");
      if (structured) {
        expect(first.equationDocument).toEqual(source.equationDocument);
        expect(first.equationDocument).not.toBe(source.equationDocument);
        expect(first.equationDocument!.body).not.toBe(source.equationDocument!.body);
        expect(first.equationDocument!.body.children[0]).not.toBe(
          source.equationDocument!.body.children[0],
        );
        expect(first.equationDocument!.body.children[0]!.id).toBe("fraction");
        first.equationDocument!.body.children = [];
        expect(captured.roots[0]).toMatchObject({ equationDocument: source.equationDocument });
      } else {
        expect(first.text).toBe(rawEquationSource);
        expect(first).not.toHaveProperty("equationDocument");
      }
      if (!isDrawingClipboardEligibleRoot(second))
        throw new Error("Expected clipboard Equation root.");
      const secondBox = resolveDrawingClipboardRootLayout(second, targetMetrics).rect;
      expect(secondBox.x - 150).toBe(originalBoxes[1]!.x - originalBoxes[0]!.x);
      expect(secondBox.y - 75).toBe(originalBoxes[1]!.y - originalBoxes[0]!.y);
      expect(JSON.stringify([source, sibling])).toBe(before);
    },
  );

  test("cross-sheet Cut is a detached two-forest proposal with no source predeletion", () => {
    const equation = equationDrawing();
    const owner = group();
    const source = [equation, owner];
    const target = [equationDrawing("destination", false)];
    const before = JSON.stringify({ source, target });
    const m = metrics();
    const selection = captureShapeClipboardSelection(source, [["math"]], m);
    const plan = planCrossSheetShapeClipboardCut({
      selection,
      targetForest: target,
      sourceMetrics: m,
      targetMetrics: m,
      address: { row: 3, column: 4 },
      createId: () => "moved",
    });
    expect(plan.sourceForest.map((root) => root.id)).toEqual(["outer"]);
    expect(plan.targetForest.map((root) => root.id)).toEqual(["destination", "moved"]);
    expect(plan.disconnectedEndpoints).toEqual({ moved: 0, remaining: 0, total: 0 });
    expect(JSON.stringify({ source, target })).toBe(before);
    expect(selection.sourceForest.map((root) => root.id)).toEqual(["math", "outer"]);
  });

  test("full source and target forest geometry includes an unselected Equation sibling", () => {
    const equation = equationDrawing();
    const m = metrics();
    const broken = {
      ...m,
      columns: {
        ...m.columns,
        visiblePrefix: (index: number) =>
          index === equation.anchor.column ? Infinity : m.columns.visiblePrefix(index),
      },
    };
    const before = JSON.stringify(equation);
    expect(() => assertDrawingClipboardForestLayouts([equation], broken)).toThrow();
    expect(() =>
      captureShapeClipboardSelection([shape(), equation], [["shape"]], broken),
    ).toThrow();
    const captured = captureShapeClipboardSelection([shape()], [["shape"]], m);
    const createId = vi.fn(() => "new-shape");
    expect(() =>
      planShapeClipboardPaste({
        selection: captured,
        mode: "copy",
        targetForest: [equation],
        sourceMetrics: m,
        targetMetrics: broken,
        address: { row: 0, column: 0 },
        createId,
      }),
    ).toThrow();
    expect(createId).not.toHaveBeenCalled();
    expect(JSON.stringify(equation)).toBe(before);
  });

  test("strict source validation and invalid placement fail without mutation or source coercion", () => {
    const equation = equationDrawing();
    const m = metrics();
    const before = JSON.stringify(equation);
    expect(() =>
      captureShapeClipboardSelection([{ ...equation, text: "changed" }], [["math"]], m),
    ).toThrow(/exactly mirror/);
    const duplicate = structuredClone(equation);
    duplicate.equationDocument!.body.children[0]!.id = "body";
    expect(() => captureShapeClipboardSelection([duplicate], [["math"]], m)).toThrow();
    expect(() => placeShapeClipboardRoots([equation], m, m, { row: -1, column: 0 })).toThrow(
      "invalid-placement",
    );
    expect(() => captureShapeClipboardSelection([equation], [["missing"]], m)).toThrow(
      "invalid-selection",
    );
    expect(JSON.stringify(equation)).toBe(before);
  });
});
