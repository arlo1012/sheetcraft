import { shallowRef } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createCellSelection, type CellSelection } from "@sheetcraft/sheet-engine/selection";
import type {
  GridClipboardPort,
  GridClipboardTransfer,
} from "../../../../modules/sheet-grid/gridClipboardPort";
import {
  useGridClipboard,
  type GridClipboardFeedback,
  type GridPastePayload,
  type GridPasteResult,
} from "../../../../modules/sheet-grid/useGridClipboard";

function createFilteredSheet(): Sheet {
  const sheet = getActiveSheet(createWorkbook({ id: "workbook-1", sheetId: "sheet-1" }));
  setCellValue(sheet, { row: 1, column: 0 }, "one");
  setCellValue(sheet, { row: 2, column: 0 }, "hidden");
  setCellValue(sheet, { row: 3, column: 0 }, "three");
  setCellValue(sheet, { row: 4, column: 0 }, "four");
  sheet.filter = {
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 0 } },
    columns: [
      {
        column: 0,
        allowedValues: [
          { kind: "string", value: "one" },
          { kind: "string", value: "three" },
          { kind: "string", value: "four" },
        ],
      },
    ],
  };
  return sheet;
}

function createFixture(options?: { filtered?: boolean }) {
  const sheet = options?.filtered
    ? createFilteredSheet()
    : getActiveSheet(createWorkbook({ id: "workbook-plain", sheetId: "sheet-plain" }));
  const sheetRef = shallowRef(sheet);
  let selection: CellSelection = createCellSelection({ row: 0, column: 0 });
  let transfer: GridClipboardTransfer = {};
  let revision = 0;
  let pasteResult: GridPasteResult = { ok: true };
  const feedback: GridClipboardFeedback[] = [];
  const pastes: GridPastePayload[] = [];
  const port: GridClipboardPort = {
    write: vi.fn(async (nextTransfer) => {
      transfer = nextTransfer;
      return { localTokenWritten: true };
    }),
    read: vi.fn(async () => transfer),
  };
  const clipboard = useGridClipboard({
    getSheet: () => sheetRef.value,
    getSelection: () => selection,
    getRevision: () => revision,
    isEditing: () => false,
    isComposing: () => false,
    clipboardPort: port,
    onFeedback: (message) => feedback.push(message),
    onPaste: (payload) => {
      pastes.push(payload);
      return pasteResult;
    },
  });

  return {
    clipboard,
    feedback,
    pastes,
    port,
    sheet,
    setPasteResult(value: GridPasteResult) {
      pasteResult = value;
    },
    setRevision(value: number) {
      revision = value;
    },
    setSelection(value: CellSelection) {
      selection = value;
    },
    setTransfer(value: GridClipboardTransfer) {
      transfer = value;
    },
  };
}

function selectRows(start: number, end: number): CellSelection {
  return {
    active: { row: start, column: 0 },
    anchor: { row: start, column: 0 },
    focus: { row: end, column: 0 },
    mode: "cells",
  };
}

