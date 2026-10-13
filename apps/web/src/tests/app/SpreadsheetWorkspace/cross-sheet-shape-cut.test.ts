import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellValue,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  isFramedShapeDrawing,
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { isShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import { groupShapeRoots, resolveShapeRootLayout } from "@sheetcraft/core/shape-group-planning";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import type { ShapePaint } from "@sheetcraft/core/shape-style";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { WorkbookSession } from "@sheetcraft/core/history";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import ShapeClipboardTransferDialog from "../../../modules/sheet-drawings/components/ShapeClipboardTransferDialog.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import type { useShapeClipboard } from "../../../modules/sheet-drawings/useShapeClipboard";
import * as measurement from "../../../modules/sheet-drawings/shape-text-measure";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  textPaint.clearShapeTextPaintCache();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function state(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    session: WorkbookSession;
    workbookRevision: number;
    shapeClipboard: ReturnType<typeof useShapeClipboard>;
    sheetGridRef: {
      selectShapeObjects(paths: readonly (readonly string[])[]): boolean;
      getSelectedShapeObjects(): readonly (readonly string[])[];
    };
    executeCommand(command: WorkbookCommand): boolean;
    selectSheet(id: string): void;
    undo(): void;
    redo(): void;
    saveError: string | undefined;
  };
}
function nativeBoundary() {
  // The same native-only boundary as textbox-reference.test.ts: absent font
  // metrics and final Canvas alpha proofs are supplied. The render planners,
  // Workspace, SheetGrid, owner guards, transfer, Core commands and history run.
  vi.spyOn(measurement, "getBrowserShapeTextMeasurement").mockReturnValue({
    measurer: {
      measure: (text) => Array.from(text).length * 10,
      measureMetrics: (text) => ({
        width: Array.from(text).length * 10,
        ascent: 15,
        descent: 5,
        inkLeft: 0,
        inkRight: Array.from(text).length * 10,
      }),
    },
    resolveNormalLineMetrics: () => ({
      metrics: { ascent: 15, descent: 5, lineAdvance: 20 },
      policy: "provided-native",
    }),
  });
  vi.spyOn(textPaint, "preflightShapeTextGlyphBudgets").mockImplementation((options) => {
    const plan = textPaint.planShapeTextPaint(options);
    if (plan.kind !== "ready")
      return {
        kind: "unavailable",
        reason: plan.reason,
        missingAssetIds: [...plan.missingAssetIds],
      };
    return {
      kind: "ready",
      proof: "numeric-source",
      actualDensity: plan.actualDensity,
      estimatedPeakBytes: plan.estimatedPeakBytes,
      contourCount: 0,
      edgeCount: 0,
      pointCount: 0,
      glyphCommandCount: 0,
    };
  });
  vi.spyOn(groupPaint, "preflightShapeGroupPaint").mockImplementation((options) =>
    groupPaint.planShapeGroupPaint(options),
  );
}
function drawing(
  id: string,
  kind: "shape" | "textBox" = "textBox",
  x = 40,
): SheetFramedGraphicDrawing {
  const {
    anchor: _anchor,
    offsetX: _x,
    offsetY: _y,
    width: _width,
    height: _height,
    ...appearance
  } = createGraphicDrawing(id, kind, id, { row: 0, column: 0 });
  const shapeText = createDefaultShapeText();
  shapeText.layout.autoFit = "resize-shape";
  return normalizeSheetDrawing({
    ...appearance,
    kind,
    text: kind === "textBox" ? "alpha beta" : "",
    shapeText,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x, y: 24, size: { width: 240, height: 120 } },
    },
  });
}
function wordArt(): SheetFramedGraphicDrawing {
  const result = drawing("art", "shape", 640);
  result.wordArt = true;
  result.text = "Owned art";
  result.shapeStyle = { fill: { kind: "none" }, line: { kind: "none" } };
  result.shapeText!.style = {
    fill: {
      kind: "value",
      value: { kind: "solid", color: { kind: "rgb", rgb: "#C00000" }, opacity: 1 },
    },
  };
  result.shapeText!.characterRuns = [{ start: 0, end: 5, fontSize: 28, bold: true }];
  return normalizeSheetDrawing(result);
}
function connector(id: string, begin = "a", end = "b") {
  const result = drawing(id, "shape", 300);
  result.shapeGeometry = { preset: "bentConnector3" };
  delete result.shapeText;
  result.shapeConnector = {
    kind: "shape-connector-v1",
    begin: { kind: "site", targetId: begin, preset: "rect", siteIndex: 3 },
    end: { kind: "site", targetId: end, preset: "rect", siteIndex: 1 },
  };
  return normalizeSheetDrawing(result);
}
function workbook() {
  const book = createWorkbook({ id: "cross-sheet-cut", sheetId: "source", sheetName: "Source" });
  getActiveSheet(book).drawings = [drawing("box")];
  setCellValue(getActiveSheet(book), { row: 0, column: 0 }, "original source value");
  const target = createSheet("Destination", "target");
  target.drawings = [drawing("witness", "textBox", 900)];
  setCellValue(target, { row: 0, column: 0 }, "destination value");
  insertSheet(book, target);
  book.activeSheetId = "source";
  return book;
}
async function fixture(book: Workbook = workbook()) {
  nativeBoundary();
  const before = serializeWorkbook(book);
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: before }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  const current = state(wrapper);
  expect(current.saveError).toBeUndefined();
  expect(serializeWorkbook(current.session.workbook)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  return { wrapper, current };
}
function sheet(current: ReturnType<typeof state>, id: "source" | "target") {
  return current.session.workbook.sheets.get(id)!;
}
function forests(current: ReturnType<typeof state>) {
  return clone({
    source: sheet(current, "source").drawings,
    target: sheet(current, "target").drawings,
  });
}
function named(current: ReturnType<typeof state>, sheetId: "source" | "target", name: string) {
  const result = sheet(current, sheetId).drawings!.find((node) => node.name === name);
  if (!result || !isFramedShapeDrawing(result)) throw Error(`Expected root ${sheetId}/${name}`);
  return result;
}
async function key(wrapper: VueWrapper, value: "x" | "v", ownerId?: string) {
  const target = ownerId
    ? wrapper.getComponent(SheetDrawingLayer).get(`[data-sheet-drawing-id="${ownerId}"]`)
    : wrapper.getComponent(SheetGrid);
  await target.trigger("keydown", { key: value, ctrlKey: true });
  await flushPromises();
}
async function cut(
  wrapper: VueWrapper,
  current: ReturnType<typeof state>,
  paths: readonly (readonly string[])[] = [["box"]],
) {
  const before = forests(current),
    history = current.session.history.revision;
  const source = sheet(current, "source").drawings;
  expect(current.sheetGridRef.selectShapeObjects(paths)).toBe(true);
  await flushPromises();
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual(paths);
  await key(wrapper, "x", paths[0]![0]);
  expect(current.shapeClipboard.getMode()).toBe("cut");
  expect(current.shapeClipboard.hasPending()).toBe(true);
  expect(sheet(current, "source").drawings).toBe(source);
  expect(forests(current)).toEqual(before);
  expect(current.session.history.revision).toBe(history);
}
async function navigate(current: ReturnType<typeof state>, id: "source" | "target") {
  const revision = current.workbookRevision,
    history = current.session.history.revision;
  current.selectSheet(id);
  await flushPromises();
  expect(current.session.workbook.activeSheetId).toBe(id);
  expect(current.workbookRevision).toBeGreaterThan(revision);
  expect(current.session.history.revision).toBe(history);
}
async function undoRedo(current: ReturnType<typeof state>, before: ReturnType<typeof forests>) {
  const after = forests(current);
  expect(after).not.toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(1);
  expect(current.session.history.undoStack[0]!.command.type).toBe("replaceSheetDrawingCollections");
  current.undo();
  await flushPromises();
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.session.history.redoStack).toHaveLength(1);
  current.redo();
  await flushPromises();
  expect(forests(current)).toEqual(after);
  expect(current.session.history.undoStack).toHaveLength(1);
}
function displayedText(wrapper: VueWrapper, id: string) {
  const content = wrapper
    .findAllComponents(DrawingContent)
    .find((node) => node.props("drawing").id === id);
  expect(content).toBeDefined();
  expect(content!.props("textReferenceUnavailable")).toBe(false);
  return content!.props("paintDrawing")!.text;
}
function transferPanel() {
  const result = document.querySelector<HTMLElement>("[data-shape-transfer-confirmation]");
  if (!result) throw Error("Missing visible cross-sheet Cut confirmation");
  return result;
}
async function dialogButton(label: string) {
  const panel = transferPanel().closest(".t-dialog")!;
  const button = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(button, `Missing real TDesign button: ${label}`).toBeDefined();
  expect(new DOMWrapper(button!).isVisible()).toBe(true);
  expect(button!.disabled).toBe(false);
  await new DOMWrapper(button!).trigger("click");
  await flushPromises();
}

