// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  groupShapeRoots,
  isShapeGroupEligibleRoot,
  resolveShapeRootLayout,
} from "@sheetcraft/core/shape-group-planning";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createModernWordArtDrawing } from "../../../../modules/sheet-drawings/modern-wordart-insertion";
import {
  prepareShapeTextUpdate,
  type ShapeTextPreparationMode,
} from "../../../../modules/sheet-drawings/prepare-shape-text-update";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import { useShapeClipboard } from "../../../../modules/sheet-drawings/useShapeClipboard";
import { captureShapeClipboardSelection } from "../../../../modules/sheet-drawings/shape-clipboard-planning";
import { preflightShapeTextGlyphBudgets } from "../../../../modules/sheet-drawings/shape-text-paint";
import type { DrawingShapeTextRuntimeOptions } from "../../../../modules/sheet-drawings/shape-text-runtime";
import { texture } from "./fixture";

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
function fixture() {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook),
    metrics = createPictureSheetMetrics(sheet);
  const leaves = ["first", "second"].map((id, index) =>
    prepareShapeTextUpdate(
      createModernWordArtDrawing({
        id,
        name: id,
        placeholder: `${id} Art`,
        address: { row: 1, column: 1 + index * 3 },
        metrics,
        choice: "accent3-solid",
      }),
      undefined,
      undefined,
      measurement,
      undefined,
      metrics,
    ),
  );
  const grouped = groupShapeRoots(
    leaves,
    ["first", "second"],
    { id: "group", name: "Group" },
    metrics,
  )[0]!;
  if (grouped.kind !== "shapeGroup") throw Error("Expected group");
  const original = resolveShapeRootLayout(grouped, metrics).rect;
  grouped.shapeFrame = {
    kind: "shape-frame-v1",
    anchor: {
      mode: "fixed",
      x: original.x,
      y: original.y,
      size: { width: original.width * 2, height: original.height * 2 },
    },
  };
  sheet.drawings = [grouped];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let revision = 0,
    nextId = 0;
  const proof = vi.fn(preflightShapeTextGlyphBudgets);
  const prepareDrawing = vi.fn(
    (
      next: SheetDrawing,
      owner?: SheetDrawing,
      forest?: readonly SheetDrawing[],
      mode?: ShapeTextPreparationMode,
    ) =>
      prepareShapeTextUpdate(
        next,
        owner,
        undefined,
        measurement,
        { preflight: proof },
        metrics,
        { candidateForest: forest ?? [next], sourceForest: sheet.drawings ?? [], revision },
        mode,
      ),
  );
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const result = executeWorkbookCommand(session, command);
    if (result) revision++;
    return result;
  });
  const options = {
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => 0,
    getRevision: () => revision,
    getMetrics: () => metrics,
    getAddress: () => ({ row: 5, column: 5 }),
    isBusy: () => false,
    flush: () => true,
  };
  const actions = useDrawingActions({ ...options, name: (kind) => kind, execute, prepareDrawing });
  const clipboard = useShapeClipboard({
    ...options,
    getSelectedPaths: () => [["group", "first"]],
    getTargetAddress: () => ({ row: 5, column: 5 }),
    createId: () => `fresh-${++nextId}`,
    replaceCollection: actions.replaceCollectionPreservingGeometry,
  });
  return { workbook, sheet, metrics, session, proof, prepareDrawing, execute, actions, clipboard };
}
function appearance(drawing: SheetDrawing) {
  if (drawing.kind === "shapeGroup") throw Error("Expected leaf");
  const { id: _id, name: _name, ...rest } = drawing;
  const { shapeFrame: _frame, ...value } = rest as typeof rest & { shapeFrame?: unknown };
  return value;
}
function rootLayout(drawing: SheetDrawing, metrics: ReturnType<typeof createPictureSheetMetrics>) {
  if (!isShapeGroupEligibleRoot(drawing)) throw Error("Expected eligible root");
  return resolveShapeRootLayout(drawing, metrics);
}
function expectCapturedLeaf(
  actual: SheetDrawing,
  captured: SheetDrawing,
  f: ReturnType<typeof fixture>,
) {
  const actualRect = rootLayout(actual, f.metrics).rect,
    capturedRect = rootLayout(captured, f.metrics).rect;
  expect(actualRect.width).toBeCloseTo(capturedRect.width, 8);
  expect(actualRect.height).toBeCloseTo(capturedRect.height, 8);
  expect(appearance(actual)).toEqual(appearance(captured));
}
function expectAtomicHistory(f: ReturnType<typeof fixture>, before: SheetDrawing[]) {
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.session.history.undoStack).toHaveLength(1);
  const after = structuredClone(f.sheet.drawings!);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(f.sheet.drawings).toEqual(before);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(f.sheet.drawings).toEqual(after);
}
describe("real preparation of captured clipboard geometry", () => {
  test("copying a 2x-scaled owned WordArt leaf preserves dimensions, appearance and AutoFit", () => {
    const f = fixture(),
      before = structuredClone(f.sheet.drawings!),
      captured = captureShapeClipboardSelection(f.sheet.drawings!, [["group", "first"]], f.metrics)
        .roots[0]!;
    expect(f.clipboard.copy()).toBe(true);
    expect(f.clipboard.paste()).toBe(true);
    expectCapturedLeaf(f.sheet.drawings![1]!, captured, f);
    expect(f.sheet.drawings![0]).toEqual(before[0]);
    expect(f.proof).toHaveBeenCalledOnce();
    expect(f.proof.mock.calls[0]![0].layout.runs.length).toBeGreaterThan(0);
    expectAtomicHistory(f, before);
  });
  test("cutting one leaf releases the uncut 2x-scaled sibling without refitting either leaf", () => {
    const f = fixture(),
      before = structuredClone(f.sheet.drawings!),
      copied = captureShapeClipboardSelection(f.sheet.drawings!, [["group", "first"]], f.metrics)
        .roots[0]!,
      sibling = captureShapeClipboardSelection(f.sheet.drawings!, [["group", "second"]], f.metrics)
        .roots[0]!;
    expect(f.clipboard.cut()).toBe(true);
    expect(f.clipboard.paste()).toBe(true);
    expect(f.sheet.drawings!.map((root) => root.id)).toEqual(["second", "fresh-1"]);
    expectCapturedLeaf(f.sheet.drawings![0]!, sibling, f);
    expect(rootLayout(f.sheet.drawings![0]!, f.metrics).rect).toEqual(
      rootLayout(sibling, f.metrics).rect,
    );
    expectCapturedLeaf(f.sheet.drawings![1]!, copied, f);
    expect(f.proof).toHaveBeenCalledTimes(2);
    expectAtomicHistory(f, before);
  });
  test.each(["font", "paint"])(
    "a late %s resource failure preserves the cut source, sibling, clipboard and history",
    (resource) => {
      const f = fixture(),
        group = f.sheet.drawings![0]!;
      if (group.kind !== "shapeGroup") throw Error("Expected group");
      const first = group.members[0]!;
      if (first.kind === "shapeGroup") throw Error("Expected leaf");
      if (resource === "font") first.shapeText!.fontFamily = `SheetcraftLocal_${"0".repeat(64)}`;
      else first.shapeText!.style!.fill = { kind: "value", value: texture("unavailable-texture") };
      const before = structuredClone(f.sheet.drawings!);
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      expect(f.clipboard.paste()).toBe(false);
      expect(f.sheet.drawings).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.proof).toHaveBeenCalledTimes(1);
      expect(f.prepareDrawing).toHaveBeenCalledTimes(2);
      expect(f.prepareDrawing.mock.calls.every((call) => call[3] === "preserve-geometry")).toBe(
        true,
      );
      expect(f.clipboard.getIdentity()).toEqual(identity);
    },
  );
  test("explicit preservation does not interpret a changed captured frame as manual AutoFit removal", () => {
    const f = fixture(),
      source = captureShapeClipboardSelection(f.sheet.drawings!, [["group", "first"]], f.metrics)
        .roots[0]!;
    if (source.kind === "shapeGroup" || !("shapeFrame" in source)) throw Error("Expected leaf");
    const rect = resolveShapeRootLayout(source, f.metrics).rect,
      candidate: SheetDrawing = {
        ...source,
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: {
            mode: "fixed",
            x: rect.x,
            y: rect.y,
            size: { width: rect.width * 1.5, height: rect.height * 1.5 },
          },
        },
      };
    expect(
      prepareShapeTextUpdate(
        candidate,
        source,
        undefined,
        measurement,
        { preflight: f.proof },
        f.metrics,
        undefined,
        "preserve-geometry",
      ),
    ).toBe(candidate);
    expect(candidate.shapeText!.layout.autoFit).toBe("resize-shape");
    expect(f.proof).toHaveBeenCalledOnce();
    const edited = prepareShapeTextUpdate(
      candidate,
      source,
      undefined,
      measurement,
      undefined,
      f.metrics,
    );
    if (edited.kind !== "shape") throw Error("Expected shape leaf");
    expect(edited.shapeText!.layout.autoFit).toBe("none");
  });
});
