// @vitest-environment node
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
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import {
  serializeEquationDocument,
  type EquationDocument,
} from "@sheetcraft/core/equation-document";
import {
  findShapeGroupNode,
  normalizeShapeGroup,
  isSheetGroupedEquationDrawing,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import { createGraphicDrawing } from "../../../../modules/sheet-drawings/drawing-defaults";
import { useEquationEditSession } from "../../../../modules/sheet-drawings/equation/useEquationEditSession";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
const path = ["owner", "inner", "math"] as const;
const groupFrame = {
  kind: "shape-group-local-v1" as const,
  rect: { xRatio: 0.1, yRatio: 0.15, widthRatio: 0.8, heightRatio: 0.7 },
};
function fixture(structured = true) {
  const workbook = createWorkbook({ id: "owned-math", sheetId: "sheet" });
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
  } = createGraphicDrawing("math", "equation", "Equation", { row: 0, column: 0 });
  const math: SheetGroupedEquationDrawing = {
    ...appearance,
    kind: "equation",
    text: structured ? serializeEquationDocument(document) : "  x + 1  ",
    ...(structured ? { equationDocument: document } : {}),
    rotation: 5,
    groupFrame,
    equationFlipX: true,
    equationFlipY: true,
    shapeProperties: { printObject: false, altTitle: "Math" },
  };
  const sibling = {
    ...math,
    id: "other-math",
    groupFrame: { ...groupFrame, rect: { ...groupFrame.rect, xRatio: 0.2 } },
  };
  const root = normalizeShapeGroup({
    kind: "shapeGroup",
    id: "owner",
    name: "Outer owner",
    rotation: 20,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 24, y: 32, size: { width: 400, height: 250 } },
    },
    shapeProperties: {
      locked: false,
      printObject: false,
      altTitle: "Outer",
      lockAspectRatio: true,
    },
    members: [
      {
        kind: "shapeGroup",
        id: "inner",
        name: "Inner owner",
        rotation: 30,
        groupFrame,
        shapeProperties: { altTitle: "Inner" },
        members: [math, sibling],
      },
    ],
  });
  sheet.drawings = [root];
  const source = findShapeGroupNode(root, path)!.node as SheetGroupedEquationDrawing;
  const session = createWorkbookSession({ workbook, idFactory: () => "command" });
  const revision = ref(0),
    generation = ref(0),
    active = shallowRef(sheet),
    busy = ref(false);
  const metrics = shallowRef<PictureSheetMetrics | undefined>(createPictureSheetMetrics(sheet));
  let flush: () => boolean = () => true;
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
      getMetrics: () => metrics.value,
      isBusy: () => busy.value,
      flush: () => flush(),
      execute: (command) => execute(command),
      name: () => "Equation",
    }),
  )!;
  return {
    root,
    source,
    sheet,
    session,
    edit,
    metrics,
    revision,
    generation,
    active,
    busy,
    setExecute: (next: typeof execute) => {
      execute = next;
    },
    setFlush: (next: typeof flush) => {
      flush = next;
    },
  };
}
function replaceBody(f: ReturnType<typeof fixture>, text: string) {
  return f.edit.callbacks.value!.action({
    type: "replace-text",
    selection: { slotId: "body", start: 0, end: 1 },
    text,
  });
}
function mathIn(root: ShapeGroupDrawing) {
  const source = findShapeGroupNode(root, path)!.node;
  if (!isSheetGroupedEquationDrawing(source))
    throw new Error("Expected owned mathematical source.");
  return source;
}

