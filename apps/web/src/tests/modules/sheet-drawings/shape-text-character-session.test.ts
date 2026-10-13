// @vitest-environment node
import { describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { findShapeGroupNode } from "@sheetcraft/core/shape-group";
import { replaceShapeTextCharacterRange } from "@sheetcraft/core/shape-text-character-runs";
import { fixture, textRoot, deepRoot } from "./shape-text-edit-session-fixture";
import {
  drawingShapeTextCharacterValues,
  editDrawingShapeTextField,
} from "../../../modules/sheet-drawings/shape-text-options";
import { useShapeTextCharacterFormatPane } from "../../../modules/sheet-drawings/useShapeTextCharacterFormatPane";

function richFixture(owned = false) {
  const root = owned ? deepRoot() : textRoot();
  const node =
    root.kind === "shapeGroup"
      ? findShapeGroupNode(root, ["outer", "nested", "target"])!.node
      : root;
  if (node.kind === "shapeGroup") throw Error("leaf");
  node.text = "alpha beta";
  return fixture([root]);
}
function source(f: ReturnType<typeof fixture>) {
  const state = f.editor.snapshot.value!;
  return { text: state.draftText, characterRuns: state.draftView.shapeText?.characterRuns };
}
describe("one leased attributed shape draft", () => {
  test.each([false, true])("same-text format is one exact transaction (owned=%s)", (owned) => {
    const f = richFixture(owned);
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin(
          f.sheet.drawings![0]!,
          owned ? ["outer", "nested", "target"] : undefined,
        );
      expect(callbacks.setSelection({ start: 0, end: 6, direction: "forward" })).toBe(true);
      expect(
        callbacks.format({ fontSize: 80 / 3, bold: true, italic: true, underline: true }),
      ).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.editor.snapshot.value!.draftText).toBe("alpha beta");
      expect(callbacks.commit()).toBe(true);
      const after = serializeWorkbook(f.workbook);
      expect(after.version).toBe(66);
      expect(f.core.history.undoStack).toHaveLength(1);
      const node = f.sheet.drawings![0]!;
      const leaf =
        node.kind === "shapeGroup"
          ? findShapeGroupNode(node, ["outer", "nested", "target"])!.node
          : node;
      if (leaf.kind !== "shape" && leaf.kind !== "textBox") throw Error("leaf");
      expect(leaf.shapeText!.characterRuns).toEqual([
        { start: 0, end: 6, fontSize: 80 / 3, bold: true, italic: true, underline: true },
      ]);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
    } finally {
      f.scope.stop();
    }
  });
  test("collapsed pending format is private, then the inserted text and runs commit together", () => {
    const f = richFixture();
    try {
      const callbacks = f.begin();
      callbacks.setSelection({ start: 0, end: 0, direction: "none" });
      expect(callbacks.format({ bold: true, color: "#ff0000" })).toBe(true);
      expect(source(f).characterRuns).toBeUndefined();
      const next = replaceShapeTextCharacterRange(
        source(f),
        0,
        0,
        "x",
        f.editor.snapshot.value!.pendingFormat,
      );
      expect(
        callbacks.updateRich({
          source: next,
          selection: { start: 1, end: 1, direction: "none" },
          pendingFormat: f.editor.snapshot.value!.pendingFormat,
        }),
      ).toBe(true);
      expect(callbacks.commit()).toBe(true);
      expect(f.sheet.drawings![0]).toMatchObject({
        text: "xalpha beta",
        shapeText: { characterRuns: [{ start: 0, end: 1, bold: true, color: "#ff0000" }] },
      });
      expect(f.core.history.undoStack).toHaveLength(1);
    } finally {
      f.scope.stop();
    }
  });
  test("pending-only close has no history; explicit false survives same-text commit", () => {
    const f = richFixture();
    try {
      const callbacks = f.begin();
      expect(callbacks.format({ bold: true })).toBe(true);
      expect(callbacks.commit()).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      const next = f.begin();
      next.setSelection({ start: 0, end: 5, direction: "forward" });
      next.format({ bold: false });
      expect(next.commit()).toBe(true);
      expect(f.sheet.drawings![0]).toMatchObject({
        shapeText: { characterRuns: [{ start: 0, end: 5, bold: false }] },
      });
    } finally {
      f.scope.stop();
    }
  });
  test("stale owner keeps complete text and styles without history", () => {
    const f = richFixture();
    try {
      const callbacks = f.begin();
      callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
      callbacks.format({ underline: true });
      const draft = f.editor.snapshot.value!.draftView;
      f.generation.value++;
      expect(callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value!.draftView).toBe(draft);
      expect(f.editor.snapshot.value!.stale).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test("whole-object size broadcasts only size, retaining local family/B/I/U", () => {
    const f = richFixture();
    try {
      const callbacks = f.begin();
      callbacks.setSelection({ start: 0, end: 6, direction: "forward" });
      callbacks.format({
        fontFamily: "serif",
        fontSize: 40,
        bold: true,
        italic: true,
        underline: true,
      });
      const drawing = f.editor.snapshot.value!.draftView;
      expect(drawingShapeTextCharacterValues(drawing).mixedFields).toEqual(
        expect.arrayContaining([
          "fontFamily",
          "fontSizePt",
          "textBold",
          "textItalic",
          "textUnderline",
        ]),
      );
      const next = editDrawingShapeTextField(drawing, "fontSizePt", 16)!;
      expect(next.fontSize).toBe(64 / 3);
      expect(next.shapeText!.characterRuns).toEqual([
        { start: 0, end: 6, fontFamily: "serif", bold: true, italic: true, underline: true },
      ]);
      expect(drawingShapeTextCharacterValues(next).mixedFields).not.toContain("fontSizePt");
    } finally {
      f.scope.stop();
    }
  });
  test("pane formats the captured range and rejects a callback after caret changes", () => {
    const f = richFixture();
    try {
      f.begin();
      const pane = f.scope.run(() =>
        useShapeTextCharacterFormatPane({
          getSnapshot: () => f.editor.snapshot.value,
          getCallbacks: () => f.editor.callbacks(f.editor.snapshot.value!.sessionId),
          getWorkbookId: () => f.workbook.id,
          getSheetId: () => f.sheet.id,
          getLocale: () => "en-US",
        }),
      )!;
      const callbacks = f.editor.callbacks(f.editor.snapshot.value!.sessionId);
      expect(pane.capabilities.value.fields.paragraphAlignment?.enabled).toBe(false);
      expect(pane.capabilities.value.fields.textWrap?.enabled).toBe(false);
      expect(pane.capabilities.value.fields.textColor?.enabled).toBe(true);
      callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
      const captured = pane.snapshot.value!;
      expect(
        pane.onIntent({
          type: "set-field",
          field: "textBold",
          value: true,
          owner: captured.owner,
          baseRevision: captured.revision,
          intentId: "bold",
        }),
      ).toBe(true);
      expect(source(f).characterRuns).toEqual([{ start: 0, end: 5, bold: true }]);
      callbacks.setSelection({ start: 6, end: 10, direction: "forward" });
      expect(
        pane.onIntent({
          type: "set-field",
          field: "textItalic",
          value: true,
          owner: captured.owner,
          baseRevision: captured.revision,
          intentId: "old-font",
        }),
      ).toBe(false);
      expect(source(f).characterRuns).toEqual([{ start: 0, end: 5, bold: true }]);
    } finally {
      f.scope.stop();
    }
  });
});

test("undoing first range format on a legacy shape leaves no model migration or history", () => {
  const root = textRoot();
  delete root.shapeText;
  const f = fixture([root]);
  try {
    const before = serializeWorkbook(f.workbook),
      callbacks = f.begin();
    callbacks.setSelection({ start: 0, end: 8, direction: "forward" });
    expect(callbacks.format({ bold: true })).toBe(true);
    expect(f.editor.snapshot.value!.draftView.shapeText?.characterRuns).toBeDefined();
    expect(
      callbacks.updateRich({
        source: { text: root.text },
        selection: { start: 0, end: 8, direction: "forward" },
      }),
    ).toBe(true);
    expect(f.editor.snapshot.value!.draftView.shapeText).toBeUndefined();
    expect(callbacks.commit()).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  } finally {
    f.scope.stop();
  }
});
