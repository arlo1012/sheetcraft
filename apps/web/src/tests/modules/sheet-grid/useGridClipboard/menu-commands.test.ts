import { nextTick, shallowRef } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellHyperlink,
  setCellNamedStyle,
  setCellNote,
  setCellContent,
  setCellStyle,
  setCellValue,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import {
  createAxisSelection,
  createCellSelection,
  type CellSelection,
} from "@sheetcraft/sheet-engine/selection";
import type {
  GridClipboardPort,
  GridClipboardTransfer,
} from "../../../../modules/sheet-grid/gridClipboardPort";
import {
  useGridClipboard,
  type GridClipboardFeedback,
  type GridPastePayload,
} from "../../../../modules/sheet-grid/useGridClipboard";

function createTextPasteEvent(text: string): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      types: ["text/plain"],
      getData: (format: string) => (format === "text/plain" ? text : ""),
    },
  });
  return event;
}

function createNativeClipboardWriteEvent(type: "copy" | "cut"): {
  event: ClipboardEvent;
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      setData: (format: string, value: string) => data.set(format, value),
    },
  });
  return { event, data };
}

function createFixture(options?: { evaluator?: SheetEvaluator }) {
  const sheet = getActiveSheet(createWorkbook({ id: "workbook-1", sheetId: "sheet-1" }));
  const currentSheet = shallowRef(sheet);
  let selection: CellSelection = createCellSelection({ row: 0, column: 0 });
  let transfer: GridClipboardTransfer = {};
  let localTokenWritten = true;
  const feedback: GridClipboardFeedback[] = [];
  const pastes: GridPastePayload[] = [];
  const port: GridClipboardPort = {
    write: vi.fn(async (nextTransfer) => {
      transfer = localTokenWritten ? nextTransfer : { text: nextTransfer.text };
      return { localTokenWritten };
    }),
    read: vi.fn(async () => transfer),
  };
  const clipboard = useGridClipboard({
    getSheet: () => currentSheet.value,
    getEvaluator: options?.evaluator ? () => options.evaluator! : undefined,
    getSelection: () => selection,
    isEditing: () => false,
    isComposing: () => false,
    onPaste: (payload) => {
      pastes.push(payload);
      return { ok: true };
    },
    onFeedback: (message) => feedback.push(message),
    clipboardPort: port,
  });

  return {
    clipboard,
    feedback,
    pastes,
    port,
    setSelection(nextSelection: CellSelection) {
      selection = nextSelection;
    },
    setSheet(nextSheet: typeof sheet) {
      currentSheet.value = nextSheet;
    },
    setTransfer(nextTransfer: GridClipboardTransfer) {
      transfer = nextTransfer;
    },
    setLocalTokenWritten(value: boolean) {
      localTokenWritten = value;
    },
    sheet,
  };
}

