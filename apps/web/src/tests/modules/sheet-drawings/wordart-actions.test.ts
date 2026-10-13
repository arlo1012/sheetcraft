import { describe, expect, test, vi } from "vitest";
import { createSheet, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import {
  useWordArtActions,
  type WordArtActionOptions,
} from "../../../modules/sheet-drawings/useWordArtActions";
import { WORDART_STYLE_PRESETS } from "../../../modules/sheet-drawings/wordart-style-presets";
import { framedShape } from "./framed-shape-fixture";

function fixture() {
  let workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  let sheet = getActiveSheet(workbook),
    generation = 0,
    revision = 0,
    busy = false;
  let metrics = createPictureSheetMetrics(sheet),
    address = { row: 0, column: 0 };
  sheet.drawings = [framedShape(), createGraphicDrawing("old", "wordArt", "Legacy", address)];
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const execute = vi.fn((command: WorkbookCommand) => {
    const applied = executeWorkbookCommand(session, command);
    if (applied) revision++;
    return applied;
  });
  const flush = vi.fn(() => true),
    onInserted = vi.fn();
  const options: WordArtActionOptions = {
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => generation,
    getRevision: () => revision,
    getMetrics: () => metrics,
    getAddress: () => address,
    isBusy: () => busy,
    flush,
    replaceCollection: () => false,
    createId: () => "new",
    name: () => "艺术字",
    placeholder: () => "请输入文字",
    onInserted,
  };
  const drawingActions = useDrawingActions({ ...options, execute, name: (kind) => kind });
  options.replaceCollection = drawingActions.replaceCollection;
  const actions = useWordArtActions(options);
  return {
    actions,
    options,
    session,
    execute,
    flush,
    onInserted,
    drawingActions,
    get sheet() {
      return sheet;
    },
    get workbook() {
      return workbook;
    },
    get metrics() {
      return metrics;
    },
    change(kind: string) {
      if (kind === "workbook") workbook = createWorkbook({ id: "other", sheetId: sheet.id });
      else if (kind === "sheet") {
        sheet = createSheet("Other", sheet.id);
        workbook.sheets.set(sheet.id, sheet);
      } else if (kind === "membership")
        workbook.sheets.set(sheet.id, createSheet("Other", sheet.id));
      else if (kind === "generation") generation++;
      else if (kind === "revision") revision++;
      else if (kind === "metrics") metrics = createPictureSheetMetrics(sheet);
      else if (kind === "address") address = { row: 1, column: 2 };
      else if (kind === "busy") busy = true;
      else if (kind === "protection") sheet.properties.protected = true;
      else if (kind === "forest-order") sheet.drawings!.reverse();
      else if (kind === "same-ID") sheet.drawings![0] = { ...sheet.drawings![0]! };
      else if (kind === "source-data") {
        const root = sheet.drawings![0]!;
        if (root.kind === "shapeGroup") throw new Error("Fixture must be text-bearing");
        root.text = "changed without revision";
      } else if (kind === "handler") options.replaceCollection = () => true;
      else if (kind === "editor-handler") options.onInserted = vi.fn();
    },
  };
}
function readiness() {
  let resolve!: (value: boolean) => void;
  return {
    promise: new Promise<boolean>((done) => {
      resolve = done;
    }),
    done: (value = true) => resolve(value),
  };
}
const choice = WORDART_STYLE_PRESETS[1]!;
describe("modern WordArt owner-bound insertion", () => {
  test("uses one real Core command and history; callback owns the actual stored root; old kinds stay unchanged", async () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook);
    f.options.getFontFamily = () => "Aptos";
    expect(await f.actions.insert(choice)).toBe(true);
    const root = f.sheet.drawings![2]!;
    expect(root).toMatchObject({
      id: "new",
      kind: "shape",
      wordArt: true,
      fontSize: 96,
      text: "请输入文字",
      shapeText: { fontFamily: "Aptos" },
    });
    expect(f.onInserted).toHaveBeenCalledExactlyOnceWith(root);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]![0].type).toBe("setSheetDrawings");
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.sheet.drawings![1]).toEqual(before.sheets[0]!.drawings![1]);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });
  test("captures the operative owner after a flush changes revision and metrics", async () => {
    const f = fixture();
    f.flush.mockImplementation(() => {
      f.change("revision");
      f.change("metrics");
      return true;
    });
    expect(await f.actions.insert(choice)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test.each([
    "workbook",
    "sheet",
    "membership",
    "generation",
    "revision",
    "metrics",
    "address",
    "busy",
    "protection",
    "forest-order",
    "same-ID",
    "source-data",
    "handler",
    "editor-handler",
  ])(
    "rejects %s mutation during font readiness before any command or success callback",
    async (kind) => {
      const f = fixture(),
        font = readiness();
      f.options.prepareFont = vi.fn(() => font.promise);
      const result = f.actions.insert(choice);
      expect(f.actions.pending.value).toBe(true);
      f.change(kind);
      font.done();
      expect(await result).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.onInserted).not.toHaveBeenCalled();
      expect(f.actions.pending.value).toBe(false);
    },
  );
  test("stale rendered handlers cannot reinterpret a fresh owner at invocation", async () => {
    const f = fixture(),
      insert = f.actions.createInsertHandler();
    f.change("address");
    expect(await insert(choice)).toBe(false);
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  test("rendered handler rebases a valid owner only across its own successful flush", async () => {
    const f = fixture(),
      insert = f.actions.createInsertHandler();
    f.flush.mockImplementation(() => {
      f.change("revision");
      f.change("metrics");
      return true;
    });
    expect(await insert(choice)).toBe(true);
  });
  test("font readiness receives detached canonical data and cannot mutate the final proposal", async () => {
    const f = fixture();
    f.options.prepareFont = vi.fn((drawing: SheetFramedGraphicDrawing) => {
      expect(drawing).toMatchObject({
        kind: "shape",
        wordArt: true,
        shapeFrame: { anchor: { mode: "move-only" } },
      });
      drawing.text = "mutated readiness copy";
      drawing.shapeText!.style!.fill = { kind: "none" };
      return true;
    });
    expect(await f.actions.insert(choice)).toBe(true);
    const root = f.sheet.drawings![2]!;
    if (root.kind === "shapeGroup") throw new Error("Expected inserted WordArt leaf");
    expect(root.text).toBe("请输入文字");
    expect("shapeText" in root ? root.shapeText?.style : undefined).toEqual(choice.style);
  });
  test.each(["flush", "font-false", "font-throw", "executor-false", "executor-true-without-apply"])(
    "%s rejection creates no state, history or fabricated success",
    async (mode) => {
      const f = fixture(),
        before = serializeWorkbook(f.workbook);
      if (mode === "flush") f.flush.mockReturnValue(false);
      if (mode === "font-false") f.options.prepareFont = () => false;
      if (mode === "font-throw")
        f.options.prepareFont = () => {
          throw new Error("Font unavailable");
        };
      if (mode === "executor-false") f.execute.mockReturnValue(false);
      if (mode === "executor-true-without-apply") f.execute.mockReturnValue(true);
      expect(await f.actions.insert(choice)).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.onInserted).not.toHaveBeenCalled();
    },
  );
  test("cancellation and repeat invocation cannot publish an old pending request", async () => {
    const f = fixture(),
      font = readiness();
    f.options.prepareFont = () => font.promise;
    const first = f.actions.insert(choice);
    expect(await f.actions.insert(choice)).toBe(false);
    f.actions.cancelPending();
    font.done();
    expect(await first).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });
});