describe("useGridClipboard filtered rows", () => {
  test("copies only visible source rows while retaining their physical source rows", async () => {
    const fixture = createFixture({ filtered: true });
    fixture.setSelection(selectRows(1, 4));

    await fixture.clipboard.copySelection();

    expect(vi.mocked(fixture.port.write).mock.calls[0]?.[0].text).toBe("one\r\nthree\r\nfour");
    fixture.setSelection(createCellSelection({ row: 1, column: 2 }));
    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toEqual([
      expect.objectContaining({
        kind: "all",
        sourceRange: { start: { row: 1, column: 0 }, end: { row: 4, column: 0 } },
        sourceRows: [1, 3, 4],
        contents: [
          [{ kind: "literal", value: "one" }],
          [{ kind: "literal", value: "three" }],
          [{ kind: "literal", value: "four" }],
        ],
        plan: {
          anchor: { row: 1, column: 2 },
          range: { start: { row: 1, column: 2 }, end: { row: 4, column: 2 } },
          rows: [1, 3, 4],
          preserveHiddenRows: true,
          values: [["one"], ["three"], ["four"]],
        },
      }),
    ]);
  });

  test("pastes a single external cell over visible target rows only", async () => {
    const fixture = createFixture({ filtered: true });
    fixture.setSelection(selectRows(1, 4));
    fixture.setTransfer({ text: "x" });

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toEqual([
      expect.objectContaining({
        kind: "all",
        plan: {
          anchor: { row: 1, column: 0 },
          range: { start: { row: 1, column: 0 }, end: { row: 4, column: 0 } },
          rows: [1, 3, 4],
          preserveHiddenRows: true,
          values: [["x"], ["x"], ["x"]],
        },
      }),
    ]);
  });

  test("rejects a multi-cell matrix that does not fit the visible target-row count", async () => {
    const fixture = createFixture({ filtered: true });
    fixture.setSelection(selectRows(1, 4));
    fixture.setTransfer({ text: "first\r\nsecond" });

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toEqual([]);
    expect(fixture.feedback).toEqual(["rangeMismatch"]);
  });

  test("does not offer or prepare a cut spanning hidden rows", async () => {
    const fixture = createFixture({ filtered: true });
    fixture.setSelection(selectRows(1, 4));

    expect(fixture.clipboard.cutDisabledReason.value).toBe("filteredCutUnsupported");
    await fixture.clipboard.cutSelection();

    expect(fixture.port.write).not.toHaveBeenCalled();
    expect(fixture.clipboard.clipboardMode.value).toBeNull();
    expect(fixture.feedback).toEqual(["filteredCutUnsupported"]);
  });

  test("does not offer a cut whose edge borders a hidden row", async () => {
    const fixture = createFixture({ filtered: true });
    fixture.setSelection(createCellSelection({ row: 1, column: 0 }));

    expect(fixture.clipboard.cutDisabledReason.value).toBe("filteredCutUnsupported");
    await fixture.clipboard.cutSelection();

    expect(fixture.port.write).not.toHaveBeenCalled();
    expect(fixture.feedback).toEqual(["filteredCutUnsupported"]);
  });

  test("keeps a cut pending when its target borders a hidden row", async () => {
    const fixture = createFixture({ filtered: true });
    fixture.setSelection(createCellSelection({ row: 4, column: 0 }));
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 1, column: 0 }));

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toEqual([]);
    expect(fixture.clipboard.clipboardMode.value).toBe("cut");
    expect(fixture.feedback).toEqual(["readyToMove", "filteredCutUnsupported"]);
  });

  test("rejects a clipboard source that intersects merged cells", async () => {
    const fixture = createFixture();
    fixture.sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }];
    fixture.setSelection(createCellSelection({ row: 0, column: 0 }));

    await fixture.clipboard.copySelection();

    expect(fixture.port.write).not.toHaveBeenCalled();
    expect(fixture.feedback).toEqual(["mergedRangeUnsupported"]);
  });

  test("keeps a pending cut when the paste command rejects its atomic move", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    await fixture.clipboard.cutSelection();
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));
    fixture.setPasteResult({ ok: false, reason: "pasteRejected" });

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toHaveLength(1);
    expect(fixture.clipboard.clipboardMode.value).toBe("cut");
    expect(fixture.clipboard.clipboardRange.value).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 0, column: 0 },
    });
    expect(fixture.feedback).toEqual(["readyToMove", "pasteRejected"]);
  });

  test("cancels an async clipboard read when the document revision changes", async () => {
    const fixture = createFixture();
    let resolveRead: ((value: GridClipboardTransfer) => void) | undefined;
    vi.mocked(fixture.port.read).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );

    const paste = fixture.clipboard.pasteSelection();
    fixture.setRevision(1);
    resolveRead?.({ text: "stale" });
    await paste;

    expect(fixture.pastes).toEqual([]);
    expect(fixture.feedback).toEqual(["documentChanged"]);
  });

  test("allows a copied snapshot to paste after an intervening document change", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "snapshot");
    await fixture.clipboard.copySelection();
    fixture.setRevision(1);
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toHaveLength(1);
    expect(fixture.feedback).toEqual(["copied", "pasted"]);
  });

  test("refuses a cut after its document revision changes without clearing the source", async () => {
    const fixture = createFixture();
    setCellValue(fixture.sheet, { row: 0, column: 0 }, "move");
    await fixture.clipboard.cutSelection();
    fixture.setRevision(1);
    fixture.setSelection(createCellSelection({ row: 2, column: 2 }));

    await fixture.clipboard.pasteSelection();

    expect(fixture.pastes).toEqual([]);
    expect(fixture.clipboard.clipboardMode.value).toBe("cut");
    expect(fixture.feedback).toEqual(["readyToMove", "documentChanged"]);
  });
});
