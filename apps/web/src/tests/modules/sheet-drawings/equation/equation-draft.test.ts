// @vitest-environment node
import { describe, expect, test } from "vitest";
import type {
  EquationDocument,
  EquationNode,
  EquationSequence,
} from "@sheetcraft/core/equation-document";
import { findEquationNode } from "@sheetcraft/core/equation-document";
import {
  applyEquationDraftAction,
  captureEquationComposition,
  createEquationDraft,
  equationDocumentKey,
  equationSlotText,
  equationStructureAtSelection,
  equationTextDifference,
  EquationDraftHistory,
  exitEquationSlot,
  finishEquationComposition,
  nextEquationSlot,
  normalizeEquationSelection,
} from "../../../../modules/sheet-drawings/equation/equation-draft";
const slot = (id: string, value = ""): EquationSequence => ({
  kind: "sequence",
  id,
  children: value ? [{ kind: "text", id: `${id}-text`, value }] : [],
});
const document = (...children: EquationNode[]): EquationDocument => ({
  kind: "equation-document-v1",
  body: { ...slot("body"), children },
});
const fraction = (): EquationNode => ({
  kind: "fraction",
  id: "fraction",
  style: "stacked",
  numerator: slot("num", "ab"),
  denominator: slot("den", "c"),
});
const matrix = (): EquationNode => ({
  kind: "matrix",
  id: "matrix",
  brackets: "bracket",
  alignment: "center",
  rows: [
    [slot("r0c0", "12"), slot("r0c1", "3")],
    [slot("r1c0", "4"), slot("r1c1", "5")],
  ],
});
const node = (state: { document: EquationDocument }, id: string) =>
  findEquationNode(state.document, id)!;

