// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import {
  createPictureSheetMetrics,
  type PictureSheetMetrics,
} from "@sheetcraft/core/picture-axis-metrics";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { normalizeShapeDrawingForest } from "@sheetcraft/core/shape-group-planning";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  type CellAddress,
} from "@sheetcraft/core/workbook";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import { useShapeClipboard } from "../../../../modules/sheet-drawings/useShapeClipboard";
import { group, shape, wordArt } from "./fixture";

function fixture(drawings: SheetDrawing[] = [group(), wordArt()]) {
  const workbook = createWorkbook({ id: "book", sheetId: "source" });
  const source = getActiveSheet(workbook);
  source.drawings = normalizeShapeDrawingForest(drawings);
  const destination = createSheet("Destination", "destination");
  workbook.sheets.set(destination.id, destination);
  const core = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  let currentWorkbook = workbook;
  let sheet = source;
  let metrics: PictureSheetMetrics = createPictureSheetMetrics(sheet);
  let revision = 0;
  let generation = 0;
  let busy = false;
  let nextId = 0;
  let paths: readonly ShapeGroupPath[] = [["outer"]];
  let address: CellAddress = { row: 3, column: 4 };
  const scope = effectScope();
  const onFeedback = vi.fn();
  const onSelect = vi.fn();
  const onCopy = vi.fn();
  const createId = vi.fn(() => `fresh-${++nextId}`);
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const result = executeWorkbookCommand(core, command);
    if (result) revision++;
    return result;
  });
  const prepareDrawing = vi.fn((next: SheetDrawing) => next);
  const options = {
    getWorkbook: () => currentWorkbook,
    getSheet: () => sheet,
    getGeneration: () => generation,
    getRevision: () => revision,
    getMetrics: () => metrics,
    isBusy: () => busy,
    flush,
  };
  const actions = scope.run(() =>
    useDrawingActions({
      ...options,
      getAddress: () => address,
      execute,
      prepareDrawing,
      name: (kind) => kind,
    }),
  )!;
  const replaceCollection = vi.fn(actions.replaceCollection);
  const clipboard = useShapeClipboard({
    ...options,
    getSelectedPaths: () => paths,
    getTargetAddress: () => address,
    replaceCollection,
    createId,
    onFeedback,
    onSelect,
    onCopy,
  });
  return {
    workbook,
    source,
    destination,
    core,
    scope,
    clipboard,
    actions,
    onFeedback,
    onSelect,
    onCopy,
    execute,
    createId,
    prepareDrawing,
    replaceCollection,
    flush,
    select(next: readonly ShapeGroupPath[]) {
      paths = next;
    },
    address(next: CellAddress) {
      address = next;
    },
    switchSheet() {
      sheet = destination;
      metrics = createPictureSheetMetrics(sheet);
      revision++;
    },
    change(kind: string) {
      if (kind === "revision") revision++;
      else if (kind === "generation") generation++;
      else if (kind === "metrics") metrics = createPictureSheetMetrics(sheet);
      else if (kind === "workbook")
        currentWorkbook = createWorkbook({ id: "other", sheetId: "source" });
      else if (kind === "replace-sheet") workbook.sheets.set(sheet.id, { ...sheet });
      else if (kind === "forest-identity")
        sheet.drawings = normalizeShapeDrawingForest(sheet.drawings ?? []);
      else if (kind === "in-place") sheet.drawings![0]!.name = "external in-place edit";
      else if (kind === "busy") busy = true;
      else if (kind === "source-protected") {
        source.properties.protected = true;
        source.protection = { editableRanges: [] };
      } else if (kind === "source-lock") {
        const root = source.drawings![0]!;
        if (!("shapeFrame" in root)) throw Error("Expected shape");
        root.shapeProperties = { ...root.shapeProperties, locked: undefined };
        source.properties.protected = true;
        source.protection = { editableRanges: [] };
      }
    },
  };
}