test("real Ctrl+X/tab navigation/Ctrl+V moves roots and a complete connector closure in one history entry", async () => {
  const book = workbook(),
    source = getActiveSheet(book);
  const linked = drawing("linked", "textBox", 400);
  linked.text = "";
  linked.textReference = { sheetId: "source", cell: { row: 0, column: 0 } };
  source.drawings = [
    drawing("a", "shape"),
    drawing("b", "shape", 1100),
    connector("line"),
    drawing("box"),
    linked,
    wordArt(),
  ];
  const { wrapper, current } = await fixture(book),
    before = forests(current);
  const originalArt = clone(named(current, "source", "art"));
  const paths = sheet(current, "source").drawings!.map((node) => [node.id]);
  await cut(wrapper, current, paths);
  await navigate(current, "target");
  expect(current.shapeClipboard.hasPending()).toBe(true);
  await key(wrapper, "v");
  expect(wrapper.findComponent(ShapeClipboardTransferDialog).exists()).toBe(false);
  expect(sheet(current, "source").drawings).toEqual([]);
  expect(sheet(current, "target").drawings).toHaveLength(7);
  expect(named(current, "target", "witness")).toEqual(before.target![0]);
  expect(current.shapeClipboard.hasPending()).toBe(false);
  const movedArt = named(current, "target", "art"),
    movedLink = named(current, "target", "linked");
  expect(movedArt.id).not.toBe(originalArt.id);
  expect(movedArt.wordArt).toBe(true);
  expect(movedArt.shapeText).toEqual(originalArt.shapeText);
  expect(movedArt.shapeStyle).toEqual(originalArt.shapeStyle);
  expect(movedLink.text).toBe("");
  expect(movedLink.textReference).toEqual({ sheetId: "source", cell: { row: 0, column: 0 } });
  expect(displayedText(wrapper, movedLink.id)).toBe("original source value");
  const movedLine = named(current, "target", "line"),
    connections = resolveSheetShapeConnections(
      sheet(current, "target").drawings!,
      createPictureSheetMetrics(sheet(current, "target")),
    );
  expect(connections.getConnector(movedLine.id)).toMatchObject({
    status: "ready",
    begin: { kind: "site", targetId: named(current, "target", "a").id },
    end: { kind: "site", targetId: named(current, "target", "b").id },
  });
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual(
    sheet(current, "target")
      .drawings!.slice(1)
      .map((node) => [node.id]),
  );
  await undoRedo(current, before);
  expect(named(current, "target", "linked").textReference).toEqual(movedLink.textReference);
  const storedLink = clone(named(current, "target", "linked"));
  expect(
    current.executeCommand({
      type: "setCellContents",
      changes: [
        {
          sheetId: "source",
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "latest source display" },
        },
      ],
    }),
  ).toBe(true);
  await flushPromises();
  expect(named(current, "target", "linked")).toEqual(storedLink);
  expect(displayedText(wrapper, storedLink.id)).toBe("latest source display");
});

