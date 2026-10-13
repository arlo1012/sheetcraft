// @vitest-environment node
import { describe, expect, test } from "vitest";
import { markRaw } from "vue";
import { createSetCellContentCommand } from "@sheetcraft/core/commands";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSheet, createWorkbook } from "@sheetcraft/core/workbook";
import { findShapeGroupNode } from "@sheetcraft/core/shape-group";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { connectorRoot, deepRoot, fixture, textRoot } from "./shape-text-edit-session-fixture";

describe("canonical canvas text session and real Core transactions", () => {
  test.each(["shape", "textBox"] as const)(
    "%s content preserves source data and owns one Undo/Redo entry",
    (kind) => {
      const connector = connectorRoot();
      if (kind === "textBox")
        connector.shapeConnector!.begin = { kind: "free", xRatio: 0, yRatio: 0 };
      const f = fixture([textRoot(kind), connector]);
      try {
        const before = serializeWorkbook(f.workbook),
          original = before.sheets[0]!.drawings![0]!,
          callbacks = f.begin();
        const opened = f.editor.snapshot.value!;
        expect(opened.sourceNode).toBe(f.sheet.drawings![0]);
        expect(opened.root).toBe(opened.sourceNode);
        expect(opened.path).toEqual(["target"]);
        expect(opened.view).toMatchObject({ kind, text: "Original\ntext", rotation: 37 });
        expect(callbacks.update("New text\n😀\n")).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(callbacks.commit()).toBe(true);
        expect(callbacks.isActive()).toBe(false);
        expect(f.editor.snapshot.value).toBeUndefined();
        expect(f.execute).toHaveBeenCalledOnce();
        expect(f.core.history.undoStack).toHaveLength(1);
        const after = serializeWorkbook(f.workbook);
        expect(after.sheets[0]!.drawings![0]).toEqual({ ...original, text: "New text\n😀\n" });
        expect(after.sheets[0]!.drawings![1]).toEqual(before.sheets[0]!.drawings![1]);
        expect(f.prepare.mock.calls[0]![2]).toHaveLength(2);
        expect(f.connectedPreflight).toHaveBeenCalledOnce();
        expect(undoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(redoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(after);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each([false, true])(
    "deep owned content preserves exact owners and connector relationships (owned connector=%s)",
    (withOwnedConnector) => {
      const f = fixture(withOwnedConnector ? [deepRoot(true)] : [deepRoot(), connectorRoot()]);
      try {
        const before = serializeWorkbook(f.workbook),
          callbacks = f.begin(f.sheet.drawings![0]!, ["outer", "nested", "target"]);
        expect(f.editor.snapshot.value!.sourceRootId).toBe("outer");
        expect(f.editor.snapshot.value!.sourceId).toBe("target");
        expect(f.editor.snapshot.value!.view.rotation).toBe(42);
        expect(callbacks.update("Owned text\n")).toBe(true);
        expect(callbacks.commit()).toBe(true);
        const expected = structuredClone(before);
        const owner = expected.sheets[0]!.drawings![0]!;
        if (owner.kind !== "shapeGroup") throw Error("Expected owner");
        const leaf = findShapeGroupNode(owner, ["outer", "nested", "target"])!.node;
        if (leaf.kind === "shapeGroup") throw Error("Expected leaf");
        leaf.text = "Owned text\n";
        expect(serializeWorkbook(f.workbook)).toEqual(expected);
        expect(f.execute).toHaveBeenCalledOnce();
        expect(f.core.history.undoStack).toHaveLength(1);
        expect(undoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(redoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(expected);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each([false, true])(
    "same text closes without preparation or history (owned=%s)",
    (owned) => {
      const f = fixture(owned ? [deepRoot(true)] : [textRoot(), connectorRoot()]);
      try {
        const before = serializeWorkbook(f.workbook),
          callbacks = f.begin(
            f.sheet.drawings![0]!,
            owned ? ["outer", "nested", "target"] : undefined,
          );
        callbacks.update("Temporary draft");
        callbacks.update(f.editor.snapshot.value!.text);
        expect(callbacks.commit()).toBe(true);
        expect(f.editor.snapshot.value).toBeUndefined();
        expect(f.replaceCollection).not.toHaveBeenCalled();
        expect(f.prepare).not.toHaveBeenCalled();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.core.history.undoStack).toHaveLength(0);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
      } finally {
        f.scope.stop();
      }
    },
  );
  test.each([false, true])(
    "AutoFit and new text are one exact reversible command (owned=%s)",
    (owned) => {
      const root = owned ? deepRoot(true) : textRoot();
      const target =
        root.kind === "shapeGroup"
          ? findShapeGroupNode(root, ["outer", "nested", "target"])!.node
          : root;
      if (target.kind === "shapeGroup") throw Error("Expected text leaf");
      target.shapeText!.layout.autoFit = "resize-shape";
      const f = fixture(owned ? [root] : [root, connectorRoot()]);
      try {
        const before = serializeWorkbook(f.workbook),
          callbacks = f.begin(
            f.sheet.drawings![0]!,
            owned ? ["outer", "nested", "target"] : undefined,
          ),
          originalHeight = f.editor.snapshot.value!.view.height;
        callbacks.update(Array.from({ length: 12 }, () => "line").join("\n"));
        expect(callbacks.commit()).toBe(true);
        const pass = resolveShapeForestForRender({
          drawings: f.sheet.drawings!,
          metrics: f.metrics.value,
          revision: f.revision.value,
        });
        const fitted = pass.getLeaf("target")!,
          fittedView = fitted.carrierLeaf?.view ?? fitted.carrierRoot?.view;
        if (!fittedView) throw Error("Expected fitted text view");
        expect(fittedView.height).toBeGreaterThan(originalHeight);
        expect(f.core.history.undoStack).toHaveLength(1);
        expect(f.execute).toHaveBeenCalledOnce();
        const after = serializeWorkbook(f.workbook);
        expect(undoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(redoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(after);
      } finally {
        f.scope.stop();
      }
    },
  );
  test("legacy uniform-text shape stays legacy and preserves absent shapeText", () => {
    const root = createGraphicDrawing("legacy", "shape", "Legacy", { row: 1, column: 2 });
    delete root.shapeText;
    root.text = "Original legacy";
    const f = fixture([root]);
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin();
      callbacks.update("Edited legacy");
      expect(callbacks.commit()).toBe(true);
      expect(serializeWorkbook(f.workbook).sheets[0]!.drawings![0]).toEqual({
        ...before.sheets[0]!.drawings![0],
        text: "Edited legacy",
      });
      expect("shapeFrame" in f.sheet.drawings![0]!).toBe(false);
      expect("shapeText" in f.sheet.drawings![0]!).toBe(false);
    } finally {
      f.scope.stop();
    }
  });
});

describe("draft recovery and owner-bound callbacks", () => {
  test("font/preparation failure keeps draft and original history, then retries the same session", () => {
    const f = fixture();
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin();
      callbacks.update("Recoverable draft");
      f.beforePrepare.mockImplementationOnce(() => {
        throw Error("Exact font is unavailable");
      });
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value).toMatchObject({
        sessionId: callbacks.sessionId,
        draftText: "Recoverable draft",
        stale: false,
        error: { code: "prepare" },
      });
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(callbacks.commit()).toBe(true);
      expect(f.core.history.undoStack).toHaveLength(1);
    } finally {
      f.scope.stop();
    }
  });
  test("busy and protected drafts remain open and can commit when allowed again", () => {
    const f = fixture();
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin();
      callbacks.update("Waiting draft");
      f.busy.value = true;
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value!.error?.code).toBe("busy");
      f.busy.value = false;
      f.sheet.properties.protected = true;
      f.sheet.protection = { editableRanges: [], formatCells: true };
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value).toMatchObject({
        draftText: "Waiting draft",
        stale: false,
        error: { code: "permission" },
      });
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook).sheets[0]!.drawings).toEqual(before.sheets[0]!.drawings);
      f.sheet.protection.editObjects = true;
      expect(callbacks.commit()).toBe(true);
    } finally {
      f.scope.stop();
    }
  });
  test.each([
    "workbook",
    "sheet",
    "generation",
    "revision",
    "metrics",
    "root",
    "owned",
    "unrelated",
  ])("%s changes cannot retarget a preserved draft", (change) => {
    const f = fixture([deepRoot(true)]);
    try {
      const callbacks = f.begin(f.sheet.drawings![0]!, ["outer", "nested", "target"]);
      callbacks.update("Do not retarget");
      if (change === "workbook")
        f.workbookRef.value = createWorkbook({ id: "other", sheetId: "sheet" });
      if (change === "sheet") f.sheetRef.value = createSheet("Other", "other");
      if (change === "generation") f.generation.value++;
      if (change === "revision") f.revision.value++;
      if (change === "metrics") f.metrics.value = markRaw(createPictureSheetMetrics(f.sheet));
      const root = f.sheet.drawings![0]!;
      if (root.kind !== "shapeGroup") throw Error("Expected group");
      if (change === "root") f.sheet.drawings![0] = { ...root };
      if (change === "owned") {
        const nested = root.members[0]!;
        if (nested.kind !== "shapeGroup") throw Error("Expected nested group");
        nested.members[0] = { ...nested.members[0]! };
      }
      if (change === "unrelated") root.members[1]!.name = "Changed connector";
      const afterChange = serializeWorkbook(f.workbook);
      expect(f.editor.snapshot.value!.stale).toBe(true);
      expect(callbacks.isActive()).toBe(true);
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value!.draftText).toBe("Do not retarget");
      expect(callbacks.update("Draft is still copyable")).toBe(true);
      expect(callbacks.commit()).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(afterChange);
    } finally {
      f.scope.stop();
    }
  });
  test("same metrics with changed methods or numeric closure invalidates the lease", () => {
    const f = fixture();
    try {
      let delta = 0;
      const prefix = f.metrics.value.rows.visiblePrefix;
      f.metrics.value.rows.visiblePrefix = (index) => prefix(index) + delta;
      // A cell-relative legacy owner genuinely depends on this metric closure.
      f.sheet.drawings = [
        createGraphicDrawing("legacy", "textBox", "Original", { row: 1, column: 0 }),
      ];
      const callbacks = f.begin();
      callbacks.update("Metrics draft");
      delta = 5;
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value!.stale).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
  });
  test("old callbacks never update, compose, commit, or close a new session", () => {
    const second = { ...textRoot(), id: "second" };
    const f = fixture([textRoot(), second]);
    try {
      const first = f.begin();
      expect(first.isActive()).toBe(true);
      expect(f.editor.callbacks(first.sessionId)).toBe(first);
      first.update("Draft one");
      expect(f.editor.callbacks(first.sessionId)).toBe(first);
      expect(f.editor.begin(f.sheet.drawings![1]!)).toBe(false);
      expect(f.editor.snapshot.value!.draftText).toBe("Draft one");
      expect(first.cancel()).toBe(true);
      expect(first.isActive()).toBe(false);
      const next = f.begin(f.sheet.drawings![1]!);
      expect(next.isActive()).toBe(true);
      expect(next.sessionId).not.toBe(first.sessionId);
      expect(first.update("Old input")).toBe(false);
      expect(first.setComposing(true)).toBe(false);
      expect(first.commit()).toBe(false);
      expect(first.cancel()).toBe(false);
      expect(first.isActive()).toBe(false);
      f.editor.callbacks(first.sessionId);
      expect(f.editor.callbacks(next.sessionId)).toBe(next);
      expect(f.editor.snapshot.value).toMatchObject({
        sessionId: next.sessionId,
        sourceId: "second",
        draftText: "Original\ntext",
      });
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test("IME composition blocks commit/blur until its final draft is supplied", () => {
    const f = fixture();
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin();
      callbacks.setComposing(true);
      callbacks.update("中");
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value).toMatchObject({
        composing: true,
        draftText: "中",
        error: { code: "composition" },
      });
      expect(f.replaceCollection).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      callbacks.update("中文输入");
      callbacks.setComposing(false);
      expect(callbacks.commit()).toBe(true);
      expect(f.sheet.drawings![0]).toMatchObject({ text: "中文输入" });
      expect(f.core.history.undoStack).toHaveLength(1);
    } finally {
      f.scope.stop();
    }
  });
  test("scope disposal retains an invalid draft and rejects its old callbacks", () => {
    const f = fixture(),
      callbacks = f.begin();
    callbacks.update("Closed scope draft");
    f.scope.stop();
    expect(callbacks.commit()).toBe(false);
    expect(f.editor.snapshot.value).toMatchObject({
      draftText: "Closed scope draft",
      stale: true,
      error: { code: "disposed" },
    });
    expect(callbacks.update("Old event")).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });
});

describe("flush ordering and final command boundary", () => {
  test("pending cell flush completes before the final shape lease is captured", () => {
    const f = fixture();
    try {
      const root = f.sheet.drawings![0]!;
      f.flush.mockImplementationOnce(() =>
        f.execute(
          createSetCellContentCommand(
            f.sheet.id,
            { row: 0, column: 0 },
            { kind: "literal", value: "Flushed cell" },
          ),
        ),
      );
      const callbacks = f.begin(root);
      expect(f.flush).toHaveBeenCalledOnce();
      expect(f.core.history.undoStack).toHaveLength(1);
      callbacks.update("Shape after cell");
      expect(callbacks.commit()).toBe(true);
      expect(f.core.history.undoStack).toHaveLength(2);
      expect(f.sheet.drawings![0]).toMatchObject({ text: "Shape after cell" });
    } finally {
      f.scope.stop();
    }
  });
  test("flush owner replacement or failure never opens a retargeted session", () => {
    const f = fixture();
    try {
      const root = f.sheet.drawings![0]!;
      f.flush.mockReturnValueOnce(false);
      expect(f.editor.begin(root)).toBe(false);
      f.flush.mockImplementationOnce(() => {
        f.sheet.drawings![0] = { ...root };
        return true;
      });
      expect(f.editor.begin(root)).toBe(false);
      expect(f.editor.snapshot.value).toBeUndefined();
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test.each(["execute-false", "execute-throw", "permission", "owner", "final-paint"])(
    "%s failure remains atomic at the final guarded boundary",
    (failure) => {
      const f = fixture([textRoot(), connectorRoot()]);
      try {
        const before = serializeWorkbook(f.workbook),
          callbacks = f.begin();
        callbacks.update("Must not apply");
        if (failure === "execute-false") f.execute.mockImplementationOnce(() => false);
        if (failure === "execute-throw")
          f.execute.mockImplementationOnce(() => {
            throw Error("Command failure");
          });
        if (failure === "permission")
          f.beforePrepare.mockImplementationOnce(() => {
            f.sheet.properties.protected = true;
          });
        if (failure === "owner")
          f.beforePrepare.mockImplementationOnce(() => {
            f.generation.value++;
          });
        if (failure === "final-paint") f.connectedPreflight.mockReturnValueOnce(false);
        expect(callbacks.commit()).toBe(false);
        expect(f.editor.snapshot.value!.draftText).toBe("Must not apply");
        expect(f.core.history.undoStack).toHaveLength(0);
        expect(f.core.history.redoStack).toHaveLength(0);
        expect(serializeWorkbook(f.workbook).sheets[0]!.drawings).toEqual(
          before.sheets[0]!.drawings,
        );
      } finally {
        f.scope.stop();
      }
    },
  );
  test("preparation re-entry cannot submit twice or replace the committed draft", () => {
    const f = fixture();
    try {
      const callbacks = f.begin();
      callbacks.update("One command");
      f.beforePrepare.mockImplementationOnce(() => {
        expect(callbacks.commit()).toBe(false);
        expect(callbacks.update("Re-entrant draft")).toBe(false);
        expect(f.editor.begin(f.sheet.drawings![0]!)).toBe(false);
      });
      expect(callbacks.commit()).toBe(true);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.sheet.drawings![0]).toMatchObject({ text: "One command" });
      expect(f.core.history.undoStack).toHaveLength(1);
    } finally {
      f.scope.stop();
    }
  });
  test("an explicit close during preparation makes the final guard refuse the command", () => {
    const f = fixture();
    try {
      const callbacks = f.begin(),
        before = serializeWorkbook(f.workbook);
      callbacks.update("Canceled before command");
      f.beforePrepare.mockImplementationOnce(() => {
        expect(callbacks.cancel()).toBe(true);
      });
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value).toBeUndefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      f.scope.stop();
    }
  });
  test("connectors, containers, mismatched paths, wordArt and missing text rectangles stay unsupported", () => {
    const wordArt = createGraphicDrawing("wordart", "wordArt", "WordArt", { row: 0, column: 0 });
    const line = { ...textRoot(), id: "line", shapeGeometry: { preset: "line" as const } };
    const f = fixture([deepRoot(true), wordArt, line]);
    try {
      const group = f.sheet.drawings![0]!;
      expect(f.editor.begin(group)).toBe(false);
      expect(f.editor.begin(group, ["outer", "nested"])).toBe(false);
      expect(f.editor.begin(group, ["outer", "connector"])).toBe(false);
      expect(f.editor.begin(group, ["outer", "target"])).toBe(false);
      expect(f.editor.begin(f.sheet.drawings![1]!)).toBe(false);
      expect(f.editor.begin(f.sheet.drawings![2]!)).toBe(false);
      expect(f.editor.snapshot.value).toBeUndefined();
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
});

test.each([false, true])(
  "hidden root/ancestor cannot create a fallback inline text editor (%s)",
  (owned) => {
    const root = owned ? deepRoot() : textRoot();
    root.hidden = true;
    const f = fixture([root]);
    try {
      const before = serializeWorkbook(f.workbook);
      expect(
        f.editor.begin(f.sheet.drawings![0]!, owned ? ["outer", "nested", "target"] : undefined),
      ).toBe(false);
      expect(f.editor.snapshot.value).toBeUndefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      f.scope.stop();
    }
  },
);