describe("semantic equation private draft", () => {
  test("slot replacement nests structures and preserves unrelated slots without mutating source", () => {
    const original = createEquationDraft(document(fraction()), { slotId: "num", start: 1, end: 2 });
    const before = equationDocumentKey(original.document);
    const template: EquationNode = { kind: "radical", id: "radical", radicand: slot("radicand") };
    const next = applyEquationDraftAction(original, {
      type: "insert-nodes",
      selection: original.selection,
      nodes: [template],
    })!;
    const numerator = node(next, "num") as EquationSequence;
    expect(numerator.children.map((child) => child.kind)).toEqual(["text", "radical"]);
    expect(equationSlotText(numerator)).toBe("a\ufffc");
    expect(next.selection).toEqual({ slotId: "num", start: 2, end: 2 });
    expect(equationSlotText(node(next, "den") as EquationSequence)).toBe("c");
    expect(equationDocumentKey(original.document)).toBe(before);
    expect(template.id).toBe("radical");
  });
  test("replacement caret is before preserved suffix and text runs stay bounded", () => {
    const before = createEquationDraft(document({ kind: "text", id: "text", value: "abc" }));
    const next = applyEquationDraftAction(before, {
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 0 },
      text: "x",
    })!;
    expect(equationSlotText(next.document.body)).toBe("xabc");
    expect(next.selection.start).toBe(1);
    expect(next.document.body.children).toHaveLength(1);
  });
  test("no-op replacement preserves IDs and does not add private history", () => {
    const history = new EquationDraftHistory(
      createEquationDraft(document({ kind: "text", id: "original", value: "ab" })),
    );
    history.apply({
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 2 },
      text: "ab",
    });
    expect(history.current.document.body.children[0]!.id).toBe("original");
    expect(history.canUndo).toBe(false);
  });
  test("whole grapheme bounds protect emoji, surrogate pairs and combining marks", () => {
    const doc = document({ kind: "text", id: "text", value: "a👩‍💻éz" });
    expect(normalizeEquationSelection(doc, { slotId: "body", start: 3, end: 4 })).toEqual({
      slotId: "body",
      start: 1,
      end: 6,
    });
    expect(normalizeEquationSelection(doc, { slotId: "body", start: 7, end: 7 })).toEqual({
      slotId: "body",
      start: 6,
      end: 6,
    });
    const next = applyEquationDraftAction(createEquationDraft(doc), {
      type: "replace-text",
      selection: { slotId: "body", start: 3, end: 4 },
      text: "x",
    })!;
    expect(equationSlotText(next.document.body)).toBe("axéz");
  });
  test.each([
    ["😀", "😃"],
    ["á", "â"],
    ["👩‍💻", "👨‍💻"],
    ["ab", "a😀b"],
  ])("native input diff keeps complete graphemes %s → %s", (oldValue, value) => {
    const diff = equationTextDifference(oldValue, value);
    expect(oldValue.slice(0, diff.start) + diff.text + oldValue.slice(diff.end)).toBe(value);
  });
  test("fraction styles are captured by node ID and reversible privately", () => {
    const history = new EquationDraftHistory(
      createEquationDraft(document(fraction()), { slotId: "den", start: 1, end: 1 }),
    );
    history.apply({ type: "fraction-style", nodeId: "fraction", style: "linear" });
    expect(node(history.current, "fraction")).toMatchObject({ style: "linear" });
    expect(node(history.undo()!, "fraction")).toMatchObject({ style: "stacked" });
    expect(node(history.redo()!, "fraction")).toMatchObject({ style: "linear" });
    expect(history.current.selection.slotId).toBe("den");
  });
  test("semantically distinct but visually equivalent trees get real private history", () => {
    const first = document({ kind: "text", id: "text", value: "a" });
    const history = new EquationDraftHistory(createEquationDraft(first));
    history.push(
      createEquationDraft(document({ kind: "text", id: "new-slot", value: "a", mode: "math" })),
    );
    expect(history.canUndo).toBe(true);
    expect(history.undo()!.document).toEqual(first);
  });
  test("matrix dimensions, alignment, deletion focus and undo are atomic", () => {
    const history = new EquationDraftHistory(
      createEquationDraft(document(matrix()), { slotId: "r0c0", start: 1, end: 1 }),
    );
    history.apply({ type: "matrix-row", nodeId: "matrix", operation: "insert", index: 1 });
    history.apply({ type: "matrix-column", nodeId: "matrix", operation: "insert", index: 1 });
    history.apply({ type: "matrix-alignment", nodeId: "matrix", alignment: "right" });
    const changed = node(history.current, "matrix");
    if (changed.kind !== "matrix") throw Error("matrix required");
    expect(changed.rows).toHaveLength(3);
    expect(changed.rows[0]).toHaveLength(3);
    expect(changed.alignment).toBe("right");
    history.apply({ type: "matrix-row", nodeId: "matrix", operation: "delete", index: 0 });
    expect(findEquationNode(history.current.document, history.current.selection.slotId)?.kind).toBe(
      "sequence",
    );
    expect(history.undo()!.selection.slotId).toBe("r0c0");
  });
  test("matrix cannot exceed 16 or delete its final row/column", () => {
    const doc = document({
      kind: "matrix",
      id: "matrix",
      brackets: "none",
      alignment: "center",
      rows: [Array.from({ length: 16 }, (_, i) => slot(`cell-${i}`))],
    });
    const state = createEquationDraft(doc);
    expect(
      applyEquationDraftAction(state, {
        type: "matrix-column",
        nodeId: "matrix",
        operation: "insert",
        index: 16,
      }),
    ).toBeNull();
    expect(
      applyEquationDraftAction(state, {
        type: "matrix-row",
        nodeId: "matrix",
        operation: "delete",
        index: 0,
      }),
    ).toBeNull();
    expect(
      applyEquationDraftAction(state, {
        type: "matrix-row",
        nodeId: "matrix",
        operation: "insert",
        index: -1,
      }),
    ).toBeNull();
  });
  test("missing structure/slot, invalid enum and text budget all reject without draft loss", () => {
    const state = createEquationDraft(document(fraction())),
      original = equationDocumentKey(state.document);
    expect(
      applyEquationDraftAction(state, {
        type: "replace-text",
        selection: { slotId: "gone", start: 0, end: 0 },
        text: "lost",
      }),
    ).toBeNull();
    expect(
      applyEquationDraftAction(state, { type: "fraction-style", nodeId: "gone", style: "linear" }),
    ).toBeNull();
    expect(
      applyEquationDraftAction(state, {
        type: "replace-text",
        selection: state.selection,
        text: "x".repeat(16384),
      }),
    ).toBeNull();
    expect(equationDocumentKey(state.document)).toBe(original);
  });
  test("a combining leaf after a structural unit cannot select or remove that structure", () => {
    const source = document(fraction(), { kind: "text", id: "combining", value: "\u0301" });
    const selection = { slotId: "body", start: 1, end: 2 };
    expect(normalizeEquationSelection(source, selection)).toEqual(selection);
    const next = applyEquationDraftAction(createEquationDraft(source), {
      type: "replace-text",
      selection,
      text: "x",
    })!;
    expect(next.document.body.children[0]!.kind).toBe("fraction");
    expect(equationSlotText(next.document.body)).toBe("\ufffcx");
  });
  test("plain typing inherits the existing normal-text mode", () => {
    const source = document({ kind: "text", id: "normal", value: "distance", mode: "normal" });
    const next = applyEquationDraftAction(createEquationDraft(source), {
      type: "replace-text",
      selection: { slotId: "body", start: 8, end: 8 },
      text: " x",
    })!;
    expect(next.document.body.children).toHaveLength(1);
    expect(next.document.body.children[0]).toMatchObject({
      kind: "text",
      value: "distance x",
      mode: "normal",
    });
  });
  test("composition captures original range, commits once, and rejects changed owners/content", () => {
    const state = createEquationDraft(document({ kind: "text", id: "text", value: "ab" }), {
      slotId: "body",
      start: 0,
      end: 1,
    });
    const capture = captureEquationComposition(state, "drawing-a", 1);
    const moved = { ...state, selection: { slotId: "body", start: 2, end: 2 } };
    const done = finishEquationComposition(moved, capture, "汉", "drawing-a", 1)!;
    expect(equationSlotText(done.document.body)).toBe("汉b");
    expect(finishEquationComposition(state, capture, "汉", "drawing-b", 1)).toBeNull();
    expect(finishEquationComposition(state, capture, "汉", "drawing-a", 2)).toBeNull();
    expect(finishEquationComposition(done, capture, "汉", "drawing-a", 1)).toBeNull();
  });
  test("explicit slot navigation and edge exit preserve nested structures", () => {
    const root: EquationNode = { kind: "radical", id: "root", radicand: slot("radicand", "x") };
    const doc = document({
      ...fraction(),
      kind: "fraction",
      numerator: { ...slot("num"), children: [root] },
      denominator: slot("den", "c"),
      id: "fraction",
      style: "stacked",
    });
    const state = createEquationDraft(doc, { slotId: "radicand", start: 1, end: 1 });
    expect(exitEquationSlot(doc, state.selection, "forward")).toEqual({
      slotId: "num",
      start: 1,
      end: 1,
    });
    expect(nextEquationSlot(state, "forward").slotId).toBe("den");
    expect(equationStructureAtSelection(doc, state.selection)?.id).toBe("root");
  });
  test("legacy LaTeX source stays opaque and editable without semantic HTML conversion", () => {
    const state = createEquationDraft(document({ kind: "latex", id: "source", value: "x+y" }));
    const next = applyEquationDraftAction(state, {
      type: "replace-text",
      selection: { slotId: "body", start: 2, end: 3 },
      text: "z",
    })!;
    expect(next.document.body.children).toHaveLength(1);
    expect(next.document.body.children[0]).toMatchObject({ kind: "latex", value: "x+z" });
  });
});
