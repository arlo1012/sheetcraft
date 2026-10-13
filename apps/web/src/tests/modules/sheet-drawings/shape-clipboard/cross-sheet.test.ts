// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbook, createSheet, getActiveSheet, type Sheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  type PictureSheetMetrics,
  createPictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  normalizeShapeDrawingForest,
  resolveShapeRootLayout,
  isShapeGroupEligibleRoot,
} from "@sheetcraft/core/shape-group-planning";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import {
  isShapeGroupDrawing,
  traverseShapeGroup,
  type ShapeGroupPath,
  type ShapeGroupNode,
} from "@sheetcraft/core/shape-group";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import { useShapeDrawingTransfer } from "../../../../modules/sheet-drawings/useShapeDrawingTransfer";
import { useShapeClipboard } from "../../../../modules/sheet-drawings/useShapeClipboard";
import { collectWorkbookImageAssetIds } from "../../../../modules/image-assets/useImageAssetUrls";
import { shape, group, wordArt } from "./fixture";

function connections() {
  const a = shape("a", 20, 40),
    b = shape("b", 450, 300);
  a.shapeGeometry = { preset: "rect" };
  b.shapeGeometry = { preset: "ellipse" };
  const line = shape("line", 220, 100);
  line.text = "";
  delete line.shapeText;
  line.shapeGeometry = { preset: "bentConnector3" };
  line.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: "a", preset: "rect", siteIndex: 3 },
    end: { kind: "site", targetId: "b", preset: "ellipse", siteIndex: 2 },
  };
  return [a, b, line];
}
function fixture(
  drawings: SheetDrawing[] = [shape("source")],
  paths: readonly ShapeGroupPath[] = [["source"]],
) {
  const workbook = createWorkbook({ id: "book", sheetId: "s" });
  const source = getActiveSheet(workbook),
    target = createSheet("Target", "t");
  workbook.sheets.set(target.id, target);
  source.drawings = normalizeShapeDrawingForest(drawings);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let active = source,
    metrics = createPictureSheetMetrics(source),
    revision = 0,
    ids = 0;
  let targetAddress = { row: 4, column: 3 };
  let busy = false,
    currentPaths = paths;
  const options = {
    getWorkbook: () => workbook,
    getSheet: () => active,
    getGeneration: () => 0,
    getRevision: () => revision,
    getDocumentRevision: () => session.history.revision,
    getMetrics: () => metrics,
    getAddress: () => targetAddress,
    isBusy: () => busy,
    flush: () => true,
  };
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const result = executeWorkbookCommand(session, command);
    if (result) revision++;
    return result;
  });
  const prepareDrawing = vi.fn(
    (_sheet: Sheet, _metrics: PictureSheetMetrics, drawing: SheetDrawing) => drawing,
  );
  const preflight = vi.fn(() => true);
  const transfer = useShapeDrawingTransfer({
    ...options,
    execute,
    prepareDrawing,
    preflightConnectedCollection: preflight,
  });
  const actions = useDrawingActions({
    ...options,
    execute,
    name: (kind) => kind,
    prepareDrawing: (drawing) => drawing,
  });
  const replaceCollections = vi.fn(transfer.replaceCollections);
  const feedback = vi.fn(),
    selected = vi.fn();
  const clipboard = useShapeClipboard({
    ...options,
    getSelectedPaths: () => currentPaths,
    getTargetAddress: options.getAddress,
    createId: () => `new-${++ids}`,
    replaceCollection: actions.replaceCollectionPreservingGeometry,
    replaceCollections,
    onFeedback: feedback,
    onSelect: selected,
  });
  return {
    workbook,
    source,
    target,
    session,
    execute,
    prepareDrawing,
    preflight,
    clipboard,
    feedback,
    selected,
    replaceCollections,
    navigate(sheet = target) {
      active = sheet;
      workbook.activeSheetId = sheet.id;
      metrics = createPictureSheetMetrics(sheet);
      revision++;
    },
    address(value: { row: number; column: number }) {
      targetAddress = value;
    },
    mutate() {
      session.history.revision++;
      revision++;
    },
    select(next: readonly ShapeGroupPath[]) {
      currentPaths = next;
    },
    busy(value: boolean) {
      busy = value;
    },
  };
}
function forestNode(forest: readonly SheetDrawing[], id: string): SheetDrawing | ShapeGroupNode {
  for (const root of forest) {
    if (root.id === id) return root;
    if (isShapeGroupDrawing(root)) {
      const match = traverseShapeGroup(root).find(({ node }) => node.id === id);
      if (match) return match.node;
    }
  }
  throw new Error(`Missing drawing ${id}`);
}
function snapshot(f: ReturnType<typeof fixture>) {
  return serializeWorkbook(f.workbook);
}
function drawingState(f: ReturnType<typeof fixture>) {
  return [f.source.drawings, f.target.drawings];
}