test("owned structured session retains true root/path/node, preserves owners/siblings/frame/flip, and commits exactly one document Undo", () => {
  const f = fixture();
  expect(f.edit.beginOwned(f.root, path)).toBe(true);
  const before = serializeWorkbook(f.session.workbook),
    cb = f.edit.callbacks.value!;
  const state = f.edit.snapshot.value!;
  expect(state.root).toBe(f.root);
  expect(state.source).toBe(f.source);
  expect(state.path).toEqual(path);
  expect(state.ownerId).toBe("math");
  expect(state.view.rotation).toBeCloseTo(55);
  expect(state.view).not.toHaveProperty("groupFrame");
  expect(state.view).not.toHaveProperty("shapeProperties");
  expect(replaceBody(f, "y")).toBe(true);
  expect(cb.format("fontSize", 28)).toBe(true);
  expect(cb.format("color", "#123456")).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(cb.history("undo")).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("x");
  expect(cb.history("redo")).toBe(true);
  const editedDocument = f.edit.snapshot.value!.view.equationDocument;
  expect(cb.commit()).toBe(true);
  const changed = f.sheet.drawings![0] as ShapeGroupDrawing,
    source = mathIn(changed);
  expect(source).toEqual({
    ...f.source,
    text: "y",
    equationDocument: editedDocument,
    fontSize: 28,
    color: "#123456",
  });
  expect(source.text).toBe(serializeEquationDocument(source.equationDocument!));
  const { members: oldMembers, ...oldOuter } = f.root;
  const { members: nextMembers, ...nextOuter } = changed;
  expect(nextOuter).toEqual(oldOuter);
  const { members: oldChildren, ...oldInner } = oldMembers[0] as ShapeGroupedGroup;
  const { members: nextChildren, ...nextInner } = nextMembers[0] as ShapeGroupedGroup;
  expect(nextInner).toEqual(oldInner);
  expect(nextChildren[1]).toEqual(oldChildren[1]);
  expect(nextChildren.map((child) => child.id)).toEqual(oldChildren.map((child) => child.id));
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(serializeWorkbook(f.session.workbook).version).toBe(77);
  expect(
    getActiveSheet(deserializeWorkbook(serializeWorkbook(f.session.workbook))).drawings,
  ).toEqual(f.sheet.drawings);
  expect(undoWorkbookCommand(f.session)).toBe(true);
  expect(f.sheet.drawings).toEqual([f.root]);
  expect(redoWorkbookCommand(f.session)).toBe(true);
  expect(f.sheet.drawings).toEqual([changed]);
  const restored = f.sheet.drawings![0] as ShapeGroupDrawing;
  expect(f.edit.beginOwned(restored, path)).toBe(true);
  expect(f.edit.snapshot.value!.source).toBe(mathIn(restored));
  expect(f.edit.snapshot.value!.sourceText).toBe("y");
  expect(
    cb.action({
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 1 },
      text: "stale",
    }),
  ).toBe(false);
  expect(cb.commit()).toBe(false);
  cb.cancel();
  expect(f.edit.snapshot.value!.sourceText).toBe("y");
});

test("owned opaque LaTeX remains exact on no-op, private source Undo and one command/reopen", () => {
  const f = fixture(false),
    before = serializeWorkbook(f.session.workbook);
  expect(f.edit.beginOwned(f.root, path)).toBe(true);
  expect(f.edit.snapshot.value!.mode).toBe("latex");
  expect(f.edit.callbacks.value!.commit()).toBe(true);
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(f.edit.beginOwned(f.root, path)).toBe(true);
  const cb = f.edit.callbacks.value!;
  expect(cb.source("  y + 2  ")).toBe(true);
  expect(cb.history("undo")).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("  x + 1  ");
  expect(cb.history("redo")).toBe(true);
  expect(cb.commit()).toBe(true);
  const next = f.sheet.drawings![0] as ShapeGroupDrawing;
  expect(mathIn(next)).toEqual({ ...f.source, text: "  y + 2  " });
  expect(mathIn(next)).not.toHaveProperty("equationDocument");
  expect(f.session.history.undoStack).toHaveLength(1);
  expect(f.edit.beginOwned(next, path)).toBe(true);
  expect(f.edit.snapshot.value!.mode).toBe("latex");
  expect(f.edit.snapshot.value!.sourceText).toBe("  y + 2  ");
});