describe("useGridClipboard menu commands", () => {
  test("deferred native text cannot discard matching async invalid-picture status", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copySelection();
    fixture.setTransfer({ text: "Picture caption", invalidFloatingImage: true });
    fixture.clipboard.onPaste(createTextPasteEvent("Picture caption"));
    await vi.waitFor(() => expect(fixture.feedback).toContain("pasteRejected"));
    expect(fixture.pastes).toEqual([]);
  });
  test("invalid rich picture metadata cannot fall back to its alt text as cell values", async () => {
    const fixture = createFixture();
    fixture.setTransfer({ text: "Must not become cell data", invalidFloatingImage: true });
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes).toEqual([]);
    expect(fixture.feedback).toContain("pasteRejected");
  });
  test("copies selected rows through their finite used column extent", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 3, column: 2 }, "row value");
    fixture.setSelection(createAxisSelection("rows", { row: 3, column: 0 }));

    await fixture.clipboard.copySelection();

    expect(vi.mocked(fixture.port.write).mock.calls[0]?.[0].text).toBe("\t\trow value");
    expect(fixture.clipboard.clipboardRange.value).toEqual({
      start: { row: 3, column: 0 },
      end: { row: 3, column: 2 },
    });
  });

  test("copies selected columns through their finite used row extent", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 3, column: 2 }, "column value");
    fixture.setSelection(createAxisSelection("columns", { row: 0, column: 2 }));

    await fixture.clipboard.copySelection();

    expect(vi.mocked(fixture.port.write).mock.calls[0]?.[0].text).toBe("\r\n\r\n\r\ncolumn value");
    expect(fixture.clipboard.clipboardRange.value).toEqual({
      start: { row: 0, column: 2 },
      end: { row: 3, column: 2 },
    });
  });

  test("pastes a row selection from column zero and tiles across selected rows", async () => {
    const fixture = createFixture();
    fixture.setTransfer({ text: "A\tB" });
    fixture.setSelection({
      ...createAxisSelection("rows", { row: 5, column: 0 }),
      focus: { row: 6, column: 0 },
    });

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      plan: {
        anchor: { row: 5, column: 0 },
        range: { start: { row: 5, column: 0 }, end: { row: 6, column: 1 } },
        values: [
          ["A", "B"],
          ["A", "B"],
        ],
      },
    });
  });

  test("moves a cut column to the destination column while preserving row-zero offsets", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 2, column: 1 }, "move");
    fixture.setSelection(createAxisSelection("columns", { row: 0, column: 1 }));
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createAxisSelection("columns", { row: 0, column: 4 }));

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      moveSource: { start: { row: 0, column: 1 }, end: { row: 2, column: 1 } },
      plan: {
        anchor: { row: 0, column: 4 },
        range: { start: { row: 0, column: 4 }, end: { row: 2, column: 4 } },
      },
    });
  });

  test("extends a copied column through sparse destination tail cells so they are cleared", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 2, column: 1 }, "source");
    setCellValue(fixture.sheet, { row: 5, column: 4 }, "tail");
    fixture.setSelection(createAxisSelection("columns", { row: 0, column: 1 }));
    await fixture.clipboard.copySelection();
    fixture.setSelection(createAxisSelection("columns", { row: 0, column: 4 }));

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      sourceRange: { start: { row: 0, column: 1 }, end: { row: 5, column: 1 } },
      plan: {
        range: { start: { row: 0, column: 4 }, end: { row: 5, column: 4 } },
        values: [[null], [null], ["source"], [null], [null], [null]],
      },
    });
  });

  test("uses the guarded pending cut when menu clipboard reads are unavailable", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));
    vi.mocked(fixture.port.read).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      moveSource: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
    });
  });

  test("clears pending cut after an externally known menu paste", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    await fixture.clipboard.cutSelection();
    fixture.setTransfer({ text: "external" });
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]).not.toHaveProperty("moveSource");
    expect(fixture.clipboard.clipboardMode.value).toBeNull();
  });
  test("retains raw local formula content and its source range for a copied paste", async () => {
    const fixture = createFixture();
    setCellContent(
      fixture.sheet,
      { row: 0, column: 1 },
      {
        kind: "formula",
        formula: { source: "=A1 + 1" },
      },
    );

    fixture.setSelection(createCellSelection({ row: 0, column: 1 }));
    await fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 3 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toEqual([
      expect.objectContaining({
        kind: "all",
        contents: [[{ kind: "formula", formula: { source: "=A1 + 1" } }]],
        sourceRange: { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
      }),
    ]);
  });

  test("copies values and styles through the system port", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "source");
    setCellStyle(fixture.sheet, { row: 0, column: 0 }, { bold: true });

    await fixture.clipboard.copySelection();
    expect(fixture.port.write).toHaveBeenCalledOnce();
    const written = vi.mocked(fixture.port.write).mock.calls[0]?.[0];
    expect(written?.text).toBe("source");
    expect(written?.localToken).toBeTruthy();
    expect(fixture.clipboard.clipboardRange.value).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    });

    fixture.setSelection({
      active: { row: 2, column: 2 },
      anchor: { row: 2, column: 2 },
      focus: { row: 3, column: 3 },
      mode: "cells",
    });
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]?.kind).toBe("all");
    expect(fixture.pastes[0]?.plan.anchor).toEqual({ row: 2, column: 2 });
    expect(fixture.pastes[0]?.plan.values).toEqual([
      ["source", "source"],
      ["source", "source"],
    ]);
    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      styles: [
        [{ bold: true }, { bold: true }],
        [{ bold: true }, { bold: true }],
      ],
    });
    expect(fixture.pastes[0]).not.toHaveProperty("moveSource");
    expect(fixture.feedback).toEqual(["copied", "pasted"]);
  });

  test("retains local hyperlink and named-style metadata for an ordinary paste", async () => {
    const fixture = createFixture();
    const source = { row: 0, column: 0 };
    setCellValue(fixture.sheet, source, "source");
    setCellNamedStyle(
      fixture.sheet,
      source,
      { bold: true },
      { styleId: "report-label", includes: ["font"] },
    );
    setCellHyperlink(fixture.sheet, source, {
      target: "https://example.com/report",
      tooltip: "Open report",
    });
    setCellNote(fixture.sheet, source, { text: "Check this", author: "Ada" });

    await fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 3 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      namedStyles: [[{ styleId: "report-label", includes: ["font"] }]],
      hyperlinks: [[{ target: "https://example.com/report", tooltip: "Open report" }]],
      notes: [[{ text: "Check this", author: "Ada" }]],
    });
  });

  test("uses an injected workbook evaluator for formula copy values", async () => {
    const evaluator: SheetEvaluator = { getComputedValue: vi.fn(() => 42) };
    const fixture = createFixture({ evaluator });
    setCellContent(
      fixture.sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1" },
      },
    );

    await fixture.clipboard.copySelection();

    expect(evaluator.getComputedValue).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(vi.mocked(fixture.port.write).mock.calls[0]?.[0].text).toBe("42");
  });

  test("uses an internal copy repeatedly when clipboard reads fail after document changes", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "copy");
    await fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    vi.mocked(fixture.port.read).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.pasteSelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));
    vi.mocked(fixture.port.read).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes).toHaveLength(2);
    expect(fixture.pastes.every((paste) => !Object.hasOwn(paste, "moveSource"))).toBe(true);
  });

  test("does not run a rejected-read fallback after the captured document revision changes", async () => {
    let revision = 0;
    const sheet = getActiveSheet(createWorkbook({ id: "revision", sheetId: "sheet" }));
    let selection = createCellSelection({ row: 0, column: 0 });
    const port: GridClipboardPort = {
      write: async () => ({ localTokenWritten: false }),
      read: async () => Promise.reject(new Error("denied")),
    };
    const feedback: GridClipboardFeedback[] = [];
    const clipboard = useGridClipboard({
      getSheet: () => sheet,
      getSelection: () => selection,
      getRevision: () => revision,
      isEditing: () => false,
      isComposing: () => false,
      onPaste: () => ({ ok: true }),
      onFeedback: (message) => feedback.push(message),
      clipboardPort: port,
    });
    setCellValue(sheet, { row: 0, column: 0 }, "cut");
    await clipboard.cutSelection();
    selection = createCellSelection({ row: 1, column: 1 });
    const paste = clipboard.pasteSelection();
    revision += 1;
    await paste;
    expect(feedback.at(-1)).toBe("documentChanged");
    expect(clipboard.clipboardMode.value).toBe("cut");
  });

  test("keeps cut source data until a matching local paste moves it", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");

    await fixture.clipboard.cutSelection();
    expect(fixture.clipboard.canPasteFormats.value).toBe(false);
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toEqual({
      kind: "all",
      plan: {
        anchor: { row: 1, column: 1 },
        range: { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
        values: [["move"]],
      },
      moveSource: {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      },
    });
    expect(fixture.clipboard.clipboardRange.value).toBeNull();
    expect(fixture.feedback).toEqual(["readyToMove", "moved"]);
  });

  test("waits for a native rich metadata upgrade before menu paste reads its token", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    let resolveNativeWrite: (() => void) | undefined;
    fixture.port.writeNativeRich = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveNativeWrite = resolve;
        }),
    );
    const cut = createNativeClipboardWriteEvent("cut");

    fixture.clipboard.onCut(cut.event);
    fixture.setTransfer({
      text: "move",
      localToken: cut.data.get("application/x-sheetcraft-cells"),
    });
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));
    const paste = fixture.clipboard.pasteSelection();
    await Promise.resolve();
    expect(fixture.port.read).not.toHaveBeenCalled();

    resolveNativeWrite?.();
    await paste;

    expect(fixture.port.writeNativeRich).toHaveBeenCalledOnce();
    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      moveSource: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
    });
    expect(fixture.clipboard.clipboardMode.value).toBeNull();
  });

  test("keeps a native cut pending when its rich metadata upgrade fails", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    fixture.port.writeNativeRich = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const cut = createNativeClipboardWriteEvent("cut");

    fixture.clipboard.onCut(cut.event);
    await Promise.resolve();

    expect(fixture.port.writeNativeRich).toHaveBeenCalledOnce();
    expect(fixture.clipboard.clipboardMode.value).toBe("cut");
    expect(fixture.feedback).toEqual(["readyToMove"]);

    fixture.setTransfer({
      text: "move",
      localToken: cut.data.get("application/x-sheetcraft-cells"),
    });
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toHaveProperty("moveSource");
    expect(fixture.feedback).toEqual(["readyToMove", "moved"]);
  });

  test("clears a pending local cut when the active sheet changes", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    await fixture.clipboard.cutSelection();

    fixture.setSheet(getActiveSheet(createWorkbook({ id: "workbook-2", sheetId: "sheet-2" })));
    await nextTick();

    expect(fixture.clipboard.clipboardMode.value).toBeNull();
    expect(fixture.clipboard.clipboardRange.value).toBeNull();

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).not.toHaveProperty("moveSource");
    expect(fixture.feedback).toEqual(["readyToMove", "pasted"]);
  });

  test("keeps a failed menu cut internally and moves it when menu reading is unavailable", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "keep pending");
    await fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    vi.mocked(fixture.port.write).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.cutSelection();
    expect(fixture.clipboard.clipboardMode.value).toBe("cut");

    vi.mocked(fixture.port.read).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]).toHaveProperty("moveSource");
    expect(fixture.feedback.at(-1)).toBe("moved");
  });

  test("treats port text without the local token as external clipboard data", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "local");
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    fixture.setTransfer({ text: "external" });

    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]?.plan.values).toEqual([["external"]]);
    expect(fixture.pastes[0]).not.toHaveProperty("moveSource");
    expect(fixture.feedback.at(-1)).toBe("pasted");
  });

  test("keeps a text-only cut for a failed-read fallback but not a known external paste", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "safe source");
    fixture.setLocalTokenWritten(false);

    await fixture.clipboard.cutSelection();
    expect(fixture.clipboard.clipboardMode.value).toBe("cut");
    expect(fixture.feedback).toEqual(["readyToMove"]);

    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]).not.toHaveProperty("moveSource");
    expect(fixture.clipboard.clipboardMode.value).toBeNull();
  });

  test("pastes only values without forwarding local formatting", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, 42);
    setCellStyle(fixture.sheet, { row: 0, column: 0 }, { italic: true });
    await fixture.clipboard.copySelection();

    fixture.setSelection(createCellSelection({ row: 2, column: 3 }));
    await fixture.clipboard.pasteValuesSelection();

    expect(fixture.pastes).toEqual([
      {
        kind: "values",
        plan: {
          anchor: { row: 2, column: 3 },
          range: { start: { row: 2, column: 3 }, end: { row: 2, column: 3 } },
          values: [[42]],
        },
      },
    ]);
    expect(fixture.feedback).toEqual(["copied", "valuesPasted"]);
  });

  test("keeps named-style metadata with formats only but excludes hyperlinks", async () => {
    const fixture = createFixture();
    const source = { row: 0, column: 0 };
    setCellNamedStyle(
      fixture.sheet,
      source,
      { italic: true },
      { styleId: "note", includes: ["font"] },
    );
    setCellHyperlink(fixture.sheet, source, { target: "https://example.com/note" });
    await fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 3 }));

    await fixture.clipboard.pasteFormatsSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "formats",
      namedStyles: [[{ styleId: "note", includes: ["font"] }]],
    });
    expect(fixture.pastes[0]).not.toHaveProperty("hyperlinks");
  });

  test("pastes tiled local formatting and revalidates the clipboard token", async () => {
    const fixture = createFixture();
    setCellStyle(fixture.sheet, { row: 0, column: 0 }, { bold: true });
    await fixture.clipboard.copySelection();
    expect(fixture.clipboard.canPasteFormats.value).toBe(true);

    fixture.setSelection({
      active: { row: 2, column: 2 },
      anchor: { row: 2, column: 2 },
      focus: { row: 3, column: 3 },
      mode: "cells",
    });
    await fixture.clipboard.pasteFormatsSelection();
    expect(fixture.pastes[0]).toEqual({
      kind: "formats",
      conditionalFormats: [],
      sourceRange: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      sourceRows: undefined,
      plan: {
        anchor: { row: 2, column: 2 },
        range: { start: { row: 2, column: 2 }, end: { row: 3, column: 3 } },
        values: [
          [null, null],
          [null, null],
        ],
      },
      styles: [
        [{ bold: true }, { bold: true }],
        [{ bold: true }, { bold: true }],
      ],
      namedStyles: [
        [null, null],
        [null, null],
      ],
    });

    fixture.setTransfer({ text: "replaced" });
    await fixture.clipboard.pasteFormatsSelection();
    expect(fixture.pastes).toHaveLength(1);
    expect(fixture.feedback.at(-1)).toBe("formatsUnavailable");
  });

  test("keeps format paste unavailable when only plain text was written", async () => {
    const fixture = createFixture();
    fixture.setLocalTokenWritten(false);

    await fixture.clipboard.copySelection();
    expect(fixture.clipboard.canPasteFormats.value).toBe(false);
    await fixture.clipboard.pasteFormatsSelection();

    expect(fixture.pastes).toHaveLength(0);
    expect(fixture.feedback).toEqual(["copied", "formatsUnavailable"]);
  });

  test("pastes values from external text", async () => {
    const fixture = createFixture();
    fixture.setTransfer({ text: "external\t17" });
    fixture.setSelection(createCellSelection({ row: 4, column: 1 }));

    await fixture.clipboard.pasteValuesSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "values",
      plan: { anchor: { row: 4, column: 1 }, values: [["external", 17]] },
    });
    expect(fixture.feedback).toEqual(["valuesPasted"]);
  });

  test("revalidates a filtered native paste event through the async clipboard", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "rich source");
    setCellStyle(fixture.sheet, { row: 0, column: 0 }, { bold: true });
    await fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));

    fixture.clipboard.onPaste(createTextPasteEvent("rich source"));
    await vi.waitFor(() => expect(fixture.pastes).toHaveLength(1));

    expect(fixture.port.read).toHaveBeenCalledWith({ preferAsync: true });
    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      plan: { anchor: { row: 2, column: 2 }, values: [["rich source"]] },
      styles: [[{ bold: true }]],
    });
  });

  test("falls back to event text when async clipboard revalidation is denied", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copySelection();
    vi.mocked(fixture.port.read).mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    fixture.setSelection(createCellSelection({ row: 3, column: 1 }));

    fixture.clipboard.onPaste(createTextPasteEvent("external"));
    await vi.waitFor(() => expect(fixture.pastes).toHaveLength(1));

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      plan: { anchor: { row: 3, column: 1 }, values: [["external"]] },
      styles: undefined,
    });
  });

  test("keeps captured event text when async revalidation sees newer clipboard text", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copySelection();
    fixture.setTransfer({ text: "newer clipboard text" });
    fixture.setSelection(createCellSelection({ row: 3, column: 1 }));

    fixture.clipboard.onPaste(createTextPasteEvent("captured event text"));
    await vi.waitFor(() => expect(fixture.pastes).toHaveLength(1));

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      plan: { anchor: { row: 3, column: 1 }, values: [["captured event text"]] },
      styles: undefined,
    });
  });

  test("does not turn a captured external paste into a delayed local cut move", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "local old");
    setCellStyle(fixture.sheet, { row: 0, column: 0 }, { bold: true });
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 3, column: 1 }));

    fixture.clipboard.onPaste(createTextPasteEvent("external captured"));
    await vi.waitFor(() => expect(fixture.pastes).toHaveLength(1));

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      plan: { anchor: { row: 3, column: 1 }, values: [["external captured"]] },
      styles: undefined,
    });
    expect(fixture.pastes[0]).not.toHaveProperty("moveSource");
    expect(fixture.clipboard.clipboardMode.value).toBeNull();
    expect(fixture.feedback).toEqual(["readyToMove", "pasted"]);
  });

  test("does not apply a delayed native paste after clipboard state is cleared", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copySelection();
    let resolveRead: ((transfer: GridClipboardTransfer) => void) | undefined;
    vi.mocked(fixture.port.read).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );

    fixture.clipboard.onPaste(createTextPasteEvent("captured"));
    fixture.clipboard.clearPendingClipboard();
    resolveRead?.({ text: "captured" });
    await vi.waitFor(() => expect(fixture.port.read).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(fixture.pastes).toHaveLength(0);
    expect(fixture.feedback).toEqual(["copied"]);
  });

  test("does not restore a delayed write after clipboard state is cleared", async () => {
    const fixture = createFixture();
    let resolveWrite: ((result: { localTokenWritten: boolean }) => void) | undefined;
    vi.mocked(fixture.port.write).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const copy = fixture.clipboard.copySelection();
    fixture.clipboard.clearPendingClipboard();
    resolveWrite?.({ localTokenWritten: true });
    await copy;

    expect(fixture.clipboard.clipboardRange.value).toBeNull();
    expect(fixture.feedback).toEqual([]);
  });

  test("keeps the newest result when clipboard writes resolve out of order", async () => {
    const fixture = createFixture();
    let resolveFirst: ((result: { localTokenWritten: boolean }) => void) | undefined;
    let resolveSecond: ((result: { localTokenWritten: boolean }) => void) | undefined;
    vi.mocked(fixture.port.write)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const firstCopy = fixture.clipboard.copySelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    const secondCopy = fixture.clipboard.copySelection();
    resolveSecond?.({ localTokenWritten: true });
    await secondCopy;
    resolveFirst?.({ localTokenWritten: true });
    await firstCopy;

    expect(fixture.clipboard.clipboardRange.value).toEqual({
      start: { row: 1, column: 1 },
      end: { row: 1, column: 1 },
    });
    expect(fixture.feedback).toEqual(["copied"]);
  });

  test("does not restore a delayed write after its sheet changes", async () => {
    const fixture = createFixture();
    let resolveWrite: ((result: { localTokenWritten: boolean }) => void) | undefined;
    vi.mocked(fixture.port.write).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const copy = fixture.clipboard.copySelection();
    fixture.setSheet(getActiveSheet(createWorkbook({ id: "workbook-2", sheetId: "sheet-2" })));
    resolveWrite?.({ localTokenWritten: true });
    await copy;

    expect(fixture.clipboard.clipboardRange.value).toBeNull();
    expect(fixture.feedback).toEqual([]);
  });

  test("does not apply a delayed paste after its sheet changes", async () => {
    const fixture = createFixture();
    let resolveRead: ((transfer: GridClipboardTransfer) => void) | undefined;
    vi.mocked(fixture.port.read).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );

    const paste = fixture.clipboard.pasteSelection();
    fixture.setSheet(getActiveSheet(createWorkbook({ id: "workbook-2", sheetId: "sheet-2" })));
    resolveRead?.({ text: "stale" });
    await paste;

    expect(fixture.pastes).toHaveLength(0);
    expect(fixture.feedback).toEqual([]);
  });
});