test("cutting an actually selected owned TextBox releases it and collapses its last source owner atomically", async () => {
  const book = workbook(),
    source = getActiveSheet(book);
  source.drawings = groupShapeRoots(
    [drawing("box"), drawing("sibling", "shape", 400)],
    ["box", "sibling"],
    { id: "owner", name: "Owner" },
    createPictureSheetMetrics(source),
  );
  const { wrapper, current } = await fixture(book),
    before = forests(current);
  const root = sheet(current, "source").drawings![0]!;
  if (!isShapeGroupDrawing(root)) throw Error("Expected real source owner");
  const projection = resolveShapeGroupProjection(
    root,
    createPictureSheetMetrics(sheet(current, "source")),
  );
  const siblingRect = projection.leaves.find((leaf) => leaf.sourceNode.id === "sibling")!.layout!
      .rect,
    boxLayout = projection.leaves.find((leaf) => leaf.sourceNode.id === "box")!.layout!;
  await cut(wrapper, current, [["owner", "box"]]);
  await navigate(current, "target");
  await key(wrapper, "v");
  expect(sheet(current, "source").drawings).toHaveLength(1);
  const survivor = named(current, "source", "sibling"),
    moved = named(current, "target", "box");
  expect(survivor.id).toBe("sibling");
  const survivorRect = resolveShapeRootLayout(
    survivor,
    createPictureSheetMetrics(sheet(current, "source")),
  ).rect;
  for (const field of ["x", "y", "width", "height"] as const)
    expect(survivorRect[field]).toBeCloseTo(siblingRect[field], 8);
  expect(moved).not.toHaveProperty("groupFrame");
  // Core releases group-local leaves into canonical move-and-size roots.
  expect(moved.shapeFrame.anchor.mode).toBe("move-and-size");
  const movedRect = resolveShapeRootLayout(
    moved,
    createPictureSheetMetrics(sheet(current, "target")),
  ).rect;
  expect(movedRect.x).toBeCloseTo(0, 8);
  expect(movedRect.y).toBeCloseTo(0, 8);
  expect(movedRect.width).toBeCloseTo(boxLayout.rect.width, 8);
  expect(movedRect.height).toBeCloseTo(boxLayout.rect.height, 8);
  expect(moved.rotation).toBeCloseTo(boxLayout.angleDeg, 8);
  expect(moved.text).toBe("alpha beta");
  expect(moved.shapeText?.layout.autoFit).toBe("resize-shape");
  expect(current.sheetGridRef.getSelectedShapeObjects()).toEqual([[moved.id]]);
  expect(current.shapeClipboard.hasPending()).toBe(false);
  await undoRedo(current, before);
});

