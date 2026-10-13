import { describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { planShapeConnectorBodyTranslation } from "@sheetcraft/core/shape-connector-editing";
import { normalizeSheetDrawings, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { prepareShapeTextUpdate } from "../../../modules/sheet-drawings/prepare-shape-text-update";
import { framedShape } from "./framed-shape-fixture";

function fixture(group = false) {
  const workbook = createWorkbook({ id: "connector-preflight", sheetId: "s" });
  const sheet = getActiveSheet(workbook),
    target = framedShape(),
    connector = framedShape();
  target.id = "target";
  target.text = connector.text = "";
  target.rotation = connector.rotation = 0;
  target.shapeGeometry = { preset: "rect" };
  connector.id = "connector";
  connector.shapeGeometry = { preset: "bentConnector3" };
  connector.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
    end: { kind: "free", xRatio: 1, yRatio: 1 },
  };
  sheet.drawings = normalizeSheetDrawings([target, connector]);
  const metrics = createPictureSheetMetrics(sheet);
  if (group)
    sheet.drawings = groupShapeRoots(
      sheet.drawings,
      ["connector", "target"],
      { id: "g", name: "Group" },
      metrics,
    );
  return { workbook, sheet, metrics };
}
describe("connector command text preparation", () => {
  test.each([false, true])(
    "prepares exact body-detachment data without projecting a carrier as text (group=%s)",
    (group) => {
      const f = fixture(group),
        before = f.sheet.drawings!;
      const next = planShapeConnectorBodyTranslation(
        before,
        { connectorId: "connector", path: group ? ["g", "connector"] : ["connector"] },
        { x: 30, y: 20 },
        f.metrics,
      );
      const source = before.find((r) => r.id === (group ? "g" : "connector"))!;
      const candidate = next.find((r) => r.id === source.id)!;
      expect(
        prepareShapeTextUpdate(candidate, source, undefined, undefined, undefined, f.metrics, {
          candidateForest: next,
          sourceForest: before,
          revision: 1,
        }),
      ).toBe(candidate);
    },
  );
});

test("final prepared forest validates actual routes before invoking the command port", () => {
  const f = fixture(),
    before = serializeWorkbook(f.workbook);
  const session = createWorkbookSession({
    workbook: f.workbook,
    idFactory: createSequentialIdFactory(),
  });
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const prepareDrawing = vi.fn(
    (
      drawing: SheetDrawing,
      _owner?: SheetDrawing,
      _forest?: readonly SheetDrawing[],
    ): SheetDrawing => {
      if (drawing.kind !== "shape") throw new Error("Expected target");
      return {
        ...drawing,
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: { mode: "fixed", x: 20_000, y: 100, size: { width: 80, height: 50 } },
        },
      };
    },
  );
  const scope = effectScope();
  const actions = scope.run(() =>
    useDrawingActions({
      getWorkbook: () => f.workbook,
      getSheet: () => f.sheet,
      getMetrics: () => f.metrics,
      getRevision: () => 0,
      getGeneration: () => 0,
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => false,
      flush: () => true,
      name: (kind) => kind,
      execute,
      prepareDrawing,
    }),
  )!;
  const owner = f.sheet.drawings![0]!;
  expect(actions.update({ ...owner, name: "Changed" }, owner)).toBe(false);
  expect(prepareDrawing).toHaveBeenCalledOnce();
  expect(prepareDrawing.mock.calls[0]![2]).toEqual(
    f.sheet.drawings!.map((drawing) =>
      drawing.id === owner.id ? { ...owner, name: "Changed" } : drawing,
    ),
  );
  expect(execute).not.toHaveBeenCalled();
  expect(session.history.undoStack).toHaveLength(0);
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  scope.stop();
});
test.each([false, true])(
  "new labels are refused but pre-existing anomalous connector text survives unrelated geometry (group=%s)",
  (group) => {
    const f = fixture(group),
      root = f.sheet.drawings!.find((drawing) => drawing.id === (group ? "g" : "connector"))!;
    const candidate = structuredClone(root);
    const leaf =
      candidate.kind === "shapeGroup"
        ? candidate.members.find((node) => node.id === "connector")!
        : candidate;
    if (leaf.kind !== "shape") throw Error("Expected connector");
    leaf.text = "New label";
    expect(() =>
      prepareShapeTextUpdate(candidate, root, undefined, undefined, undefined, f.metrics, {
        candidateForest: f.sheet.drawings!.map((node) => (node.id === root.id ? candidate : node)),
        sourceForest: f.sheet.drawings!,
        revision: 0,
      }),
    ).toThrow(/Connector text editing/);
    const oldLeaf =
      root.kind === "shapeGroup" ? root.members.find((node) => node.id === "connector")! : root;
    if (oldLeaf.kind !== "shape") throw Error("Expected source connector");
    oldLeaf.text = "New label";
    expect(
      prepareShapeTextUpdate(candidate, root, undefined, undefined, undefined, f.metrics, {
        candidateForest: f.sheet.drawings!.map((node) => (node.id === root.id ? candidate : node)),
        sourceForest: f.sheet.drawings!,
        revision: 0,
      }),
    ).toBe(candidate);
  },
);

test("connector-free root Delete keeps the legacy collection budget and exact Undo", () => {
  const f = fixture();
  const base = f.sheet.drawings![0]!;
  f.sheet.drawings = Array.from({ length: 10_001 }, (_, index) => ({
    ...base,
    id: `old:${index}`,
  }));
  const before = serializeWorkbook(f.workbook);
  const session = createWorkbookSession({
    workbook: f.workbook,
    idFactory: createSequentialIdFactory(),
  });
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const scope = effectScope();
  const actions = scope.run(() =>
    useDrawingActions({
      getWorkbook: () => f.workbook,
      getSheet: () => f.sheet,
      getMetrics: () => f.metrics,
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => false,
      flush: () => true,
      name: (kind) => kind,
      execute,
    }),
  )!;
  expect(actions.remove("old:10000")).toBe(true);
  expect(f.sheet.drawings).toHaveLength(10_000);
  expect(execute).toHaveBeenCalledOnce();
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(serializeWorkbook(f.workbook)).toEqual(before);
  scope.stop();
});