describe("two-sheet document-local Cut", () => {
  test("navigation survives the source lease; one atomic command, Undo and Redo transfer both forests", () => {
    const f = fixture();
    const original = f.source.drawings![0]!;
    expect(f.clipboard.cut()).toBe(true);
    expect(f.source.drawings![0]).toBe(original);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.navigate();
    const before = snapshot(f);
    expect(f.clipboard.paste()).toBe(true);
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.source.drawings).toEqual([]);
    expect(f.target.drawings!.map((node) => node.id)).toEqual(["new-1"]);
    expect(f.execute.mock.calls[0]![0].type).toBe("replaceSheetDrawingCollections");
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = snapshot(f);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(snapshot(f)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(snapshot(f)).toEqual(after);
  });
  test("owned subtree release repairs source owners, keeps hidden assets and typography, and reserves colliding IDs", () => {
    const f = fixture([group(), wordArt()], [["outer", "inner"]]);
    f.target.drawings = [shape("new-1")];
    const assets = collectWorkbookImageAssetIds(f.workbook);
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    const before = snapshot(f);
    expect(f.clipboard.paste()).toBe(false);
    expect(snapshot(f)).toEqual(before);
    // The ID factory collision rejects rather than changing identity silently or deleting the source.
    expect(f.clipboard.hasPending()).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.clipboard.paste()).toBe(true);
    expect(f.source.drawings!.map((node) => node.id)).toEqual(["first", "art"]);
    const moved = f.target.drawings!.at(-1)!;
    expect(moved.kind).toBe("shapeGroup");
    expect(collectWorkbookImageAssetIds(f.workbook)).toEqual(assets);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(snapshot(f)).toEqual(before);
  });
  test("linked textboxes retain absolute source and stored geometry without refreshing history", () => {
    const linked = shape("linked");
    linked.kind = "textBox";
    delete linked.shapeGeometry;
    linked.text = "";
    linked.textReference = { sheetId: "s", cell: { row: 0, column: 0 } };
    delete linked.shapeText;
    const f = fixture([linked], [["linked"]]);
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    expect(f.clipboard.paste()).toBe(true);
    const moved = f.target.drawings![0]!;
    expect(moved.kind).toBe("textBox");
    if (moved.kind !== "textBox" || !isShapeGroupEligibleRoot(moved))
      throw Error("Expected textbox");
    expect(moved.textReference).toEqual(linked.textReference);
    expect(moved.text).toBe("");
    expect(resolveShapeRootLayout(moved, createPictureSheetMetrics(f.target)).rect).toMatchObject({
      width: 240,
      height: 120,
    });
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test.each(["source", "target", "document", "geometry", "prepare", "command"])(
    "%s failure retains both sheets, clipboard and history",
    (reason) => {
      const f = fixture();
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.navigate();
      if (reason === "source") {
        f.source.properties.protected = true;
        f.source.protection = { editableRanges: [] };
      }
      if (reason === "target") {
        f.target.properties.protected = true;
        f.target.protection = { editableRanges: [] };
      }
      if (reason === "document") f.mutate();
      if (reason === "geometry") f.source.rowHeights.set(0, 50);
      if (reason === "prepare")
        f.prepareDrawing.mockImplementationOnce(() => {
          throw Error("glyph unavailable");
        });
      if (reason === "command") f.replaceCollections.mockReturnValueOnce(false);
      const before = snapshot(f),
        objects = drawingState(f);
      expect(f.clipboard.paste()).toBe(false);
      expect(snapshot(f)).toEqual(before);
      expect(drawingState(f)).toEqual(objects);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("cross-boundary endpoints are counted from original associations and need an explicit reversible confirmation", () => {
    const f = fixture(connections(), [["a"]]);
    const beforeTips = resolveSheetShapeConnections(
      f.source.drawings!,
      createPictureSheetMetrics(f.source),
    ).getConnector("line")!;
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    const before = snapshot(f),
      identity = f.clipboard.getIdentity();
    expect(f.clipboard.paste()).toBe(false);
    const first = f.clipboard.confirmation.value!;
    expect(first.disconnectedEndpoints).toEqual({ moved: 0, remaining: 1, total: 1 });
    expect(snapshot(f)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    first.cancel();
    expect(f.clipboard.getIdentity()).toEqual(identity);
    expect(snapshot(f)).toEqual(before);
    expect(f.clipboard.paste()).toBe(false);
    const second = f.clipboard.confirmation.value!;
    expect(first.confirm()).toBe(false);
    first.cancel();
    expect(f.clipboard.confirmation.value).toBe(second);
    expect(second.confirm()).toBe(true);
    expect(f.clipboard.hasPending()).toBe(false);
    const line = forestNode(f.source.drawings!, "line");
    if (line.kind !== "shape") throw Error("line");
    expect(line.shapeConnector!.begin.kind).toBe("free");
    expect(line.shapeConnector!.end.kind).toBe("site");
    const afterTips = resolveSheetShapeConnections(
      f.source.drawings!,
      createPictureSheetMetrics(f.source),
    ).getConnector("line")!;
    expect(afterTips.begin).toMatchObject({
      position: beforeTips.begin.status === "ready" ? beforeTips.begin.position : {},
    });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(snapshot(f)).toEqual(before);
  });
  test("moved connectors free only outside tips while internal site IDs remap with their selected target", () => {
    const f = fixture(connections(), [["a"], ["line"]]);
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    expect(f.clipboard.paste()).toBe(false);
    const request = f.clipboard.confirmation.value!;
    expect(request.disconnectedEndpoints).toEqual({ moved: 1, remaining: 0, total: 1 });
    expect(request.confirm()).toBe(true);
    const [a, line] = f.target.drawings!;
    if (!line || line.kind !== "shape") throw Error("line");
    expect(line.shapeConnector!.begin).toMatchObject({
      kind: "site",
      targetId: a!.id,
      siteIndex: 3,
    });
    expect(line.shapeConnector!.end.kind).toBe("free");
    expect(f.source.drawings!.map((node) => node.id)).toEqual(["b"]);
  });
  test("a full closure keeps bindings without prompting; locked outside connectors refuse even after confirmation", () => {
    const all = fixture(connections(), [["a"], ["b"], ["line"]]);
    expect(all.clipboard.cut()).toBe(true);
    all.navigate();
    expect(all.clipboard.paste()).toBe(true);
    expect(all.clipboard.confirmation.value).toBeUndefined();
    const f = fixture(connections(), [["a"]]);
    const a = f.source.drawings![0]!;
    if (!("shapeFrame" in a)) throw Error("frame");
    a.shapeProperties = { locked: false };
    f.source.properties.protected = true;
    f.source.protection = { editableRanges: [] };
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    const before = snapshot(f);
    expect(f.clipboard.paste()).toBe(false);
    expect(f.clipboard.confirmation.value!.confirm()).toBe(false);
    expect(snapshot(f)).toEqual(before);
    expect(f.clipboard.hasPending()).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("owner/history/clipboard changes invalidate a pending confirmation without affecting replacement requests", () => {
    const f = fixture(connections(), [["a"]]);
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    expect(f.clipboard.paste()).toBe(false);
    const request = f.clipboard.confirmation.value!;
    const before = snapshot(f);
    f.mutate();
    expect(request.isCurrent()).toBe(false);
    expect(request.confirm()).toBe(false);
    expect(snapshot(f)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.clipboard.hasPending()).toBe(true);
  });
  test("source and target paint preflight run before either assignment", () => {
    const f = fixture(connections(), [["a"]]);
    expect(f.clipboard.cut()).toBe(true);
    f.navigate();
    expect(f.clipboard.paste()).toBe(false);
    const before = snapshot(f);
    f.preflight.mockReturnValueOnce(false);
    expect(f.clipboard.confirmation.value!.confirm()).toBe(false);
    expect(snapshot(f)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.clipboard.hasPending()).toBe(true);
  });
});

test("confirmation owns the target cell navigation lease even for an explicit paste address", () => {
  const f = fixture(connections(), [["a"]]);
  expect(f.clipboard.cut()).toBe(true);
  f.navigate();
  expect(f.clipboard.paste({ row: 9, column: 8 })).toBe(false);
  const request = f.clipboard.confirmation.value!,
    before = snapshot(f);
  f.address({ row: 5, column: 3 });
  expect(request.isCurrent()).toBe(false);
  expect(request.confirm()).toBe(false);
  expect(snapshot(f)).toEqual(before);
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.clipboard.hasPending()).toBe(true);
});
