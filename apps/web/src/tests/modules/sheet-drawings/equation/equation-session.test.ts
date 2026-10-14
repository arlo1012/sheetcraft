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
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import { useEquationEditSession } from "../../../../modules/sheet-drawings/equation/useEquationEditSession";
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
const math = (): EquationDocument => ({
  kind: "equation-document-v1",
  body: { id: "body", kind: "sequence", children: [{ id: "x", kind: "text", value: "x" }] },
});
function fixture(legacy = false) {
  const workbook = createWorkbook({ id: "equation-test", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const textDocument = math();
  sheet.drawings = [
    {
      ...createGraphicDrawing("equation", "equation", "Equation", { row: 0, column: 0 }),
      text: legacy ? "x+1" : serializeEquationDocument(textDocument),
      ...(!legacy ? { equationDocument: textDocument } : {}),
    },
  ];
  let n = 0;
  const session = createWorkbookSession({ workbook, idFactory: () => `id-${++n}` });
  const revision = ref(0),
    generation = ref(0),
    active = shallowRef(sheet),
    busy = ref(false);
  let execute: (command: WorkbookCommand) => unknown = (command) => {
    const result = executeWorkbookCommand(session, command);
    revision.value++;
    return result;
  };
  const scope = effectScope();
  scopes.push(scope);
  const edit = scope.run(() =>
    useEquationEditSession({
      getWorkbook: () => session.workbook,
      getSheet: () => active.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      getAddress: () => ({ row: 0, column: 0 }),
      isBusy: () => busy.value,
      flush: () => true,
      execute: (command) => execute(command),
      name: () => "Equation",
    }),
  )!;
  return {
    session,
    sheet,
    edit,
    active,
    generation,
    revision,
    busy,
    setExecute: (next: typeof execute) => {
      execute = next;
    },
  };
}
test("structured private undo does not alter source; commit is one reversible command and snapshot75", () => {
  const { sheet, session, edit } = fixture();
  const source = sheet.drawings![0]!;
  expect(source.kind).toBe("equation");
  expect(edit.begin(source as never)).toBe(true);
  const cb = edit.callbacks.value!;
  expect(
    cb.action({
      type: "replace-text",
      selection: { slotId: "body", start: 1, end: 1 },
      text: "+y",
    }),
  ).toBe(true);
  expect(sheet.drawings![0]).toBe(source);
  expect(session.history.undoStack).toHaveLength(0);
  expect(cb.history("undo")).toBe(true);
  expect(edit.snapshot.value!.sourceText).toBe("x");
  expect(cb.history("redo")).toBe(true);
  expect(cb.commit()).toBe(true);
  expect(session.history.undoStack).toHaveLength(1);
  expect(sheet.drawings![0]).toMatchObject({ text: "x+y" });
  const snapshot = serializeWorkbook(session.workbook);
  expect(snapshot.version).toBe(75);
  expect(getActiveSheet(deserializeWorkbook(snapshot)).drawings).toEqual(sheet.drawings);
  expect(undoWorkbookCommand(session)).toBe(true);
  expect(sheet.drawings![0]).toEqual(source);
  expect(redoWorkbookCommand(session)).toBe(true);
  expect(sheet.drawings![0]).toMatchObject({ text: "x+y" });
});
test("false execute preserves draft, source and full history; retry succeeds", () => {
  const f = fixture();
  expect(f.edit.begin(f.sheet.drawings![0] as never)).toBe(true);
  const cb = f.edit.callbacks.value!;
  cb.action({ type: "replace-text", selection: { slotId: "body", start: 0, end: 1 }, text: "z" });
  const before = serializeWorkbook(f.session.workbook);
  f.setExecute(() => false);
  expect(cb.commit()).toBe(false);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(f.edit.snapshot.value!.sourceText).toBe("z");
  f.setExecute((command) => executeWorkbookCommand(f.session, command));
  expect(cb.commit()).toBe(true);
});
test("owner sheet/generation/protection changes cancel or reject old callbacks", () => {
  const f = fixture();
  expect(f.edit.begin(f.sheet.drawings![0] as never)).toBe(true);
  const cb = f.edit.callbacks.value!;
  const other = createSheet("Other", "other");
  insertSheet(f.session.workbook, other);
  f.active.value = other;
  expect(
    cb.action({
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 1 },
      text: "wrong",
    }),
  ).toBe(false);
  expect(cb.commit()).toBe(false);
  expect(other.drawings).toBeUndefined();
});
test("composition blocks semantic mutations and finish; Cancel is zero-write", () => {
  const f = fixture();
  f.edit.begin(f.sheet.drawings![0] as never);
  const cb = f.edit.callbacks.value!;
  expect(cb.composition(true)).toBe(true);
  expect(cb.commit()).toBe(false);
  expect(
    cb.action({
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 1 },
      text: "partial",
    }),
  ).toBe(false);
  cb.composition(false);
  cb.cancel();
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(f.sheet.drawings![0]).toMatchObject({ text: "x" });
});
test("old LaTeX remains exact and no-op finish is zero-history", () => {
  const f = fixture(true);
  const before = serializeWorkbook(f.session.workbook);
  expect(f.edit.begin(f.sheet.drawings![0] as never)).toBe(true);
  expect(f.edit.snapshot.value!.mode).toBe("latex");
  expect(f.edit.callbacks.value!.commit()).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
});
test("explicit source conversion can be restored or canceled and invalid source never overwrites", () => {
  const f = fixture();
  f.edit.begin(f.sheet.drawings![0] as never);
  const cb = f.edit.callbacks.value!;
  cb.sourceMode();
  expect(f.edit.snapshot.value!.sourceWarning).toBe(true);
  cb.dismissSourceWarning();
  expect(f.edit.snapshot.value!.mode).toBe("structured");
  cb.sourceMode();
  cb.confirmSourceMode();
  expect(f.edit.snapshot.value!.view.equationDocument).toBeUndefined();
  cb.source("\\unknownbadcommand{x}");
  expect(cb.commit()).toBe(false);
  expect(f.sheet.drawings![0]).toMatchObject({ text: "x" });
  expect(cb.reloadStructured()).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("x");
  cb.cancel();
  expect(f.session.history.undoStack).toHaveLength(0);
});

