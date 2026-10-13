import { describe, expect, test } from "vitest";
import {
  cloneShapeRichTextSnapshot,
  normalizeShapeRichTextSelection,
  reconcileShapeRichTextComposition,
  replaceShapeRichTextSelection,
  shapeRichTextDeletionRange,
  shapeRichTextSourcesEqual,
  ShapeRichTextInputHistory,
  SHAPE_RICH_TEXT_HISTORY_LIMIT,
  type ShapeRichTextSnapshot,
} from "../../../modules/sheet-drawings/shape-rich-text-input-model";

function snapshot(overrides: Partial<ShapeRichTextSnapshot> = {}): ShapeRichTextSnapshot {
  return cloneShapeRichTextSnapshot({
    source: {
      text: "abcd",
      characterRuns: [
        { start: 0, end: 2, bold: true, fontFamily: "Georgia" },
        { start: 2, end: 4, italic: true, color: "#ff0000" },
      ],
    },
    selection: { start: 2, end: 2, direction: "none" },
    ...overrides,
  });
}
describe("shape rich text input model", () => {
  test("inherits the first replaced character and backward caret style", () => {
    const state = snapshot();
    expect(replaceShapeRichTextSelection(state, state.selection, "X").source).toEqual({
      text: "abXcd",
      characterRuns: [
        { start: 0, end: 3, bold: true, fontFamily: "Georgia" },
        { start: 3, end: 5, italic: true, color: "#ff0000" },
      ],
    });
    const replaced = replaceShapeRichTextSelection(
      state,
      { start: 2, end: 4, direction: "backward" },
      "X",
    );
    expect(replaced.source.characterRuns?.at(-1)).toEqual({
      start: 2,
      end: 3,
      italic: true,
      color: "#ff0000",
    });
  });
  test("a complete sparse pending caret override clears removed family and preserves explicit false", () => {
    const state = snapshot({ pendingFormat: { bold: false, underline: true } });
    const next = replaceShapeRichTextSelection(state, state.selection, "X");
    expect(next.source.characterRuns?.[1]).toEqual({
      start: 2,
      end: 3,
      bold: false,
      underline: true,
    });
    expect(next.pendingFormat).toEqual(state.pendingFormat);
    expect(state.source.text).toBe("abcd");
  });
  test("an explicit empty pending format resets inherited family for typing and IME", () => {
    const state = snapshot({ pendingFormat: {} });
    const typed = replaceShapeRichTextSelection(state, state.selection, "X");
    expect(typed.source.characterRuns).toEqual([
      { start: 0, end: 2, bold: true, fontFamily: "Georgia" },
      { start: 3, end: 5, italic: true, color: "#ff0000" },
    ]);
    const composed = reconcileShapeRichTextComposition(state, "ab中cd");
    expect(composed.source.characterRuns).toEqual(typed.source.characterRuns);
  });
  test("surrogate, combining and ZWJ selections never split a grapheme", () => {
    const text = "A😀e\u0301👩‍💻Z";
    expect(
      normalizeShapeRichTextSelection(text, { start: 2, end: 4, direction: "backward" }),
    ).toEqual({ start: 1, end: 5, direction: "backward" });
    expect(
      shapeRichTextDeletionRange(
        text,
        { start: 10, end: 10, direction: "none" },
        "deleteContentBackward",
      ),
    ).toEqual({ start: 5, end: 10, direction: "none" });
    expect(
      shapeRichTextDeletionRange(
        text,
        { start: 3, end: 3, direction: "none" },
        "deleteContentForward",
      ),
    ).toEqual({ start: 3, end: 5, direction: "none" });
  });
  test("inserting a combining mark joins the complete styled grapheme", () => {
    const state = snapshot({
      source: { text: "eX", characterRuns: [{ start: 0, end: 1, bold: true }] },
      selection: { start: 1, end: 1, direction: "none" },
    });
    const next = replaceShapeRichTextSelection(state, state.selection, "\u0301");
    expect(next.source).toEqual({
      text: "e\u0301X",
      characterRuns: [{ start: 0, end: 2, bold: true }],
    });
    expect(next.selection.start).toBe(2);
  });
  test("reconciles one IME transaction and preserves its selected style", () => {
    const state = snapshot({ selection: { start: 2, end: 4, direction: "backward" } });
    const next = reconcileShapeRichTextComposition(state, "ab中文");
    expect(next.source).toEqual({
      text: "ab中文",
      characterRuns: [
        { start: 0, end: 2, bold: true, fontFamily: "Georgia" },
        { start: 2, end: 4, italic: true, color: "#ff0000" },
      ],
    });
    expect(reconcileShapeRichTextComposition(state, "abcd")).toEqual(state);
  });
  test("anchors repeated IME text to the captured caret and rejects out-of-range changes", () => {
    const state = snapshot({
      source: {
        text: "aaaa",
        characterRuns: [
          { start: 0, end: 1, bold: true },
          { start: 2, end: 3, italic: true },
        ],
      },
      selection: { start: 1, end: 1, direction: "none" },
    });
    expect(reconcileShapeRichTextComposition(state, "aaaaa").source).toEqual({
      text: "aaaaa",
      characterRuns: [
        { start: 0, end: 2, bold: true },
        { start: 3, end: 4, italic: true },
      ],
    });
    expect(() => reconcileShapeRichTextComposition(state, "Xaaaa")).toThrow(/captured selection/);
  });
  test("history restores same-text font changes, exact selections and pending format", () => {
    const first = snapshot();
    const history = new ShapeRichTextInputHistory(first);
    const styled = snapshot({
      source: {
        text: "abcd",
        characterRuns: [{ start: 0, end: 4, fontFamily: "Arial", bold: false }],
      },
      selection: { start: 0, end: 4, direction: "backward" },
    });
    history.record(styled);
    history.record({
      ...styled,
      selection: { start: 4, end: 4, direction: "none" },
      pendingFormat: { strike: true },
    });
    expect(history.step("undo")).toEqual(styled);
    expect(history.step("undo")).toEqual(first);
    expect(history.step("redo")).toEqual(styled);
    expect(history.step("redo")?.pendingFormat).toEqual({ strike: true });
  });
  test("branches after undo and returns defensive copies", () => {
    const history = new ShapeRichTextInputHistory(snapshot());
    history.record(snapshot({ source: { text: "one" } }));
    history.record(snapshot({ source: { text: "two" } }));
    const restored = history.step("undo")!;
    restored.selection.start = 0;
    expect(history.current.selection.start).toBe(2);
    history.record(snapshot({ source: { text: "branch" } }));
    expect(history.step("redo")).toBeUndefined();
  });
  test("bounds local history and rejects over-budget text", () => {
    const history = new ShapeRichTextInputHistory(snapshot());
    for (let index = 0; index < 150; index++)
      history.record(snapshot({ source: { text: `${index}` } }));
    expect(history.length).toBe(SHAPE_RICH_TEXT_HISTORY_LIMIT);
    expect(() => snapshot({ source: { text: "x".repeat(100001) } })).toThrow();
  });
  test("empty sources have no zero-length style runs and same text compares fonts", () => {
    const empty = replaceShapeRichTextSelection(
      snapshot(),
      { start: 0, end: 4, direction: "forward" },
      "",
    );
    expect(empty.source).toEqual({ text: "" });
    expect(shapeRichTextSourcesEqual(snapshot().source, { text: "abcd" })).toBe(false);
  });
});
