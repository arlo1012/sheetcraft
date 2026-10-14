// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import { createWorkbook, getActiveSheet, createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
} from "../../../../modules/sheet-drawings/resolved-shape-drawing";

function fixture() {
  const mathDocument: EquationDocument = {
    kind: "equation-document-v1",
    body: {
      kind: "sequence",
      id: "body",
      children: [
        {
          kind: "fraction",
          id: "fraction",
          style: "stacked",
          numerator: {
            kind: "sequence",
            id: "num",
            children: [{ kind: "text", id: "a", value: "a" }],
          },
          denominator: {
            kind: "sequence",
            id: "den",
            children: [{ kind: "text", id: "b", value: "b" }],
          },
        },
      ],
    },
  };
  const drawing = {
    ...createGraphicDrawing("math", "equation", "Equation", { row: 2, column: 1 }),
    text: serializeEquationDocument(mathDocument),
    equationDocument: mathDocument,
  };
  const metrics = createPictureSheetMetrics(createSheet("Sheet", "sheet"));
  return { drawing, metrics, resolved: resolveShapeDrawing(drawing, metrics) };
}
describe("Equation geometry preserves its source", () => {
  test("move resize and rotate a structured root without losing its source", () => {
    const { drawing, metrics, resolved } = fixture();
    const before = JSON.stringify(drawing);
    const next = updateResolvedShapeDrawing(
      resolved,
      { ...resolved.view, offsetX: 42, offsetY: 31, width: 340, height: 150, rotation: 37 },
      metrics,
    );
    expect(next).toMatchObject({
      kind: "equation",
      equationDocument: drawing.equationDocument,
      text: drawing.text,
      offsetX: 42,
      width: 340,
      rotation: 37,
    });
    expect(JSON.stringify(drawing)).toBe(before);
  });
  test("a geometry view cannot remove the structured source", () => {
    const { metrics, resolved } = fixture();
    const { equationDocument: _source, ...next } = resolved.view as ReturnType<
      typeof fixture
    >["drawing"];
    expect(() => updateResolvedShapeDrawing(resolved, next, metrics)).toThrow(/equation.*source/i);
  });
  test("a geometry view cannot edit raw source or replace the mathematical tree", () => {
    const { drawing, metrics, resolved } = fixture();
    expect(() =>
      updateResolvedShapeDrawing(resolved, { ...drawing, text: "x" }, metrics),
    ).toThrow();
    const raw = createGraphicDrawing("raw", "equation", "Raw", { row: 0, column: 0 });
    const rawResolved = resolveShapeDrawing(raw, metrics);
    expect(() => updateResolvedShapeDrawing(rawResolved, { ...raw, text: "y" }, metrics)).toThrow(
      /equation.*source/i,
    );
    expect(
      updateResolvedShapeDrawing(rawResolved, { ...raw, rotation: 90 }, metrics),
    ).toMatchObject({ text: raw.text, rotation: 90 });
  });
});

describe("generic Equation collection ownership", () => {
  test.each(["proposal", "preparation"])(
    "rejects %s source downgrade before any history or source write",
    (stage) => {
      const { drawing } = fixture();
      const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      sheet.drawings = [drawing];
      const core = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
      const before = JSON.stringify(sheet.drawings);
      const { equationDocument: _source, ...raw } = drawing;
      const actions = useDrawingActions({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getAddress: () => ({ row: 0, column: 0 }),
        getMetrics: () => createPictureSheetMetrics(sheet),
        flush: () => true,
        isBusy: () => false,
        name: (k) => k,
        execute: (command) => executeWorkbookCommand(core, command),
        prepareDrawing: (next) => (stage === "preparation" ? raw : next),
      });
      expect(
        actions.update(stage === "proposal" ? raw : { ...drawing, name: "Moved" }, drawing),
      ).toBe(false);
      expect(JSON.stringify(sheet.drawings)).toBe(before);
      expect(core.history.undoStack).toHaveLength(0);
    },
  );
});