test("visible cross-closure confirmation cancels without writes, rejects old callbacks, and disconnects only after the real confirm button", async () => {
  const book = workbook();
  getActiveSheet(book).drawings = [
    drawing("a", "shape"),
    drawing("b", "shape", 800),
    connector("moving-line"),
    connector("remaining-line"),
  ];
  const { wrapper, current } = await fixture(book),
    before = forests(current);
  await cut(wrapper, current, [["a"], ["moving-line"]]);
  const identity = current.shapeClipboard.getIdentity(),
    historyRevision = current.session.history.revision;
  await navigate(current, "target");
  await key(wrapper, "v");
  const dialog = wrapper.getComponent(ShapeClipboardTransferDialog),
    old = dialog.props("request");
  expect(dialog.getComponent(Dialog).props("visible")).toBe(true);
  expect(new DOMWrapper(transferPanel()).isVisible()).toBe(true);
  expect(wrapper.get(".spreadsheet-workspace__grid").attributes("inert")).toBeDefined();
  expect(old.disconnectedEndpoints).toEqual({ moved: 1, remaining: 1, total: 2 });
  expect(old.isCurrent()).toBe(true);
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.session.history.revision).toBe(historyRevision);
  await dialogButton("Cancel");
  expect(wrapper.findComponent(ShapeClipboardTransferDialog).exists()).toBe(false);
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.session.history.revision).toBe(historyRevision);
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
  await key(wrapper, "v");
  const fresh = wrapper.getComponent(ShapeClipboardTransferDialog).props("request");
  expect(fresh.sessionId).not.toBe(old.sessionId);
  expect(old.confirm()).toBe(false);
  old.cancel();
  await flushPromises();
  expect(wrapper.getComponent(ShapeClipboardTransferDialog).props("request")).toBe(fresh);
  expect(fresh.isCurrent()).toBe(true);
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
  await dialogButton("Disconnect cross-sheet connections and move");
  expect(wrapper.findComponent(ShapeClipboardTransferDialog).exists()).toBe(false);
  expect(current.shapeClipboard.hasPending()).toBe(false);
  expect(named(current, "target", "moving-line").shapeConnector).toMatchObject({
    begin: { kind: "site", targetId: named(current, "target", "a").id },
    end: { kind: "free" },
  });
  expect(named(current, "source", "remaining-line").shapeConnector).toMatchObject({
    begin: { kind: "free" },
    end: { kind: "site", targetId: "b" },
  });
  await undoRedo(current, before);
});