test("owned source conversion is deliberate, preserves owners and can be restored or canceled", () => {
  const f = fixture();
  f.edit.beginOwned(f.root, path);
  const cb = f.edit.callbacks.value!;
  cb.sourceMode();
  cb.dismissSourceWarning();
  expect(f.edit.snapshot.value!.mode).toBe("structured");
  cb.sourceMode();
  cb.confirmSourceMode();
  expect(f.edit.snapshot.value!.view).not.toHaveProperty("equationDocument");
  cb.source("\\unknownbadcommand{x}");
  expect(cb.commit()).toBe(false);
  expect(f.sheet.drawings![0]).toBe(f.root);
  expect(f.edit.snapshot.value!.sourceText).toBe("\\unknownbadcommand{x}");
  expect(cb.reloadStructured()).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("x");
  cb.sourceMode();
  cb.confirmSourceMode();
  cb.source("  z + 3  ");
  expect(cb.commit()).toBe(true);
  const next = f.sheet.drawings![0] as ShapeGroupDrawing;
  const { equationDocument: _document, ...opaque } = f.source;
  expect(mathIn(next)).toEqual({ ...opaque, text: "  z + 3  " });
  expect(f.edit.beginOwned(next, path)).toBe(true);
  f.edit.callbacks.value!.source("discard");
  f.edit.callbacks.value!.cancel();
  expect(mathIn(next).text).toBe("  z + 3  ");
  expect(f.session.history.undoStack).toHaveLength(1);
});

test.each([true, false])(
  "owned IME blocks source/semantic/private history/finish without disturbing persisted source (structured=%s)",
  (structured) => {
    const f = fixture(structured),
      before = serializeWorkbook(f.session.workbook);
    f.edit.beginOwned(f.root, path);
    const cb = f.edit.callbacks.value!;
    expect(cb.composition(true)).toBe(true);
    expect(cb.commit()).toBe(false);
    expect(cb.source("partial")).toBe(false);
    expect(cb.history("undo")).toBe(false);
    expect(cb.sourceMode()).toBe(false);
    expect(cb.format("fontSize", 30)).toBe(false);
    expect(replaceBody(f, "partial")).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(cb.composition(false)).toBe(true);
    expect(structured ? replaceBody(f, "z") : cb.source("z")).toBe(true);
    expect(cb.commit()).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  },
);

test("owned rejected execution keeps source and draft/private history, and retry is one command", () => {
  const f = fixture(),
    before = serializeWorkbook(f.session.workbook);
  f.edit.beginOwned(f.root, path);
  const cb = f.edit.callbacks.value!;
  replaceBody(f, "z");
  f.setExecute(() => false);
  expect(cb.commit()).toBe(false);
  expect(cb.isActive()).toBe(true);
  expect(f.edit.snapshot.value!.sourceText).toBe("z");
  expect(f.edit.snapshot.value!.error).toContain("draft is preserved");
  expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(cb.history("undo")).toBe(true);
  expect(cb.history("redo")).toBe(true);
  f.setExecute((command) => {
    executeWorkbookCommand(f.session, command);
    throw new Error("observer failed after apply");
  });
  expect(cb.commit()).toBe(true);
  expect(mathIn(f.sheet.drawings![0] as ShapeGroupDrawing).text).toBe("z");
  expect(f.session.history.undoStack).toHaveLength(1);
});

