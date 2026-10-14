// @vitest-environment node
import { describe, expect, test } from "vitest";
import { serializeEquationDocument } from "@sheetcraft/core/equation-document";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { isShapeGroupEligibleRoot } from "@sheetcraft/core/shape-group-planning";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  isDrawingClipboardEligibleRoot,
  resolveDrawingClipboardRootLayout,
} from "../../../../modules/sheet-drawings/drawing-clipboard-eligibility";
import { clipboardFixture, equationDrawing, rawEquationSource } from "./clipboard-fixture";

function snapshot(f: ReturnType<typeof clipboardFixture>) {
  return serializeWorkbook(f.workbook);
}

function protect(sheet: ReturnType<typeof clipboardFixture>["source"]) {
  sheet.properties.protected = true;
  sheet.protection = { editableRanges: [] };
}

describe("Equation clipboard through real Core commands and history", () => {
  test.each([true, false])(
    "%s structured Copy is detached, repeatable and one reversible transaction",
    (structured) => {
      const f = clipboardFixture([equationDrawing("math", structured)]);
      try {
        const source = f.source.drawings![0]!;
        const original = structuredClone(source);
        expect(f.clipboard.copy()).toBe(true);
        const identity = f.clipboard.getIdentity();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.session.history.undoStack).toHaveLength(0);
        // A delayed Copy remains the captured mathematical document after the live owner changes.
        if (source.kind !== "equation") throw Error("Expected equation");
        source.name = "Updated live owner";
        if (structured) {
          source.equationDocument!.body.children = [];
          source.text = serializeEquationDocument(source.equationDocument!);
        } else source.text = "  \\newsource{live}  ";
        const before = snapshot(f);
        expect(f.clipboard.paste()).toBe(true);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        const pasted = f.source.drawings![1]!;
        if (pasted.kind !== "equation" || original.kind !== "equation")
          throw Error("Expected equation");
        expect(pasted.id).toBe("fresh-1");
        expect(pasted.name).toBe(original.name);
        expect(pasted.text).toBe(original.text);
        expect(pasted.equationDocument).toEqual(original.equationDocument);
        if (structured) expect(pasted.equationDocument).not.toBe(source.equationDocument);
        expect(pasted).not.toHaveProperty("shapeFrame");
        expect(pasted).not.toHaveProperty("groupFrame");
        expect(isShapeGroupEligibleRoot(pasted)).toBe(true);
        expect(f.selected).toHaveBeenLastCalledWith([["fresh-1"]]);
        expect(f.session.history.undoStack).toHaveLength(1);
        expect(f.execute).toHaveBeenCalledTimes(1);
        const after = snapshot(f);
        expect(after.version).toBe(structured ? 75 : 43);
        expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(before);
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(after);
        expect(f.clipboard.paste()).toBe(true);
        expect(f.source.drawings).toHaveLength(3);
        expect(f.session.history.undoStack).toHaveLength(2);
      } finally {
        f.scope.stop();
      }
    },
  );

  test.each([true, false])(
    "cross-sheet %s structured Copy preserves source bytes and local math node IDs",
    (structured) => {
      const f = clipboardFixture([equationDrawing("math", structured)]);
      try {
        const source = f.source.drawings![0]!;
        const bytes = JSON.stringify(source);
        f.target.columnWidths.set(0, 150);
        f.target.rowHeights.set(0, 75);
        expect(f.clipboard.copy()).toBe(true);
        f.navigate();
        const before = snapshot(f);
        expect(f.clipboard.paste({ row: 1, column: 1 })).toBe(true);
        expect(JSON.stringify(f.source.drawings![0])).toBe(bytes);
        const pasted = f.target.drawings![0]!;
        if (pasted.kind !== "equation" || source.kind !== "equation")
          throw Error("Expected equation");
        expect(pasted).toMatchObject({
          id: "fresh-1",
          kind: "equation",
          width: 310,
          height: 140,
          rotation: 37,
          text: source.text,
        });
        if (!isDrawingClipboardEligibleRoot(pasted))
          throw new Error("Expected clipboard Equation root.");
        expect(
          resolveDrawingClipboardRootLayout(pasted, createPictureSheetMetrics(f.target)).rect,
        ).toEqual({ x: 150, y: 75, width: 310, height: 140 });
        if (structured) {
          expect(pasted.equationDocument).toEqual(source.equationDocument);
          expect(pasted.equationDocument).not.toBe(source.equationDocument);
          expect(pasted.equationDocument!.body.children[0]).not.toBe(
            source.equationDocument!.body.children[0],
          );
          expect(pasted.equationDocument!.body.children[0]!.id).toBe("fraction");
        } else {
          expect(pasted.text).toBe(rawEquationSource);
          expect(pasted).not.toHaveProperty("equationDocument");
        }
        expect(f.session.history.undoStack).toHaveLength(1);
        const after = snapshot(f);
        expect(after.version).toBe(structured ? 75 : 43);
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(before);
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(after);
      } finally {
        f.scope.stop();
      }
    },
  );

  test.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ] as const)(
    "%s structured Cut, cross-sheet=%s, never predeletes and has one atomic Undo/Redo",
    (structured, crossSheet) => {
      const f = clipboardFixture([equationDrawing("math", structured)]);
      try {
        const source = f.source.drawings![0]!;
        const bytes = JSON.stringify(source);
        expect(f.clipboard.cut()).toBe(true);
        expect(f.source.drawings![0]).toBe(source);
        expect(JSON.stringify(source)).toBe(bytes);
        expect(f.session.history.undoStack).toHaveLength(0);
        expect(f.execute).not.toHaveBeenCalled();
        if (crossSheet) f.navigate();
        const before = snapshot(f);
        expect(f.clipboard.paste()).toBe(true);
        expect(f.clipboard.hasPending()).toBe(false);
        const destination = crossSheet ? f.target : f.source;
        if (crossSheet) expect(f.source.drawings).toEqual([]);
        expect(destination.drawings!.map((root) => root.id)).toEqual(["fresh-1"]);
        const pasted = destination.drawings![0]!;
        if (pasted.kind !== "equation" || source.kind !== "equation")
          throw Error("Expected equation");
        expect(pasted.text).toBe(source.text);
        expect(pasted.equationDocument).toEqual(source.equationDocument);
        expect(pasted).not.toHaveProperty("shapeFrame");
        expect(pasted).not.toHaveProperty("groupFrame");
        expect(f.execute).toHaveBeenCalledTimes(1);
        expect(f.execute.mock.calls[0]![0].type).toBe(
          crossSheet ? "replaceSheetDrawingCollections" : "setSheetDrawings",
        );
        expect(f.session.history.undoStack).toHaveLength(1);
        const after = snapshot(f);
        expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(before);
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(snapshot(f)).toEqual(after);
      } finally {
        f.scope.stop();
      }
    },
  );

  test.each([
    "document-revision",
    "generation",
    "workbook",
    "sheet-identity",
    "forest-identity",
    "geometry",
    "in-place",
  ])("stale %s Cut keeps source, target, pending identity and history", (kind) => {
    const f = clipboardFixture();
    try {
      expect(f.clipboard.cut()).toBe(true);
      const identity = f.clipboard.getIdentity();
      f.navigate();
      f.stale(kind);
      const before = snapshot(f);
      expect(f.clipboard.paste()).toBe(false);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(snapshot(f)).toEqual(before);
      expect(f.source.drawings).toHaveLength(1);
      expect(f.target.drawings ?? []).toHaveLength(0);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.feedback).toHaveBeenLastCalledWith(
        kind === "workbook" ? "unavailable-owner" : "stale-owner",
      );
    } finally {
      f.scope.stop();
    }
  });

  test.each(["capture-source", "delayed-source", "target"])(
    "protected %s Equation clipboard changes no bytes or history",
    (kind) => {
      const f = clipboardFixture();
      try {
        if (kind === "capture-source") {
          protect(f.source);
          const before = snapshot(f);
          expect(f.clipboard.copy()).toBe(false);
          expect(f.clipboard.cut()).toBe(false);
          expect(f.clipboard.hasPending()).toBe(false);
          expect(snapshot(f)).toEqual(before);
          expect(f.feedback).toHaveBeenLastCalledWith("source-protected");
        } else {
          expect(f.clipboard.cut()).toBe(true);
          const identity = f.clipboard.getIdentity();
          f.navigate();
          protect(kind === "target" ? f.target : f.source);
          const before = snapshot(f);
          expect(f.clipboard.paste()).toBe(false);
          expect(snapshot(f)).toEqual(before);
          expect(f.clipboard.getIdentity()).toEqual(identity);
          expect(f.feedback).toHaveBeenLastCalledWith(
            kind === "target" ? "target-protected" : "source-protected",
          );
        }
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.session.history.undoStack).toHaveLength(0);
      } finally {
        f.scope.stop();
      }
    },
  );

  test.each([false, true])(
    "rejected atomic Cut, cross-sheet=%s, consumes nothing and can retry",
    (crossSheet) => {
      const f = clipboardFixture();
      try {
        expect(f.clipboard.cut()).toBe(true);
        const identity = f.clipboard.getIdentity();
        if (crossSheet) f.navigate();
        const before = snapshot(f);
        f.execute.mockImplementationOnce(() => false);
        expect(f.clipboard.paste()).toBe(false);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(snapshot(f)).toEqual(before);
        expect(f.session.history.undoStack).toHaveLength(0);
        expect(f.feedback).toHaveBeenLastCalledWith("command-rejected");
        expect(f.clipboard.paste()).toBe(true);
        expect(f.clipboard.hasPending()).toBe(false);
        expect(f.session.history.undoStack).toHaveLength(1);
      } finally {
        f.scope.stop();
      }
    },
  );

  test.each([false, true])(
    "preparation cannot strip mathematical source during Cut, cross-sheet=%s",
    (crossSheet) => {
      const f = clipboardFixture();
      try {
        expect(f.clipboard.cut()).toBe(true);
        const identity = f.clipboard.getIdentity();
        if (crossSheet) f.navigate();
        const before = snapshot(f);
        const strip = (drawing: SheetDrawing): SheetDrawing => {
          if (drawing.kind !== "equation") return drawing;
          const { equationDocument: _source, ...raw } = drawing;
          return raw;
        };
        if (crossSheet)
          f.prepareTransfer.mockImplementationOnce((_sheet, _metrics, drawing) => strip(drawing));
        else f.prepareDrawing.mockImplementationOnce(strip);
        expect(f.clipboard.paste()).toBe(false);
        expect(snapshot(f)).toEqual(before);
        expect(f.clipboard.getIdentity()).toEqual(identity);
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.session.history.undoStack).toHaveLength(0);
      } finally {
        f.scope.stop();
      }
    },
  );
});
