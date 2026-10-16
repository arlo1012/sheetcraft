// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
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
function setup(
  owned = false,
  kind: "shape" | "textBox" | "wordArt" = "shape",
  paintBoundary?: Parameters<typeof fixture>[1],
) {
  const root = owned ? deepRoot() : textRoot(kind === "textBox" ? "textBox" : "shape");
  if (kind === "wordArt" && root.kind !== "shapeGroup") root.wordArt = true;
  const leaf =
    root.kind === "shapeGroup"
      ? findShapeGroupNode(root, ["outer", "nested", "target"])!.node
      : root;
  if (leaf.kind === "shapeGroup") throw Error("leaf");
  leaf.text = "alpha beta";
  const f = fixture([root], paintBoundary);
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

test.each(["textBox", "wordArt"] as const)(
  "%s injected paint-proof transaction boundary receives merged glyph fill/warp; IME never partially commits",
  (kind) => {
    // This session/command test injects the native paint-proof boundary. It does
    // not claim browser glyph fidelity; the real Node-without-Canvas failure below
    // must still preserve the exact complete draft.
    const proof = vi.fn<NonNullable<NonNullable<Parameters<typeof fixture>[1]>["preflight"]>>(
      () => ({
        kind: "ready",
        proof: "native-alpha-warp",
        actualDensity: 1,
        estimatedPeakBytes: 0,
        contourCount: 0,
        edgeCount: 0,
        pointCount: 0,
        glyphCommandCount: 0,
      }),
    );
    const f = setup(false, kind, { preflight: proof });
    try {
      const before = serializeWorkbook(f.workbook);
      const selection = { start: 0, end: 5, direction: "backward" as const };
      f.callbacks.setSelection(selection);
      expect(f.style("fill", red)).toBe(true);
      expect(f.pane.capabilities.value.textWarp?.enabled).toBe(true);
      expect(f.pane.capabilities.value.fields.paragraphAlignment?.enabled).toBe(true);
      expect(f.pane.capabilities.value.fields.textMarginLeftPt?.enabled).toBe(true);
      expect(f.pane.capabilities.value.styles?.shape?.fill?.enabled).toBe(true);
      expect(f.pane.capabilities.value.styles?.shape?.line?.enabled).toBe(true);
      const transform = (preset: "textWave1" | "textArchUp") => {
        // Every accepted intent advances the same session's pane revision.
        const snapshot = f.pane.snapshot.value!;
        return f.pane.onIntent({
          type: "set-text-warp",
          value: { preset },
          owner: snapshot.owner,
          baseRevision: snapshot.revision,
          intentId: `object-transform-${snapshot.revision}`,
        });
      };
      expect(transform("textWave1")).toBe(true);
      const draft = f.editor.snapshot.value!.draftView;
      expect(draft.shapeText!.warp).toEqual({ preset: "textWave1" });
      expect(draft.shapeText!.characterRuns).toEqual([{ start: 0, end: 5, fill: red }]);
      expect(f.editor.snapshot.value!.selection).toEqual(selection);
      expect(f.pane.snapshot.value!.textWarp).toEqual({ preset: "textWave1" });
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      f.callbacks.setComposing(true);
      expect(transform("textArchUp")).toBe(false);
      expect(f.callbacks.commit()).toBe(false);
      expect(f.editor.snapshot.value!.draftView).toBe(draft);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.core.history.undoStack).toHaveLength(0);
      f.callbacks.setComposing(false);
      expect(f.callbacks.commit()).toBe(true);
      expect(proof).toHaveBeenCalledOnce();
      expect(proof.mock.calls[0]![0].drawing.shapeText?.warp).toEqual({ preset: "textWave1" });
      expect(proof.mock.calls[0]![0].drawing.shapeText?.characterRuns).toEqual([
        { start: 0, end: 5, fill: red },
      ]);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.core.history.undoStack).toHaveLength(1);
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

test("missing native warp proof preserves the complete same-lease draft without a command", () => {
  const f = setup(false, "textBox");
  try {
    const before = serializeWorkbook(f.workbook);
    f.callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
    expect(f.style("fill", red)).toBe(true);
    expect(f.callbacks.setWarp({ preset: "textWave1" })).toBe(true);
    const draft = f.editor.snapshot.value!.draftView;
    expect(f.callbacks.commit()).toBe(false);
    expect(f.editor.snapshot.value?.error?.code).toBe("prepare");
    expect(f.editor.snapshot.value?.draftView).toBe(draft);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  } finally {
    f.scope.stop();
  }
});
