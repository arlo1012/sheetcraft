import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, setCellStyle, setCellValue } from "@idea10/core/workbook";
import { createCellSelection, type CellSelection } from "@idea10/sheet-engine/selection";
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

function createFixture() {
  const sheet = getActiveSheet(createWorkbook({ id: "workbook-1", sheetId: "sheet-1" }));
  let currentSheet = sheet;
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
    getSheet: () => currentSheet,
    getSelection: () => selection,
    isEditing: () => false,
    isComposing: () => false,
    onPaste: (payload) => pastes.push(payload),
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
      currentSheet = nextSheet;
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
      clearRange: undefined,
    });
    expect(fixture.feedback).toEqual(["copied", "pasted"]);
  });

  test("keeps cut source data until a matching local paste moves it", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");

    await fixture.clipboard.cutSelection();
    expect(fixture.clipboard.canPasteFormats.value).toBe(false);
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]).toMatchObject({
      kind: "all",
      clearRange: {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      },
    });
    expect(fixture.clipboard.clipboardRange.value).toBeNull();
    expect(fixture.feedback).toEqual(["readyToMove", "moved"]);
  });

  test("reports port failures without replacing pending clipboard state or pasting", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "keep pending");
    await fixture.clipboard.copySelection();
    const pendingRange = fixture.clipboard.clipboardRange.value;

    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    vi.mocked(fixture.port.write).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.cutSelection();
    expect(fixture.clipboard.clipboardRange.value).toEqual(pendingRange);

    vi.mocked(fixture.port.read).mockRejectedValueOnce(new Error("denied"));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes).toHaveLength(0);
    expect(fixture.feedback.slice(-2)).toEqual(["unavailable", "unavailable"]);
  });

  test("treats port text without the local token as external clipboard data", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "local");
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    fixture.setTransfer({ text: "external" });

    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]?.plan.values).toEqual([["external"]]);
    expect(fixture.pastes[0]).toMatchObject({ kind: "all", clearRange: undefined });
    expect(fixture.feedback.at(-1)).toBe("pasted");
  });

  test("degrades a text-only cut to copy semantics", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "safe source");
    fixture.setLocalTokenWritten(false);

    await fixture.clipboard.cutSelection();
    expect(fixture.clipboard.clipboardMode.value).toBe("copy");
    expect(fixture.feedback).toEqual(["copied"]);

    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]).toMatchObject({ kind: "all", clearRange: undefined });
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
