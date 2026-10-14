import { effectScope, ref, shallowRef } from "vue";
import { afterEach, expect, test } from "vitest";
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
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  isFramedEquationDrawing,
  type SheetFramedEquationDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import { useEquationEditSession } from "../../../../modules/sheet-drawings/equation/useEquationEditSession";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
function fixture(structured = true) {
  const workbook = createWorkbook({ id: "framed-math", sheetId: "math" });
  const sheet = getActiveSheet(workbook);
  const document: EquationDocument = {
    kind: "equation-document-v1",
    body: { id: "body", kind: "sequence", children: [{ id: "x", kind: "text", value: "x" }] },
  };
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = createGraphicDrawing("equation", "equation", "Equation", { row: 0, column: 0 });
  const root: SheetFramedEquationDrawing = {
    ...appearance,
    kind: "equation",
    text: structured ? serializeEquationDocument(document) : "  x + 1  ",
    ...(structured ? { equationDocument: document } : {}),
    hidden: true,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0.125 }, row: { index: 1, offset: 0.25 } },
        end: { column: { index: 0, offset: 0.375 }, row: { index: 1, offset: 0.75 } },
      },
    },
    shapeProperties: { locked: false, printObject: false, altTitle: "Math", lockAspectRatio: true },
  };
  sheet.hiddenRows = new Set([1]);
  sheet.drawings = [root];
  const session = createWorkbookSession({ workbook, idFactory: () => "command" });
  const revision = ref(0),
    generation = ref(0),
    active = shallowRef(sheet),
    busy = ref(false);
  const metrics = shallowRef<PictureSheetMetrics | undefined>(createPictureSheetMetrics(sheet));
  const scope = effectScope();
  scopes.push(scope);
  const edit = scope.run(() =>
    useEquationEditSession({
      getWorkbook: () => session.workbook,
      getSheet: () => active.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getAddress: () => ({ row: 0, column: 0 }),
      getMetrics: () => metrics.value,
      isBusy: () => busy.value,
      flush: () => true,
      execute: (command) => {
        const result = executeWorkbookCommand(session, command);
        revision.value++;
        return result;
      },
      name: () => "Equation",
    }),
  )!;
  return { root, sheet, session, edit, metrics, revision, generation, active, busy };
}

test("canonical Equation owns the real root, keeps subpixel/collapsed placement and metadata through private and document history", () => {
  const f = fixture();
  expect(f.edit.begin(f.root)).toBe(true);
  const state = f.edit.snapshot.value!,
    cb = f.edit.callbacks.value!;
  expect(state.source).toBe(f.root);
  expect(state.view).not.toBe(f.root);
  expect(state.view).toMatchObject({ width: 0.25, height: 0 });
  expect(state.view).not.toHaveProperty("shapeFrame");
  expect(state.view).not.toHaveProperty("shapeProperties");
  expect(
    cb.action({
      type: "replace-text",
      selection: { slotId: "body", start: 1, end: 1 },
      text: "+y",
    }),
  ).toBe(true);
  expect(cb.format("fontSize", 28)).toBe(true);
  expect(cb.format("color", "#123456")).toBe(true);
  expect(f.sheet.drawings![0]).toBe(f.root);
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(cb.history("undo")).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("x");
  expect(cb.history("redo")).toBe(true);
  expect(cb.commit()).toBe(true);
  const changed = f.sheet.drawings![0]!;
  expect(isFramedEquationDrawing(changed)).toBe(true);
  expect(changed).toMatchObject({
    text: "x+y",
    fontSize: 28,
    color: "#123456",
    hidden: true,
    shapeFrame: f.root.shapeFrame,
    shapeProperties: f.root.shapeProperties,
  });
  expect(changed).not.toHaveProperty("anchor");
  expect(changed).not.toHaveProperty("width");
  expect(f.session.history.undoStack).toHaveLength(1);
  const snapshot = serializeWorkbook(f.session.workbook);
  expect(snapshot.version).toBe(76);
  expect(getActiveSheet(deserializeWorkbook(snapshot)).drawings).toEqual(f.sheet.drawings);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(f.sheet.drawings).toEqual([f.root]);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(f.sheet.drawings).toEqual([changed]);
  expect(f.edit.begin(changed as SheetFramedEquationDrawing)).toBe(false);
  const reopened = f.sheet.drawings![0] as SheetFramedEquationDrawing;
  expect(f.edit.begin(reopened)).toBe(true);
  expect(f.edit.snapshot.value!.source).toBe(reopened);
  expect(f.edit.snapshot.value!.sourceText).toBe("x+y");
});