test("Normal Text toggle does not insert a space and styles the following literal input", () => {
  const f = fixture();
  f.edit.begin(f.sheet.drawings![0] as never);
  const cb = f.edit.callbacks.value!;
  expect(cb.toggleNormalText()).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("x");
  cb.action({
    type: "replace-text",
    selection: { slotId: "body", start: 1, end: 1 },
    text: "distance",
  });
  expect(f.edit.snapshot.value!.draft!.document.body.children[1]).toMatchObject({
    kind: "text",
    value: "distance",
    mode: "normal",
  });
  expect(f.session.history.undoStack).toHaveLength(0);
});
test("turning Normal Text off overrides the normal leaf mode on subsequent typing", () => {
  const f = fixture();
  f.edit.begin(f.sheet.drawings![0] as never);
  const cb = f.edit.callbacks.value!;
  cb.toggleNormalText();
  cb.action({
    type: "replace-text",
    selection: { slotId: "body", start: 1, end: 1 },
    text: "word",
  });
  expect(f.edit.snapshot.value!.draft!.document.body.children[1]).toMatchObject({
    kind: "text",
    value: "word",
    mode: "normal",
  });
  cb.toggleNormalText();
  cb.action({
    type: "replace-text",
    selection: { slotId: "body", start: 5, end: 5 },
    text: "x",
    mode: "normal",
  });
  expect(f.edit.snapshot.value!.draft!.document.body.children.at(-1)).toMatchObject({
    kind: "text",
    value: "x",
    mode: "math",
  });
});
