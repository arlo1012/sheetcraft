// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { effectScope, reactive, ref, markRaw } from "vue";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import { createShapeConnectorDrawing } from "../../../modules/sheet-drawings/create-shape-connector";
import { SHAPE_GALLERY, type ShapeLineChoice } from "../../../modules/sheet-drawings/shape-gallery";
import { pickNearestShapeConnectorSite } from "../../../modules/sheet-drawings/shape-connector-site-picking";
import { framedShape } from "./framed-shape-fixture";

const choices = SHAPE_GALLERY.flatMap((g) => g.items).filter(
  (c): c is ShapeLineChoice => c.kind === "line",
);
function fixture() {
  const workbook = reactive(createWorkbook({ id: "workbook", sheetId: "sheet" }));
  const sheet = getActiveSheet(workbook),
    target = framedShape();
  target.id = "target";
  target.text = "";
  target.rotation = 0;
  target.shapeGeometry = { preset: "rect" };
  target.shapeFrame.anchor = { mode: "fixed", x: 40, y: 40, size: { width: 80, height: 60 } };
  sheet.drawings = [target];
  const metrics = markRaw(createPictureSheetMetrics(sheet)),
    revision = ref(0);
  const session = createWorkbookSession({
    workbook,
    idFactory: (prefix) => `${prefix}:connector-fixture-id`,
  });
  const execute = vi.fn((command: WorkbookCommand) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  const actions = scope.run(() =>
    useShapeCreation({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRevision: () => revision.value,
      getAddress: () => ({ row: 0, column: 0 }),
      getMetrics: () => metrics,
      isBusy: () => false,
      flush: () => true,
      execute,
    }),
  )!;
  function draft(choice = choices[0]!) {
    expect(actions.start(choice, false)).toBe(true);
    const request = actions.request.value!;
    const context = resolveSheetShapeConnections(sheet.drawings!, metrics);
    const position = context.targets[0]!.sites[0]!.position;
    const beginSite = pickNearestShapeConnectorSite(context, position, 0)!;
    const value = createShapeConnectorDrawing({
      base: request.base,
      choice,
      metrics,
      forest: sheet.drawings!,
      beginSite,
      start: position,
      end: { x: 240, y: 210 },
    })!;
    return { request, value };
  }
  return { workbook, sheet, target, metrics, revision, session, execute, scope, actions, draft };
}
describe("owner-bound canonical connector transactions", () => {
  test.each(choices)("$tool commits one exact snapshot/history entry", (choice) => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook),
      { request, value } = f.draft(choice);
    expect(f.actions.commit(request, value)).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.actions.request.value).toBeUndefined();
    const after = serializeWorkbook(f.workbook);
    expect(after.version).toBe(63);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    f.scope.stop();
  });
  test("execute false preserves the exact draft request and does not mutate history", () => {
    const f = fixture(),
      { request, value } = f.draft(),
      before = serializeWorkbook(f.workbook);
    f.execute.mockReturnValue(false);
    expect(f.actions.commit(request, value)).toBe(false);
    expect(f.actions.request.value).toBe(request);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(undoWorkbookCommand(f.session)).toBe(false);
    f.scope.stop();
  });
  test("equal-value source identity replacement rejects an old detached request", () => {
    const f = fixture(),
      { request, value } = f.draft();
    f.sheet.drawings![0] = JSON.parse(JSON.stringify(f.sheet.drawings![0]));
    const before = serializeWorkbook(f.workbook);
    expect(f.actions.commit(request, value)).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.request.value).toBe(request);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.scope.stop();
  });
});
