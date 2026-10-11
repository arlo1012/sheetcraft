import { describe, expect, test, vi } from "vitest";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSetCellContentCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { getActiveSheet, getCellContent } from "@sheetcraft/core/workbook";
import { createCellSelection, type CellSelection } from "@sheetcraft/sheet-engine/selection";
import type {
  GridClipboardPort,
  GridClipboardTransfer,
} from "../../../../modules/sheet-grid/gridClipboardPort";
import {
  useGridClipboard,
  type GridClipboardFeedback,
  type GridPastePayload,
} from "../../../../modules/sheet-grid/useGridClipboard";

function fixture(
  options: {
    onPasteTransfer?: Parameters<typeof useGridClipboard>[0]["onPasteTransfer"];
    onPreparedSelection?: () => void;
  } = {},
) {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  let selection: CellSelection = createCellSelection({ row: 2, column: 3 });
  let transfer: GridClipboardTransfer = {};
  let editing = false;
  const pastes: GridPastePayload[] = [];
  const feedback: GridClipboardFeedback[] = [];
  const port: GridClipboardPort = {
    read: vi.fn(async () => transfer),
    write: vi.fn(async () => ({ localTokenWritten: true })),
  };
  const clipboard = useGridClipboard({
    getSheet: () => sheet,
    getRevision: () => session.history.revision,
    getSelection: () => selection,
    isEditing: () => editing,
    isComposing: () => false,
    clipboardPort: port,
    onPaste: (payload) => {
      pastes.push(payload);
      return { ok: true };
    },
    onFeedback: (message) => feedback.push(message),
    ...options,
  });
  return {
    clipboard,
    session,
    sheet,
    port,
    pastes,
    feedback,
    setTransfer: (next: GridClipboardTransfer) => (transfer = next),
    setSelection: (next: CellSelection) => (selection = next),
    setEditing: (value: boolean) => (editing = value),
  };
}

describe("useGridClipboard owned object transfer hooks", () => {
  test("a claimed object transfer receives the captured selection before any TSV or invalid-image handling", async () => {
    const claim = vi.fn(() => true);
    const f = fixture({ onPasteTransfer: claim });
    const transfer = {
      text: "must not become\tcell data",
      localToken: "owned-picture-token",
      invalidFloatingImage: true,
    };
    f.setTransfer(transfer);
    await f.clipboard.pasteSelection();
    expect(claim).toHaveBeenCalledExactlyOnceWith(
      transfer,
      createCellSelection({ row: 2, column: 3 }),
      "all",
    );
    expect(f.pastes).toEqual([]);
    expect(f.feedback).toEqual([]);
    expect(getCellContent(f.sheet, { row: 2, column: 3 })).toBeNull();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("a handled object command rejection never falls through to a cell paste", async () => {
    const executeObjectCommand = vi.fn(() => false);
    const claim = vi.fn((transfer: GridClipboardTransfer) => {
      if (transfer.localToken !== "owned-picture-token") return false;
      executeObjectCommand();
      return true;
    });
    const f = fixture({ onPasteTransfer: claim });
    f.setTransfer({ text: "Picture caption", localToken: "owned-picture-token" });
    await f.clipboard.pasteSelection();
    expect(executeObjectCommand).toHaveBeenCalledOnce();
    expect(f.pastes).toEqual([]);
    expect(getCellContent(f.sheet, { row: 2, column: 3 })).toBeNull();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("a foreign token that the object hook declines retains ordinary TSV paste", async () => {
    const claim = vi.fn(() => false);
    const f = fixture({ onPasteTransfer: claim });
    f.setTransfer({ text: "external\t17", localToken: "foreign-token" });
    await f.clipboard.pasteSelection();
    expect(claim).toHaveBeenCalledOnce();
    expect(f.pastes).toHaveLength(1);
    expect(f.pastes[0]).toMatchObject({
      kind: "all",
      plan: { anchor: { row: 2, column: 3 }, values: [["external", 17]] },
    });
    expect(f.feedback).toEqual(["pasted"]);
  });

  test.each(["values", "formats"] as const)(
    "%s paste also lets the owned hook refuse a token without parsing it as cells",
    async (kind) => {
      const claim = vi.fn(() => true);
      const f = fixture({ onPasteTransfer: claim });
      const transfer = { text: "Caption", localToken: "owned-picture-token" };
      f.setTransfer(transfer);
      if (kind === "values") await f.clipboard.pasteValuesSelection();
      else await f.clipboard.pasteFormatsSelection();
      expect(claim).toHaveBeenCalledExactlyOnceWith(
        transfer,
        createCellSelection({ row: 2, column: 3 }),
        kind,
      );
      expect(f.pastes).toEqual([]);
      expect(f.feedback).toEqual([]);
    },
  );

  test("preparation failures retain old object ownership until a new cell copy is accepted", async () => {
    let oldObjectPending = true;
    const prepared = vi.fn(() => (oldObjectPending = false));
    const f = fixture({ onPreparedSelection: prepared });
    f.setEditing(true);
    await f.clipboard.copySelection();
    expect(prepared).not.toHaveBeenCalled();
    f.setEditing(false);
    f.setSelection({ ...createCellSelection({ row: 0, column: 0 }), mode: "all" });
    await f.clipboard.copySelection();
    expect(prepared).not.toHaveBeenCalled();
    expect(oldObjectPending).toBe(true);
    expect(f.port.write).not.toHaveBeenCalled();

    f.setSelection(createCellSelection({ row: 2, column: 3 }));
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.sheet.id,
        { row: 2, column: 3 },
        {
          kind: "literal",
          value: "New cell copy",
        },
      ),
    );
    let finish!: (result: { localTokenWritten: boolean }) => void;
    vi.mocked(f.port.write).mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const copy = f.clipboard.copySelection();
    expect(prepared).not.toHaveBeenCalled();
    expect(oldObjectPending).toBe(true);
    finish({ localTokenWritten: true });
    await copy;
    expect(prepared).toHaveBeenCalledOnce();
    expect(oldObjectPending).toBe(false);
    expect(f.clipboard.clipboardMode.value).toBe("copy");
  });

  test("a superseded delayed cell copy cannot clear newer object ownership", async () => {
    const prepared = vi.fn();
    const f = fixture({ onPreparedSelection: prepared });
    let finish!: (result: { localTokenWritten: boolean }) => void;
    vi.mocked(f.port.write).mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const copy = f.clipboard.copySelection();
    f.clipboard.clearPendingClipboard();
    finish({ localTokenWritten: true });
    await copy;
    expect(prepared).not.toHaveBeenCalled();
    expect(f.clipboard.clipboardMode.value).toBeNull();
    expect(f.feedback).toEqual([]);
  });
});
