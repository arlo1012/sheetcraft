import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  createSheetEvaluator,
  getActiveSheet,
  getColumnWidth,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { createAxisToolActions } from "../../../../modules/sheet-grid/axis-tool-actions";

const font = "Noto Sans Symbols 2";
const state = vi.hoisted(() => ({
  ready: new Set<string>(),
  load: vi.fn<(family: string) => Promise<void>>(),
}));
vi.mock("../../../../shared/cell-text/font-resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../shared/cell-text/font-resources")>()),
  cellFontResourceNeedsLoading: (family: string) => !state.ready.has(family),
  ensureCellFontResource: state.load,
}));

beforeEach(() => {
  state.ready.clear();
  state.load.mockReset().mockImplementation(async (family) => {
    state.ready.add(family);
  });
});

function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  let activeSheet = sheet;
  let generation = 0;
  let revision = 0;
  const error = vi.fn();
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) =>
    executeWorkbookCommand(session, command),
  );
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    {
      kind: "literal",
      value: "aΩ",
      fontRuns: [{ start: 1, end: 2, fontFamily: font }],
    },
  );
  setCellStyle(sheet, { row: 0, column: 0 }, { fontFamily: "Arial", fontSize: 10 });
  const actions = createAxisToolActions({
    getSheet: () => activeSheet,
    getEvaluator: () => createSheetEvaluator(activeSheet),
    getGeneration: () => generation,
    getRevision: () => revision,
    getDateSystem: () => "1900",
    getLocale: () => "en-US",
    measurer: {
      measure: (text, measuredFont) =>
        text.length * (measuredFont.family === font && state.ready.has(font) ? 30 : 10),
    },
    flushPendingEdits: () => true,
    execute,
    onError: error,
  });
  return {
    sheet,
    session,
    actions,
    execute,
    error,
    switchSheet: () => {
      activeSheet = createSheet("Other", "other");
    },
    changeGeneration: () => {
      generation++;
    },
    changeRevision: () => {
      revision++;
    },
  };
}

const payload = () => ({
  axis: "column" as const,
  range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
});

describe("font-ready AutoFit commands", () => {
  test("awaits the actual font and then measures the original target into one undoable command", async () => {
    const f = fixture();
    const original = getColumnWidth(f.sheet, 0);
    let resolve!: () => void;
    state.load.mockImplementation(
      (family) =>
        new Promise<void>((done) => {
          resolve = () => {
            state.ready.add(family);
            done();
          };
        }),
    );
    const target = payload();
    const pending = f.actions.autoFit(target);
    expect(f.execute).not.toHaveBeenCalled();
    expect(state.load).toHaveBeenCalledExactlyOnceWith(font);
    target.range.start.column = 1;
    target.range.end.column = 1;
    resolve();
    await pending;
    expect(getColumnWidth(f.sheet, 0)).toBe(46);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    undoWorkbookCommand(f.session);
    expect(getColumnWidth(f.sheet, 0)).toBe(original);
  });

  test.each(["sheet", "owner", "revision"])(
    "drops a delayed command if its %s changed",
    async (changed) => {
      const f = fixture();
      let resolve!: () => void;
      state.load.mockImplementation(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      );
      const pending = f.actions.autoFit(payload());
      if (changed === "sheet") f.switchSheet();
      if (changed === "owner") f.changeGeneration();
      if (changed === "revision") f.changeRevision();
      resolve();
      await pending;
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.error).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test("a later dimension action cancels pending AutoFit even without a document revision event", async () => {
    const f = fixture();
    let resolve!: () => void;
    state.load.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const pending = f.actions.autoFit(payload());
    f.actions.resize({ axis: "column", index: 0, count: 1, size: 123 });
    resolve();
    await pending;
    expect(getColumnWidth(f.sheet, 0)).toBe(123);
    expect(f.execute).toHaveBeenCalledTimes(1);
  });

  test("does not apply fallback measurements when an owned font cannot be restored", async () => {
    const f = fixture();
    state.load.mockRejectedValue(new Error("missing font resource"));
    await f.actions.autoFit(payload());
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.error).toHaveBeenCalledTimes(1);
  });

  test("plain system-font AutoFit still executes synchronously and requests no resource", async () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 0, column: 0 }, { kind: "literal", value: "abc" });
    setCellStyle(f.sheet, { row: 0, column: 0 }, { fontFamily: "Wingdings" });
    const pending = f.actions.autoFit(payload());
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(state.load).not.toHaveBeenCalled();
    await pending;
  });

  test("hidden or merged cells do not cause font loading", async () => {
    const f = fixture();
    (f.sheet.hiddenRows ??= new Set()).add(0);
    await f.actions.autoFit(payload());
    f.sheet.hiddenRows.clear();
    f.sheet.mergedCells.push({ start: { row: 0, column: 0 }, end: { row: 0, column: 1 } });
    await f.actions.autoFit(payload());
    expect(state.load).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
