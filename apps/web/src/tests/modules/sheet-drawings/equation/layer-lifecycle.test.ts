import { mount } from "@vue/test-utils";
import { markRaw, nextTick, reactive } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import SheetDrawingLayer from "../../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import { createAppI18n } from "../../../../shared/i18n";

function fixture() {
  const workbook = reactive(createWorkbook({ id: "book", sheetId: "sheet" }));
  const sheet = getActiveSheet(workbook);
  const mathDocument: EquationDocument = {
    kind: "equation-document-v1",
    body: { kind: "sequence", id: "body", children: [{ kind: "text", id: "text", value: "a+b" }] },
  };
  const initial = {
    ...createGraphicDrawing("math", "equation", "Math", { row: 1, column: 1 }),
    text: serializeEquationDocument(mathDocument),
    equationDocument: mathDocument,
  };
  sheet.drawings = [initial];
  const source = sheet.drawings[0]!;
  if (source.kind !== "equation") throw new Error("Expected Equation source.");
  const metrics = markRaw(createPictureSheetMetrics(sheet));
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 0, column: 0 }),
    getMetrics: () => metrics,
    flush: () => true,
    isBusy: () => false,
    name: (kind) => kind,
    execute: (command) => executeWorkbookCommand(session, command),
  });
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({
      rowCount: 50,
      columnCount: 30,
      rowHeight: 24,
      columnWidth: 80,
    }),
    rows: createRowVisibilityIndex({ rowCount: 50, defaultRowHeight: 24 }),
    viewportSize: { width: 800, height: 600 },
  });
  const applyUpdate = vi.fn((next: SheetDrawing, owner: SheetDrawing) =>
    actions.update(next, owner),
  );
  const wrapper = mount(SheetDrawingLayer, {
    attachTo: document.body,
    props: {
      drawings: sheet.drawings,
      sheet,
      metrics,
      layout,
      scale: 1,
      revision: 0,
      selectedDrawingId: source.id,
      readOnly: false,
      applyUpdate,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return { sheet, session, source, wrapper, applyUpdate };
}

describe("Equation root real layer ownership", () => {
  test("keyboard move reaches real Core history and retains the structured source through UndoRedo", async () => {
    const f = fixture();
    try {
      await f.wrapper
        .get('[data-sheet-drawing-id="math"]')
        .trigger("keydown", { key: "ArrowRight" });
      expect(f.applyUpdate).toHaveBeenCalledTimes(1);
      expect(f.applyUpdate.mock.calls[0]?.[1]).toBe(f.source);
      expect(f.applyUpdate.mock.results[0]?.value).toBe(true);
      expect(f.sheet.drawings?.[0]).toMatchObject({
        text: f.source.text,
        equationDocument: f.source.equationDocument,
        offsetX: 9,
      });
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(f.sheet.drawings?.[0]).toEqual(f.source);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(f.sheet.drawings?.[0]).toMatchObject({
        equationDocument: f.source.equationDocument,
        offsetX: 9,
      });
    } finally {
      f.wrapper.unmount();
    }
  });
  test("exposes an Equation clipboard root selection without enabling group geometry", async () => {
    const f = fixture();
    try {
      await nextTick();
      expect(f.wrapper.vm.getObjectSelectionPaths()).toEqual([["math"]]);
      expect(f.wrapper.vm.selectObjectPaths([["math"]])).toBe(true);
      expect(f.wrapper.find("[data-shape-group]").exists()).toBe(false);
    } finally {
      f.wrapper.unmount();
    }
  });
});
