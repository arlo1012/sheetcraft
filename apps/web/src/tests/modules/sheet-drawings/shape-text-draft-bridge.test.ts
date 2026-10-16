// @vitest-environment node
import { describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { findShapeGroupNode } from "@sheetcraft/core/shape-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { connectorRoot, deepRoot, fixture, textRoot } from "./shape-text-edit-session-fixture";

const fill: ShapeDetailedStyle["fill"] = {
  kind: "value",
  value: { kind: "solid", color: { kind: "rgb", rgb: "#cc2233" }, opacity: 0.7 },
};
const line: ShapeDetailedStyle["line"] = {
  kind: "value",
  value: {
    paint: { kind: "solid", color: { kind: "rgb", rgb: "#2255cc" }, opacity: 1 },
    widthPt: 2.25,
    compound: "single",
    dash: "solid",
    cap: "butt",
    join: "round",
    miterLimit: 4,
  },
};
const selection = { start: 1, end: 5, direction: "backward" as const };
const margins = { leftPt: 3, rightPt: 4, topPt: 5, bottomPt: 6 };
function checkpoint(f: ReturnType<typeof fixture>) {
  const state = f.editor.snapshot.value!;
  return {
    draftText: state.draftText,
    draftView: state.draftView,
    selection: state.selection,
    pendingFormat: state.pendingFormat,
  };
}

describe("same-lease canvas text and shape draft bridge", () => {
  test("text, character format, layout and body paint undo and redo in actual edit order", () => {
    const f = fixture();
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin();
      const states = [checkpoint(f)];
      expect(callbacks.update("Typed draft")).toBe(true);
      expect(callbacks.setSelection(selection)).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.format({ bold: true })).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.editField("paragraphAlignment", "right")).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.setBodyStyle("fill", fill)).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.setMargins(margins)).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.editField("textDirection", "vertical-rl")).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.editField("textWrap", false)).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.setBodyStyle("line", line)).toBe(true);
      states.push(checkpoint(f));
      expect(callbacks.setWarp({ preset: "textArchUp" })).toBe(true);
      states.push(checkpoint(f));
      expect(f.editor.snapshot.value!.selection).toEqual(selection);
      for (let index = states.length - 2; index >= 0; index--) {
        expect(callbacks.historyStep("undo")).toBe(true);
        expect(checkpoint(f)).toEqual(states[index]);
      }
      expect(callbacks.historyStep("undo")).toBe(false);
      for (const state of states.slice(1)) {
        expect(callbacks.historyStep("redo")).toBe(true);
        expect(checkpoint(f)).toEqual(state);
      }
      expect(callbacks.historyStep("redo")).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      f.scope.stop();
    }
  });

  test.each(["shape", "textBox", "owned"] as const)(
    "%s commits copied text/layout/body appearance once without changing geometry or other owners",
    (kind) => {
      const connector = connectorRoot();
      if (kind === "textBox")
        connector.shapeConnector!.begin = { kind: "free", xRatio: 0, yRatio: 0 };
      const f = fixture(kind === "owned" ? [deepRoot(true)] : [textRoot(kind), connector]);
      try {
        const before = serializeWorkbook(f.workbook),
          callbacks = f.begin(
            f.sheet.drawings![0]!,
            kind === "owned" ? ["outer", "nested", "target"] : undefined,
          );
        expect(callbacks.update("Typed text")).toBe(true);
        expect(callbacks.setSelection(selection)).toBe(true);
        expect(callbacks.format({ italic: true })).toBe(true);
        expect(callbacks.editField("paragraphAlignment", "left")).toBe(true);
        expect(callbacks.setMargins(margins)).toBe(true);
        expect(callbacks.editField("textWrap", false)).toBe(true);
        expect(callbacks.setBodyStyle("fill", fill)).toBe(true);
        expect(callbacks.setBodyStyle("line", line)).toBe(true);
        const draft = f.editor.snapshot.value!.draftView;
        expect(callbacks.historyStep("undo")).toBe(true);
        expect(callbacks.historyStep("undo")).toBe(true);
        expect(callbacks.historyStep("redo")).toBe(true);
        expect(callbacks.historyStep("redo")).toBe(true);
        expect(f.editor.snapshot.value!.draftView).toEqual(draft);
        expect(f.editor.snapshot.value!.selection).toEqual(selection);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(f.prepare).not.toHaveBeenCalled();
        expect(callbacks.commit()).toBe(true);
        expect(callbacks.commit()).toBe(false);
        expect(f.execute).toHaveBeenCalledOnce();
        expect(f.core.history.undoStack).toHaveLength(1);
        const expected = structuredClone(before),
          root = expected.sheets[0]!.drawings![0]!;
        const leaf =
          root.kind === "shapeGroup"
            ? findShapeGroupNode(root, ["outer", "nested", "target"])!.node
            : root;
        if (leaf.kind !== "shape" && leaf.kind !== "textBox") throw Error("Expected text leaf");
        // The whole snapshot comparison also covers anchors, frames, rotation, flips,
        // aspect/protection metadata, non-body effects and connected sibling ownership.
        Object.assign(leaf, {
          text: draft.text,
          shapeText: draft.shapeText,
          shapeStyle: draft.shapeStyle,
        });
        // Explicit italic character runs require v66; TextBox body paint requires v73.
        // No transform was requested in this commit scenario.
        expect(draft.shapeText?.characterRuns?.length).toBeGreaterThan(0);
        expect(draft.shapeText?.warp).toBeUndefined();
        const committed = serializeWorkbook(f.workbook);
        expected.version = kind === "textBox" ? 73 : 66;
        expect(committed.version).toBe(expected.version);
        expect(committed).toEqual(expected);
        expect(undoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(redoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(expected);
      } finally {
        f.scope.stop();
      }
    },
  );

  test("undo to the original legacy draft closes without a migration or Core command", () => {
    const root = textRoot();
    delete root.shapeText;
    const f = fixture([root]);
    try {
      const before = serializeWorkbook(f.workbook),
        callbacks = f.begin();
      expect(callbacks.update("Temporary draft")).toBe(true);
      expect(callbacks.editField("paragraphAlignment", "right")).toBe(true);
      expect(callbacks.setBodyStyle("fill", fill)).toBe(true);
      for (let index = 0; index < 3; index++) expect(callbacks.historyStep("undo")).toBe(true);
      expect(f.editor.snapshot.value!.draftView.shapeText).toBeUndefined();
      expect(callbacks.commit()).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.prepare).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    } finally {
      f.scope.stop();
    }
  });

  test("a body edit after undo discards redo while caret-only changes add no undo entry", () => {
    const f = fixture();
    try {
      const callbacks = f.begin();
      callbacks.update("Typed draft");
      callbacks.setSelection(selection);
      const typed = checkpoint(f);
      callbacks.editField("paragraphAlignment", "right");
      expect(callbacks.historyStep("undo")).toBe(true);
      expect(checkpoint(f)).toEqual(typed);
      expect(callbacks.setBodyStyle("fill", fill)).toBe(true);
      expect(callbacks.historyStep("redo")).toBe(false);
      expect(callbacks.historyStep("undo")).toBe(true);
      expect(checkpoint(f)).toEqual(typed);
      expect(callbacks.historyStep("undo")).toBe(true);
      expect(f.editor.snapshot.value!.draftText).toBe("Original\ntext");
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });

  test.each(["stale", "protected", "composition"] as const)(
    "%s rejects shape styles/layout/history and commit while retaining the complete draft",
    (blocked) => {
      const f = fixture();
      try {
        const callbacks = f.begin();
        callbacks.update("Keep this draft");
        callbacks.setSelection(selection);
        callbacks.editField("paragraphAlignment", "right");
        callbacks.setBodyStyle("fill", fill);
        callbacks.setBodyStyle("line", line);
        if (blocked === "stale") f.generation.value++;
        if (blocked === "protected") {
          f.sheet.properties.protected = true;
          f.sheet.protection = { editableRanges: [], formatCells: true };
        }
        if (blocked === "composition") callbacks.setComposing(true);
        const draft = checkpoint(f),
          before = serializeWorkbook(f.workbook);
        expect(callbacks.setBodyStyle("fill", { kind: "none" })).toBe(false);
        expect(callbacks.setBodyStyle("line", { kind: "none" })).toBe(false);
        expect(callbacks.editField("paragraphAlignment", "left")).toBe(false);
        expect(callbacks.editField("textDirection", "vertical-rl")).toBe(false);
        expect(callbacks.editField("textWrap", false)).toBe(false);
        expect(callbacks.setMargins(margins)).toBe(false);
        expect(callbacks.setWarp({ preset: "textArchUp" })).toBe(false);
        expect(callbacks.historyStep("undo")).toBe(false);
        expect(callbacks.historyStep("redo")).toBe(false);
        expect(callbacks.commit()).toBe(false);
        expect(checkpoint(f)).toEqual(draft);
        expect(f.prepare).not.toHaveBeenCalled();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.core.history.undoStack).toHaveLength(0);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        if (blocked === "stale") expect(f.editor.snapshot.value!.stale).toBe(true);
        else {
          if (blocked === "protected") f.sheet.protection!.editObjects = true;
          if (blocked === "composition") callbacks.setComposing(false);
          expect(callbacks.historyStep("undo")).toBe(true);
          expect(callbacks.historyStep("redo")).toBe(true);
          expect(checkpoint(f)).toEqual(draft);
          expect(callbacks.commit()).toBe(true);
          expect(f.execute).toHaveBeenCalledOnce();
        }
      } finally {
        f.scope.stop();
      }
    },
  );

  test("callbacks captured from a closed session cannot change body paint or history of a new draft", () => {
    const f = fixture([textRoot(), { ...textRoot(), id: "second" }]);
    try {
      const old = f.begin();
      old.update("Old draft");
      old.cancel();
      const current = f.begin(f.sheet.drawings![1]!);
      current.update("Current draft");
      const draft = checkpoint(f);
      expect(old.setBodyStyle("fill", fill)).toBe(false);
      expect(old.setBodyStyle("line", line)).toBe(false);
      expect(old.setWarp({ preset: "textArchUp" })).toBe(false);
      expect(old.historyStep("undo")).toBe(false);
      expect(old.historyStep("redo")).toBe(false);
      expect(checkpoint(f)).toEqual(draft);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
});