test("canonical opaque LaTeX stays exact and raw on no-op finish and deliberate source edits", () => {
  const f = fixture(false),
    before = serializeWorkbook(f.session.workbook);
  expect(f.edit.begin(f.root)).toBe(true);
  expect(f.edit.snapshot.value!.mode).toBe("latex");
  expect(f.edit.callbacks.value!.commit()).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(f.edit.begin(f.root)).toBe(true);
  expect(f.edit.callbacks.value!.source("  y + 2  ")).toBe(true);
  expect(f.edit.callbacks.value!.commit()).toBe(true);
  expect(f.sheet.drawings![0]).toMatchObject({
    text: "  y + 2  ",
    hidden: true,
    shapeFrame: f.root.shapeFrame,
    shapeProperties: f.root.shapeProperties,
  });
  expect(f.sheet.drawings![0]).not.toHaveProperty("equationDocument");
});

test("only explicit source conversion removes the canonical tree; IME and stale callbacks cannot commit", () => {
  const f = fixture();
  expect(f.edit.begin(f.root)).toBe(true);
  const cb = f.edit.callbacks.value!;
  expect(cb.composition(true)).toBe(true);
  expect(cb.sourceMode()).toBe(false);
  expect(cb.commit()).toBe(false);
  expect(cb.composition(false)).toBe(true);
  expect(cb.sourceMode()).toBe(true);
  expect(f.sheet.drawings![0]).toHaveProperty("equationDocument");
  expect(cb.confirmSourceMode()).toBe(true);
  expect(cb.reloadStructured()).toBe(true);
  expect(f.edit.snapshot.value!.view).toHaveProperty("equationDocument");
  expect(cb.sourceMode()).toBe(true);
  expect(cb.confirmSourceMode()).toBe(true);
  expect(cb.source("z")).toBe(true);
  expect(cb.commit()).toBe(true);
  expect(f.sheet.drawings![0]).not.toHaveProperty("equationDocument");
  expect(f.sheet.drawings![0]).toMatchObject({
    shapeFrame: f.root.shapeFrame,
    shapeProperties: f.root.shapeProperties,
    hidden: true,
  });
  expect(cb.source("stale")).toBe(false);
  expect(cb.commit()).toBe(false);
});

test("canonical Equation rejects missing metrics and disposable views, and protected editing follows root permissions", () => {
  const f = fixture();
  f.metrics.value = undefined;
  expect(f.edit.begin(f.root)).toBe(false);
  f.metrics.value = createPictureSheetMetrics(f.sheet);
  f.sheet.properties.protected = true;
  expect(f.edit.begin(f.root)).toBe(true);
  const cb = f.edit.callbacks.value!,
    view = f.edit.snapshot.value!.view;
  expect(f.edit.begin(view)).toBe(false);
  expect(
    cb.action({ type: "replace-text", selection: { slotId: "body", start: 0, end: 1 }, text: "y" }),
  ).toBe(true);
  expect(cb.commit()).toBe(true);
  const root = f.sheet.drawings![0] as SheetFramedEquationDrawing;
  delete root.shapeProperties!.locked;
  expect(f.edit.begin(root)).toBe(false);
});

test.each(["revision", "generation", "sheet", "identity", "permissions"] as const)(
  "canonical Equation %s invalidates its original callbacks",
  (change) => {
    const f = fixture();
    expect(f.edit.begin(f.root)).toBe(true);
    const cb = f.edit.callbacks.value!;
    if (change === "revision") f.revision.value++;
    else if (change === "generation") f.generation.value++;
    else if (change === "sheet") {
      const other = createSheet("Other", "other");
      insertSheet(f.session.workbook, other);
      f.active.value = other;
    } else if (change === "identity") f.sheet.drawings = [{ ...f.root }];
    else {
      f.sheet.properties.protected = true;
      delete f.root.shapeProperties!.locked;
    }
    expect(cb.isActive()).toBe(false);
    expect(
      cb.action({
        type: "replace-text",
        selection: { slotId: "body", start: 0, end: 1 },
        text: "wrong",
      }),
    ).toBe(false);
    expect(cb.commit()).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
  },
);