test.each([
  "revision",
  "generation",
  "workbook",
  "sheet",
  "root-replace",
  "node-replace",
  "reparent",
  "source",
  "frame",
  "owner",
  "owner-replace",
  "hidden-root",
  "hidden-owner",
  "hidden-node",
  "metrics",
  "metric-function",
  "dispose",
  "permissions",
] as const)("owned %s invalidates old callbacks without applying to any owner", (change) => {
  const f = fixture();
  f.edit.beginOwned(f.root, path);
  const cb = f.edit.callbacks.value!;
  replaceBody(f, "draft");
  if (change === "revision") f.revision.value++;
  else if (change === "generation") f.generation.value++;
  else if (change === "workbook")
    f.session.workbook = createWorkbook({ id: "replacement", sheetId: "sheet" });
  else if (change === "sheet") {
    const other = createSheet("Other", "other");
    insertSheet(f.session.workbook, other);
    f.active.value = other;
  } else if (change === "root-replace") f.sheet.drawings = [normalizeShapeGroup(f.root)];
  else if (change === "node-replace")
    (f.root.members[0] as ShapeGroupedGroup).members[0] = { ...f.source };
  else if (change === "reparent") {
    (f.root.members[0] as ShapeGroupedGroup).members.shift();
    f.root.members.push(f.source);
  } else if (change === "source") f.source.text = "mutated";
  else if (change === "frame")
    f.source.groupFrame = { ...groupFrame, rect: { ...groupFrame.rect, xRatio: 0.3 } };
  else if (change === "owner") (f.root.members[0] as ShapeGroupedGroup).rotation++;
  else if (change === "owner-replace")
    f.root.members[0] = { ...(f.root.members[0] as ShapeGroupedGroup) };
  else if (change === "hidden-root") f.root.hidden = true;
  else if (change === "hidden-owner") (f.root.members[0] as ShapeGroupedGroup).hidden = true;
  else if (change === "hidden-node") f.source.hidden = true;
  else if (change === "metrics") f.metrics.value = createPictureSheetMetrics(f.sheet);
  else if (change === "metric-function") f.metrics.value!.rows.visiblePrefix = () => 0;
  else if (change === "dispose") scopes.at(-1)!.stop();
  else {
    f.sheet.properties.protected = true;
    delete f.root.shapeProperties!.locked;
  }
  expect(cb.isActive()).toBe(false);
  expect(cb.source("stale")).toBe(false);
  expect(
    cb.action({
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 1 },
      text: "stale",
    }),
  ).toBe(false);
  expect(cb.composition(false)).toBe(false);
  expect(cb.commit()).toBe(false);
  expect(f.session.history.undoStack).toHaveLength(0);
});

test("owned editor follows outer root permissions and refuses groups/non-math/disposable/stale/hidden/collapsed targets", () => {
  const f = fixture();
  f.sheet.properties.protected = true;
  expect(f.edit.beginOwned(f.root, path)).toBe(true); // leaf and intermediate locks never authorize/deny the outer owner
  f.edit.callbacks.value!.cancel();
  expect(f.edit.begin(f.root as never)).toBe(false);
  expect(f.edit.begin(f.source as never)).toBe(false);
  expect(f.edit.beginOwned(f.root, ["owner"])).toBe(false);
  expect(f.edit.beginOwned(f.root, ["owner", "inner"])).toBe(false);
  expect(f.edit.beginOwned(f.root, ["owner", "math"])).toBe(false);
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...shape
  } = createGraphicDrawing("ordinary-shape", "shape", "Shape", { row: 0, column: 0 });
  f.root.members.push({ ...shape, kind: "shape", groupFrame });
  expect(f.edit.beginOwned(f.root, ["owner", "ordinary-shape"])).toBe(false);
  expect(f.edit.beginOwned(normalizeShapeGroup(f.root), path)).toBe(false);
  f.metrics.value = undefined;
  expect(f.edit.beginOwned(f.root, path)).toBe(false);
  f.metrics.value = createPictureSheetMetrics(f.sheet);
  f.source.hidden = true;
  expect(f.edit.beginOwned(f.root, path)).toBe(false);
  delete f.source.hidden;
  f.root.hidden = true;
  expect(f.edit.beginOwned(f.root, path)).toBe(false);
  delete f.root.hidden;
  delete f.root.shapeProperties!.locked;
  expect(f.edit.beginOwned(f.root, path)).toBe(false);
  f.root.shapeProperties!.locked = false;
  f.root.shapeFrame = {
    kind: "shape-frame-v1",
    anchor: {
      mode: "move-and-size",
      start: { column: { index: 0, offset: 1 }, row: { index: 1, offset: 1 } },
      end: { column: { index: 2, offset: 1 }, row: { index: 1, offset: 10 } },
    },
  };
  f.sheet.hiddenRows = new Set([1]);
  f.metrics.value = createPictureSheetMetrics(f.sheet);
  expect(f.edit.beginOwned(f.root, path)).toBe(false);
});

test("flush-time owner change refuses to acquire a different mathematical lease", () => {
  const f = fixture();
  f.setFlush(() => {
    (f.root.members[0] as ShapeGroupedGroup).rotation++;
    return true;
  });
  expect(f.edit.beginOwned(f.root, path)).toBe(false);
  expect(f.edit.snapshot.value).toBeUndefined();
  expect(f.session.history.undoStack).toHaveLength(0);
});
