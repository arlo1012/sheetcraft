// @vitest-environment node
import { describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { findShapeGroupNode } from "@sheetcraft/core/shape-group";
import { fixture, textRoot, deepRoot } from "./shape-text-edit-session-fixture";
import { useShapeTextCharacterFormatPane } from "../../../modules/sheet-drawings/useShapeTextCharacterFormatPane";
import type { ShapeChoice, ShapeLine, ShapePaint } from "@sheetcraft/core/shape-style";

const red: ShapeChoice<ShapePaint> = {
  kind: "value",
  value: { kind: "solid", color: { kind: "rgb", rgb: "#FF0000" }, opacity: 1 },
};
const blue: ShapeChoice<ShapeLine> = {
  kind: "value",
  value: {
    paint: { kind: "solid", color: { kind: "rgb", rgb: "#0000FF" }, opacity: 1 },
    widthPt: 0.75,
    compound: "single",
    dash: "solid",
    cap: "butt",
    join: "round",
    miterLimit: 4,
  },
};
function setup(owned = false) {
  const root = owned ? deepRoot() : textRoot();
  const leaf =
    root.kind === "shapeGroup"
      ? findShapeGroupNode(root, ["outer", "nested", "target"])!.node
      : root;
  if (leaf.kind === "shapeGroup") throw Error("leaf");
  leaf.text = "alpha beta";
  const f = fixture([root]);
  const callbacks = f.begin(
    f.sheet.drawings![0]!,
    owned ? ["outer", "nested", "target"] : undefined,
  );
  const pane = f.scope.run(() =>
    useShapeTextCharacterFormatPane({
      getSnapshot: () => f.editor.snapshot.value,
      getCallbacks: () => f.editor.callbacks(f.editor.snapshot.value!.sessionId),
      getWorkbookId: () => f.workbook.id,
      getSheetId: () => f.sheet.id,
      getLocale: () => "en-US",
    }),
  )!;
  function style(category: "fill" | "line", value: typeof red | typeof blue | undefined) {
    const state = pane.snapshot.value!;
    return pane.onIntent({
      type: "set-style",
      target: "text",
      category,
      value,
      owner: state.owner,
      baseRevision: state.revision,
      intentId: `text-${category}-${state.revision}`,
    } as Parameters<typeof pane.onIntent>[0]);
  }
  return { ...f, callbacks, pane, style };
}
describe("WordArt range glyph appearance shares the leased text draft", () => {
  test.each([false, true])(
    "fill/outline changes only alpha and commit/Undo is atomic (owned=%s)",
    (owned) => {
      const f = setup(owned);
      try {
        const before = serializeWorkbook(f.workbook);
        f.callbacks.setSelection({ start: 0, end: 6, direction: "forward" });
        expect(f.pane.capabilities.value.styles?.text?.fill?.enabled).toBe(true);
        expect(f.style("fill", red)).toBe(true);
        expect(f.style("line", blue)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(f.editor.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
          { start: 0, end: 6, fill: red, line: blue },
        ]);
        expect(f.pane.snapshot.value!.textStyle).toMatchObject({ fill: red, line: blue });
        f.callbacks.setSelection({ start: 6, end: 10, direction: "forward" });
        expect(f.pane.snapshot.value!.textStyle?.line).toEqual({ kind: "none" });
        expect(f.pane.snapshot.value!.textStyle?.fill).not.toEqual(red);
        expect(f.callbacks.commit()).toBe(true);
        const after = serializeWorkbook(f.workbook);
        expect(after.version).toBe(70);
        expect(f.core.history.undoStack).toHaveLength(1);
        expect(undoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(redoWorkbookCommand(f.core)).toBe(true);
        expect(serializeWorkbook(f.workbook)).toEqual(after);
      } finally {
        f.scope.stop();
      }
    },
  );
  test("None differs from inherit; color supersedes only the selected fill", () => {
    const f = setup();
    try {
      f.callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
      expect(f.style("fill", red)).toBe(true);
      const state = f.pane.snapshot.value!;
      expect(
        f.pane.onIntent({
          type: "set-field",
          field: "textColor",
          value: "#00ff00",
          owner: state.owner,
          baseRevision: state.revision,
          intentId: "color",
        }),
      ).toBe(true);
      expect(f.editor.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
        { start: 0, end: 5, color: "#00ff00" },
      ]);
      expect(f.style("fill", { kind: "none" })).toBe(true);
      expect(f.editor.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
        { start: 0, end: 5, fill: { kind: "none" } },
      ]);
      expect(f.style("fill", undefined)).toBe(true);
      expect(f.editor.snapshot.value!.draftView.shapeText!.characterRuns).toBeUndefined();
      expect(f.callbacks.commit()).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
    } finally {
      f.scope.stop();
    }
  });
  test("mixed readback, old callbacks and composing guards retain the entire draft", () => {
    const f = setup();
    try {
      f.callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
      expect(f.style("line", blue)).toBe(true);
      const old = f.pane.snapshot.value!;
      f.callbacks.setSelection({ start: 0, end: 10, direction: "forward" });
      expect(f.pane.snapshot.value!.mixedStyleCategories?.text).toContain("line");
      expect(f.pane.snapshot.value!.textStyle?.line).toBeUndefined();
      expect(
        f.pane.onIntent({
          type: "set-style",
          target: "text",
          category: "fill",
          value: red,
          owner: old.owner,
          baseRevision: old.revision,
          intentId: "stale",
        }),
      ).toBe(false);
      const draft = f.editor.snapshot.value!.draftView;
      f.callbacks.setComposing(true);
      expect(f.style("fill", red)).toBe(false);
      expect(f.editor.snapshot.value!.draftView).toBe(draft);
      expect(f.core.history.undoStack).toHaveLength(0);
      f.callbacks.setComposing(false);
      f.generation.value++;
      expect(f.style("fill", red)).toBe(false);
      expect(f.editor.snapshot.value!.draftView).toBe(draft);
      expect(f.core.history.undoStack).toHaveLength(0);
    } finally {
      f.scope.stop();
    }
  });
});

test("text transform remains object-level during a leased draft and composing never partially commits", () => {
  const f = setup();
  try {
    f.callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
    expect(f.style("fill", red)).toBe(true);
    const draft = f.editor.snapshot.value!.draftView;
    const snapshot = f.pane.snapshot.value!;
    expect(f.pane.capabilities.value.textWarp?.enabled).toBe(false);
    expect(f.pane.capabilities.value.textWarp?.reason).toContain("Apply the text");
    expect(snapshot.scopeDescription).toContain("text-transform");
    const transform = () =>
      f.pane.onIntent({
        type: "set-text-warp",
        value: { preset: "textWave1" },
        owner: snapshot.owner,
        baseRevision: snapshot.revision,
        intentId: "object-transform",
      });
    expect(transform()).toBe(false);
    f.callbacks.setComposing(true);
    expect(transform()).toBe(false);
    expect(f.editor.snapshot.value!.draftView).toBe(draft);
    expect(f.editor.snapshot.value!.draftView.shapeText!.characterRuns).toEqual([
      { start: 0, end: 5, fill: red },
    ]);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.core.history.undoStack).toHaveLength(0);
  } finally {
    f.scope.stop();
  }
});