test("source object protection rejects selection and Cut, while target protection keeps the captured Cut and both forests", async () => {
  const sourceProtected = workbook(),
    source = getActiveSheet(sourceProtected);
  source.properties.protected = true;
  source.protection = { editableRanges: [] };
  const first = await fixture(sourceProtected),
    sourceBefore = forests(first.current);
  expect(first.current.sheetGridRef.selectShapeObjects([["box"]])).toBe(false);
  await key(first.wrapper, "x", "box");
  expect(first.current.shapeClipboard.hasPending()).toBe(false);
  expect(first.current.shapeClipboard.cut([["box"]])).toBe(false);
  expect(forests(first.current)).toEqual(sourceBefore);
  expect(first.current.session.history.undoStack).toHaveLength(0);
  first.wrapper.unmount();
  mounted.splice(mounted.indexOf(first.wrapper), 1);
  const targetProtected = workbook(),
    target = targetProtected.sheets.get("target")!;
  target.properties.protected = true;
  target.protection = { editableRanges: [] };
  const { wrapper, current } = await fixture(targetProtected),
    before = forests(current);
  await cut(wrapper, current);
  const identity = current.shapeClipboard.getIdentity();
  await navigate(current, "target");
  await key(wrapper, "v");
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
  expect(wrapper.findComponent(ShapeClipboardTransferDialog).exists()).toBe(false);
});

test("a real source cell history mutation invalidates Cut even after further tab navigation", async () => {
  const { wrapper, current } = await fixture(),
    before = forests(current);
  await cut(wrapper, current);
  const identity = current.shapeClipboard.getIdentity(),
    capturedRevision = current.session.history.revision;
  expect(
    current.executeCommand({
      type: "setCellContents",
      changes: [
        {
          sheetId: "source",
          address: { row: 0, column: 0 },
          content: { kind: "literal", value: "changed after cut" },
        },
      ],
    }),
  ).toBe(true);
  await flushPromises();
  expect(current.session.history.revision).toBeGreaterThan(capturedRevision);
  await navigate(current, "target");
  await key(wrapper, "v");
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(1);
  expect(current.session.history.undoStack[0]!.command.type).toBe("setCellContents");
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
  current.undo();
  await flushPromises();
  // Returning the data to its old value still advances the document lease.
  await key(wrapper, "v");
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
});

test("unavailable native glyph alpha rejects the target proposal before either forest or history is written", async () => {
  const { wrapper, current } = await fixture(),
    before = forests(current);
  await cut(wrapper, current);
  const identity = current.shapeClipboard.getIdentity(),
    historyRevision = current.session.history.revision;
  await navigate(current, "target");
  const nativeProof = vi.mocked(textPaint.preflightShapeTextGlyphBudgets).getMockImplementation()!;
  vi.mocked(textPaint.preflightShapeTextGlyphBudgets).mockClear();
  vi.mocked(textPaint.preflightShapeTextGlyphBudgets).mockReturnValue({
    kind: "unavailable",
    reason: "asset-pixels-unavailable",
    missingAssetIds: [],
  });
  await key(wrapper, "v");
  expect(textPaint.preflightShapeTextGlyphBudgets).toHaveBeenCalled();
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.session.history.revision).toBe(historyRevision);
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
  vi.mocked(textPaint.preflightShapeTextGlyphBudgets).mockImplementation(nativeProof);
  await key(wrapper, "v");
  expect(sheet(current, "source").drawings).toEqual([]);
  expect(sheet(current, "target").drawings).toHaveLength(2);
  expect(current.session.history.undoStack).toHaveLength(1);
  expect(current.shapeClipboard.hasPending()).toBe(false);
});

test("a genuinely missing glyph paint asset is rejected by the real paint planner without consuming Cut", async () => {
  const book = workbook(),
    box = getActiveSheet(book).drawings![0]!;
  if (!isFramedShapeDrawing(box)) throw Error("Expected source TextBox");
  const missing: ShapePaint = {
    kind: "picture",
    assetId: "missing-glyph-texture",
    opacity: 1,
    rotateWithShape: true,
    layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
  };
  box.shapeText!.style = { fill: { kind: "value", value: missing } };
  const { wrapper, current } = await fixture(book),
    before = forests(current);
  await cut(wrapper, current);
  const identity = current.shapeClipboard.getIdentity();
  await navigate(current, "target");
  vi.mocked(textPaint.preflightShapeTextGlyphBudgets).mockClear();
  await key(wrapper, "v");
  expect(textPaint.preflightShapeTextGlyphBudgets).not.toHaveBeenCalled();
  expect(forests(current)).toEqual(before);
  expect(current.session.history.undoStack).toHaveLength(0);
  expect(current.shapeClipboard.getIdentity()).toEqual(identity);
});
