import { describe, expect, test, vi } from "vitest";
import { shallowRef, ref } from "vue";
import {
  createWorkbook,
  getActiveSheet,
  createSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { isShapeGroupDrawing, type ShapeGroupPath } from "@sheetcraft/core/shape-group";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { useShapeObjectControls } from "../../../modules/sheet-drawings/useShapeObjectControls";
import { framedShape } from "./framed-shape-fixture";

function fixture(owned = false) {
  const workbook = createWorkbook({ id: "controls", sheetId: "controls-sheet" }),
    sheet = getActiveSheet(workbook),
    a = framedShape(),
    b = framedShape();
  a.id = "a";
  a.shapeGeometry = { preset: "rightArrow" };
  a.rotation = 37;
  b.id = "b";
  b.shapeGeometry = { preset: "ellipse" };
  b.shapeFrame.anchor = { mode: "fixed", x: 400, y: 24, size: { width: 80, height: 80 } };
  const m = createPictureSheetMetrics(sheet);
  sheet.drawings = owned
    ? groupShapeRoots([a, b], ["a", "b"], { id: "g", name: "Group" }, m)
    : [a, b];
  const core = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() }),
    revision = ref(0),
    generation = ref(1),
    busy = ref(false),
    currentSheet = shallowRef(sheet),
    metrics = shallowRef(m),
    paths = shallowRef<readonly ShapeGroupPath[]>(owned ? [["g", "a"]] : [["a"]]);
  const flush = vi.fn(() => true),
    select = vi.fn((next: readonly ShapeGroupPath[]) => {
      paths.value = next;
      return true;
    }),
    format = vi.fn(() => true);
  const drawings = useDrawingActions({
    getWorkbook: () => core.workbook,
    getSheet: () => currentSheet.value,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getMetrics: () => metrics.value,
    getAddress: () => ({ row: 0, column: 0 }),
    isBusy: () => busy.value,
    flush: () => true,
    name: () => "Shape",
    execute: (command) => {
      executeWorkbookCommand(core, command);
      revision.value++;
    },
  });
  const controller = useShapeObjectControls({
    getWorkbook: () => core.workbook,
    getSheet: () => currentSheet.value,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getMetrics: () => metrics.value,
    getSelection: () => paths.value,
    isBusy: () => busy.value,
    flush,
    select,
    format,
    replaceCollection: drawings.replaceCollection,
  });
  const state = () => controller.snapshot.value!;
  const target = () => {
    const root = currentSheet.value.drawings![0]!;
    return isShapeGroupDrawing(root)
      ? root.members.find((node) => node.id === "a")!
      : currentSheet.value.drawings!.find((node) => node.id === "a")!;
  };
  return {
    core,
    sheet,
    revision,
    generation,
    busy,
    metrics,
    currentSheet,
    paths,
    flush,
    select,
    format,
    controller,
    state,
    target,
  };
}
describe("shape object controls exact owner session", () => {
  test.each([false, true])(
    "flip and rotate use real atomic commands; Undo/Redo retain exact frame and ownership (%s)",
    (owned) => {
      const f = fixture(owned),
        before = serializeWorkbook(f.core.workbook),
        initial = f.target();
      expect(f.state().actionHandler("flip-horizontal")).toBe(true);
      const node = f.target();
      if (node.kind !== "shape") throw Error("Expected shape");
      expect(node.shapeFlipX).toBe(true);
      expect(node.rotation).toBe(initial.rotation);
      expect(f.core.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.core.workbook);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      f.revision.value++;
      expect(serializeWorkbook(f.core.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.core)).toBe(true);
      f.revision.value++;
      expect(serializeWorkbook(f.core.workbook)).toEqual(after);
      expect(f.state().actionHandler("rotate-right")).toBe(true);
      expect(f.target().rotation).toBeCloseTo(initial.rotation + 90);
    },
  );
  test("pane lists frontmost roots and owned rows; select and rename keep canonical identity", () => {
    const f = fixture(true);
    expect(f.state().rows.map((row) => row.path)).toEqual([["g"], ["g", "b"], ["g", "a"]]);
    expect(f.state().selectHandler(["g", "b"], false)).toBe(true);
    expect(f.paths.value).toEqual([["g", "b"]]);
    const before = serializeWorkbook(f.core.workbook);
    expect(f.state().renameHandler(["g", "b"], "Renamed child")).toBe(true);
    expect(f.state().rows.find((row) => row.path.at(-1) === "b")?.name).toBe("Renamed child");
    expect(f.core.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(f.core);
    f.revision.value++;
    expect(serializeWorkbook(f.core.workbook)).toEqual(before);
  });
  test("selection ordering no-op does not create a history entry", () => {
    const f = fixture(),
      before = serializeWorkbook(f.core.workbook);
    expect(f.state().actionHandler("send-back")).toBe(true);
    expect(f.core.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.core.workbook)).toEqual(before);
    expect(f.state().actionHandler("bring-front")).toBe(true);
    expect(f.sheet.drawings!.map((node) => node.id)).toEqual(["b", "a"]);
    expect(f.core.history.undoStack).toHaveLength(1);
  });
  test.each([
    "selection",
    "revision",
    "generation",
    "metrics",
    "sheet",
    "mutated-source",
    "busy",
  ] as const)(
    "retired callbacks reject changed %s and leave source/history untouched",
    (change) => {
      const f = fixture(),
        old = f.state();
      if (change === "selection") f.paths.value = [["b"]];
      if (change === "revision") f.revision.value++;
      if (change === "generation") f.generation.value++;
      if (change === "metrics") f.metrics.value = createPictureSheetMetrics(f.sheet);
      if (change === "sheet") {
        const other = createSheet("Other", "other");
        insertSheet(f.core.workbook, other);
        f.currentSheet.value = other;
      }
      if (change === "mutated-source") f.sheet.drawings![0]!.name = "Same revision replacement";
      if (change === "busy") f.busy.value = true;
      const before = serializeWorkbook(f.core.workbook);
      expect(old.actionHandler("bring-front")).toBe(false);
      expect(old.renameHandler(["a"], "wrong")).toBe(false);
      expect(old.selectHandler(["b"], false)).toBe(false);
      expect(old.formatHandler()).toBe(false);
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.core.workbook)).toEqual(before);
    },
  );
  test("failed flush preserves draft/source/history and does not invoke selection or format", () => {
    const f = fixture(),
      state = f.state(),
      before = serializeWorkbook(f.core.workbook);
    f.flush.mockReturnValue(false);
    expect(state.actionHandler("flip-vertical")).toBe(false);
    expect(state.renameHandler(["a"], "Name")).toBe(false);
    expect(state.selectHandler(["b"], false)).toBe(false);
    expect(state.formatHandler()).toBe(false);
    expect(f.select).not.toHaveBeenCalled();
    expect(f.format).not.toHaveBeenCalled();
    expect(f.core.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.core.workbook)).toEqual(before);
  });
  test("a successful flush which replaces the source invalidates the old action instead of applying it", () => {
    const f = fixture(),
      old = f.state();
    f.flush.mockImplementation(() => {
      f.sheet.drawings = f.sheet.drawings!.map((node) => ({
        ...node,
        name: node.name + " updated",
      }));
      return true;
    });
    expect(old.actionHandler("flip-horizontal")).toBe(false);
    expect(f.core.history.undoStack).toHaveLength(0);
    expect(f.target()).not.toHaveProperty("shapeFlipX");
  });
  test("protected locked objects are disabled; incoming names cannot grant permission", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    expect(f.state().canFlip).toBe(false);
    expect(f.state().disabled).toBe(true);
    const before = serializeWorkbook(f.core.workbook);
    expect(f.state().renameHandler(["a"], "allowed?")).toBe(false);
    expect(f.core.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.core.workbook)).toEqual(before);
  });
  test("protected unlocked source remains editable under existing object permissions", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    const a = f.sheet.drawings![0]!;
    if (a.kind !== "shape" || !("shapeFrame" in a)) throw Error("Expected framed shape");
    a.shapeProperties = { locked: false };
    expect(f.state().canFlip).toBe(true);
    expect(f.state().actionHandler("flip-horizontal")).toBe(true);
    expect(f.core.history.undoStack).toHaveLength(1);
  });
  test("empty/no-selection pane remains closable and invalid rename/paths never write", () => {
    const f = fixture();
    f.paths.value = [];
    expect(f.state().disabled).toBe(true);
    expect(f.state().selectionPaneHandler()).toBe(true);
    expect(f.controller.paneVisible.value).toBe(true);
    expect(f.state().closeHandler()).toBe(true);
    expect(f.state().renameHandler(["a"], " ")).toBe(false);
    expect(f.state().renameHandler(["a"], "x".repeat(201))).toBe(false);
    expect(f.state().renameHandler(["missing"], "X")).toBe(false);
    expect(f.core.history.undoStack).toHaveLength(0);
  });
});