describe("guarded document-local shape clipboard", () => {
  test.each(["copy", "cut"] as const)("%s cannot retarget a stale capture during flush", (mode) => {
    const f = fixture([shape("same-id")]);
    try {
      f.select([["same-id"]]);
      f.destination.drawings = [shape("same-id", 400, 250)];
      f.flush.mockImplementationOnce(() => {
        f.switchSheet();
        return true;
      });
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard[mode]()).toBe(false);
      expect(f.clipboard.hasPending()).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
  });

  test("paste cannot silently use an address changed by flush", () => {
    const f = fixture();
    try {
      expect(f.clipboard.copy()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.flush.mockImplementationOnce(() => {
        f.address({ row: 15, column: 12 });
        return true;
      });
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard.paste()).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
  });

  test("normal cell flush revision changes do not reject Copy", () => {
    const f = fixture();
    try {
      f.flush.mockImplementationOnce(() => {
        f.change("revision");
        return true;
      });
      expect(f.clipboard.copy()).toBe(true);
      expect(f.clipboard.hasPending()).toBe(true);
    } finally {
      f.scope.stop();
    }
  });
  test("copy is detached, repeatable and commits each complete group in one reversible transaction", () => {
    const f = fixture();
    try {
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard.copy()).toBe(true);
      const identity = f.clipboard.getIdentity()!;
      expect(Object.isFrozen(identity)).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.clipboard.paste()).toBe(true);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.core.history.undoStack).toHaveLength(1);
      expect(f.source.drawings).toHaveLength(3);
      expect(f.onSelect).toHaveBeenLastCalledWith([["fresh-1"]]);
      const after = serializeWorkbook(f.workbook);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
      expect(f.clipboard.paste()).toBe(true);
      expect(f.core.history.undoStack).toHaveLength(2);
      expect(f.source.drawings).toHaveLength(4);
    } finally {
      f.scope.stop();
    }
  });

  test("same-sheet delayed cut removes the source only with a successful atomic paste", () => {
    const f = fixture();
    try {
      const original = f.source.drawings![0]!;
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      expect(f.source.drawings![0]).toBe(original);
      expect(f.core.history.undoStack).toHaveLength(0);
      f.replaceCollection.mockReturnValueOnce(false);
      expect(f.clipboard.paste()).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(f.clipboard.paste()).toBe(true);
      expect(f.clipboard.hasPending()).toBe(false);
      expect(f.source.drawings?.map((root) => root.id)).toEqual(["art", "fresh-6"]);
      expect(f.core.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.workbook);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
    } finally {
      f.scope.stop();
    }
  });

  test("owned cut releases a genuine subtree and repairs its former owner in the same transaction", () => {
    const f = fixture();
    try {
      f.select([["outer", "inner"]]);
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard.cut()).toBe(true);
      expect(f.clipboard.paste()).toBe(true);
      expect(f.source.drawings?.map((root) => root.id)).toEqual(["first", "art", "fresh-1"]);
      const released = f.source.drawings![2]!;
      if (released.kind !== "shapeGroup") throw Error("Expected genuine subgroup");
      expect(released.members).toHaveLength(2);
      expect(released.shapeProperties).toMatchObject({
        locked: false,
        printObject: false,
        altTitle: "Inner title",
      });
      expect(f.core.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      f.scope.stop();
    }
  });

  test.each([
    "revision",
    "generation",
    "metrics",
    "workbook",
    "replace-sheet",
    "forest-identity",
    "in-place",
  ])("a stale cut %s lease preserves originals, the clipboard identity and history", (change) => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.change(change);
      const afterExternalChange = serializeWorkbook(f.workbook);
      expect(f.clipboard.paste()).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(afterExternalChange);
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });

  test("cross-sheet copy is deliberate within one workbook, while cross-sheet cut cannot half-delete", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.switchSheet();
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard.paste()).toBe(false);
      expect(f.onFeedback).toHaveBeenLastCalledWith("cross-sheet-cut");
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
    const copy = fixture();
    try {
      expect(copy.clipboard.copy()).toBe(true);
      copy.switchSheet();
      expect(copy.clipboard.paste({ row: 1, column: 2 })).toBe(true);
      expect(copy.source.drawings).toHaveLength(2);
      expect(copy.destination.drawings).toHaveLength(1);
      expect(copy.core.history.undoStack).toHaveLength(1);
    } finally {
      copy.scope.stop();
    }
  });

  test("source permissions use the real current root, while new target IDs always require editObjects", () => {
    const f = fixture([shape("locked")]);
    try {
      f.select([["locked"]]);
      f.source.properties.protected = true;
      f.source.protection = { editableRanges: [] };
      expect(f.clipboard.copy()).toBe(false);
      expect(f.clipboard.cut()).toBe(false);
      expect(f.onFeedback).toHaveBeenLastCalledWith("source-protected");
      const root = f.source.drawings![0]!;
      if (!("shapeFrame" in root)) throw Error("Expected canonical root");
      root.shapeProperties = { locked: false };
      expect(f.clipboard.copy()).toBe(true);
      const identity = f.clipboard.getIdentity();
      expect(f.clipboard.paste()).toBe(false);
      expect(f.onFeedback).toHaveBeenLastCalledWith("target-protected");
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
  });

  test("delayed copy rechecks source ownership and permission after switching sheets", () => {
    const f = fixture();
    try {
      f.select([["outer", "inner", "nested"]]);
      expect(f.clipboard.copy()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.switchSheet();
      f.change("source-lock");
      expect(f.clipboard.paste()).toBe(false);
      expect(f.onFeedback).toHaveBeenLastCalledWith("source-protected");
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
    const moved = fixture();
    try {
      moved.select([["outer", "inner", "nested"]]);
      expect(moved.clipboard.copy()).toBe(true);
      const root = moved.source.drawings![0]!;
      if (root.kind !== "shapeGroup" || root.members[1]!.kind !== "shapeGroup")
        throw Error("Expected nested group");
      const nested = root.members[1]!.members.shift()!;
      root.members.push(nested);
      moved.switchSheet();
      expect(moved.clipboard.paste()).toBe(false);
      expect(moved.clipboard.hasPending()).toBe(true);
      expect(moved.execute).not.toHaveBeenCalled();
    } finally {
      moved.scope.stop();
    }
  });

  test("ID/preparation races reject before commands and do not consume a cut", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.createId.mockImplementationOnce(() => {
        f.change("in-place");
        return "race-id";
      });
      expect(f.clipboard.paste()).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
    const prepared = fixture();
    try {
      expect(prepared.clipboard.cut()).toBe(true);
      const identity = prepared.clipboard.getIdentity();
      prepared.prepareDrawing.mockImplementationOnce((root) => {
        prepared.change("source-lock");
        return root;
      });
      expect(prepared.clipboard.paste()).toBe(false);
      expect(prepared.clipboard.getIdentity()).toEqual(identity);
      expect(prepared.execute).not.toHaveBeenCalled();
      expect(prepared.core.history.undoStack).toHaveLength(0);
    } finally {
      prepared.scope.stop();
    }
  });

  test("failed/unsupported copy leaves a prior pending cut intact; a valid copy never deletes it", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      expect(f.clipboard.copy([["outer", "missing"]])).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(f.clipboard.copy([["art"]])).toBe(true);
      expect(f.clipboard.getMode()).toBe("copy");
      expect(f.clipboard.paste()).toBe(true);
      expect(f.source.drawings?.map((root) => root.id)).toEqual(["outer", "art", "fresh-1"]);
      expect(f.core.history.undoStack).toHaveLength(1);
      expect(f.clipboard.clear(identity)).toBe(false);
      expect(f.clipboard.hasPending()).toBe(true);
      expect(f.clipboard.clearCut()).toBe(false);
    } finally {
      f.scope.stop();
    }
  });

  test("rejected and throwing transactions retain originals and clipboard; notification exceptions do not undo success", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      const before = serializeWorkbook(f.workbook);
      f.replaceCollection.mockImplementationOnce(() => {
        throw Error("denied");
      });
      expect(f.clipboard.paste()).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.core.history.undoStack).toHaveLength(0);
      f.onSelect.mockImplementationOnce(() => {
        throw Error("observer");
      });
      expect(f.clipboard.paste()).toBe(true);
      expect(f.clipboard.hasPending()).toBe(false);
      expect(f.core.history.undoStack).toHaveLength(1);
    } finally {
      f.scope.stop();
    }
  });

  test("there is no native clipboard dependency, and invalid addresses consume nothing", () => {
    const f = fixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      const before = serializeWorkbook(f.workbook);
      expect(f.clipboard.paste({ row: -1, column: 0 })).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
});
