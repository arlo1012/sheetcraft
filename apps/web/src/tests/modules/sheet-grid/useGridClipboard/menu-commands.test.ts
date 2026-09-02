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
      transfer = nextTransfer;
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

    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));
    await fixture.clipboard.pasteSelection();
    expect(fixture.pastes[0]?.plan.anchor).toEqual({ row: 2, column: 2 });
    expect(fixture.pastes[0]?.plan.values).toEqual([["source"]]);
    expect(fixture.pastes[0]?.styles).toEqual([[{ bold: true }]]);
    expect(fixture.pastes[0]?.clearRange).toBeUndefined();
    expect(fixture.feedback).toEqual(["copied", "pasted"]);
  });

  test("keeps cut source data until a matching local paste moves it", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");

    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 1 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes[0]?.clearRange).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
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
    expect(fixture.pastes[0]?.clearRange).toBeUndefined();
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
    expect(fixture.pastes[0]?.clearRange).toBeUndefined();
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
