// @vitest-environment node
import { expect, test } from "vitest";
import { findShapeGroupNode } from "@sheetcraft/core/shape-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { replaceShapeTextCharacterRange } from "@sheetcraft/core/shape-text-character-runs";
import type { ShapeFormatIntent } from "../../../modules/sheet-drawings/shape-format-pane-model";
import { fixture, textRoot, deepRoot } from "./shape-text-edit-session-fixture";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { materializeWordArtStylePreset } from "../../../modules/sheet-drawings/wordart-style-presets";
import { materializeWordArtCharacterStylePreset } from "../../../modules/sheet-drawings/wordart-style-application";
import { useShapeTextCharacterFormatPane } from "../../../modules/sheet-drawings/useShapeTextCharacterFormatPane";

function subject(owned = false) {
  const root = owned ? deepRoot() : textRoot(),
    node =
      root.kind === "shapeGroup"
        ? findShapeGroupNode(root, ["outer", "nested", "target"])!.node
        : root;
  if (node.kind !== "shape") throw Error("shape");
  node.wordArt = true;
  node.text = "alpha beta";
  node.shapeText = {
    ...createDefaultShapeText(),
    style: materializeWordArtStylePreset("accent3-solid"),
    characterRuns: [{ start: 0, end: 6, fontSize: 26, bold: false, italic: true, underline: true }],
  };
  const f = fixture([root]),
    callbacks = f.begin(f.sheet.drawings![0]!, owned ? ["outer", "nested", "target"] : undefined),
    pane = f.scope.run(() =>
      useShapeTextCharacterFormatPane({
        getSnapshot: () => f.editor.snapshot.value,
        getCallbacks: () => f.editor.callbacks(f.editor.snapshot.value!.sessionId),
        getWorkbookId: () => f.workbook.id,
        getSheetId: () => f.sheet.id,
        getLocale: () => "en-US",
      }),
    )!;
  const intent = (body: object): ShapeFormatIntent =>
    ({
      ...body,
      owner: pane.snapshot.value!.owner,
      baseRevision: pane.snapshot.value!.revision,
      intentId: "style",
    }) as ShapeFormatIntent;
  return { ...f, callbacks, pane, intent };
}

test.each([false, true])(
  "selected WordArt recipe is a five-category single draft edit (owned=%s)",
  (owned) => {
    const f = subject(owned);
    try {
      const original = serializeWorkbook(f.workbook);
      f.callbacks.setSelection({ start: 0, end: 6, direction: "forward" });
      expect(f.pane.capabilities.value.wordArtStyle?.enabled).toBe(true);
      expect(f.pane.capabilities.value.clearWordArtEffects?.enabled).toBe(false);
      const draft = f.editor.snapshot.value!,
        revision = draft.formatRevision;
      expect(
        f.pane.onIntent(f.intent({ type: "set-wordart-style", presetId: "black-soft-shadow" })),
      ).toBe(true);
      const after = f.editor.snapshot.value!;
      expect(after.formatRevision).toBe(revision + 1);
      expect(after.selection).toEqual(draft.selection);
      expect(after.draftText).toBe("alpha beta");
      expect(after.draftView.shapeText!.style).toEqual(draft.draftView.shapeText!.style);
      expect(after.draftView.shapeText!.characterRuns).toEqual([
        {
          start: 0,
          end: 6,
          fontSize: 26,
          bold: false,
          italic: true,
          underline: true,
          ...materializeWordArtCharacterStylePreset("black-soft-shadow"),
        },
      ]);
      expect(f.pane.snapshot.value!.wordArtStyleEditingScope).toBe("selection");
      expect(f.pane.snapshot.value!.wordArtStyleId).toBe("black-soft-shadow");
      expect(serializeWorkbook(f.workbook)).toEqual(original);
      expect(f.core.history.undoStack).toHaveLength(0);
      f.callbacks.setSelection({ start: 6, end: 10, direction: "forward" });
      expect(f.pane.snapshot.value!.wordArtStyleId).toBe("accent3-solid");
      f.callbacks.setSelection({ start: 0, end: 10, direction: "forward" });
      expect(f.pane.snapshot.value!.mixedWordArtStyle).toBe(true);
      expect(f.pane.snapshot.value!.wordArtStyleId).toBeUndefined();
      expect(f.callbacks.cancel()).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(original);
    } finally {
      f.scope.stop();
    }
  },
);

test("caret preset only affects inserted text and is cleared when selection moves", () => {
  const f = subject();
  try {
    f.callbacks.setSelection({ start: 6, end: 6, direction: "none" });
    expect(
      f.pane.onIntent(f.intent({ type: "set-wordart-style", presetId: "black-soft-shadow" })),
    ).toBe(true);
    const state = f.editor.snapshot.value!;
    expect(f.pane.snapshot.value!.wordArtStyleEditingScope).toBe("caret");
    expect(state.pendingFormat).toMatchObject(
      materializeWordArtCharacterStylePreset("black-soft-shadow"),
    );
    expect(state.draftView.shapeText!.characterRuns).toHaveLength(1);
    const source = replaceShapeTextCharacterRange(
      { text: state.draftText, characterRuns: state.draftView.shapeText!.characterRuns },
      6,
      6,
      "x",
      state.pendingFormat,
    );
    expect(
      f.callbacks.updateRich({
        source,
        selection: { start: 7, end: 7, direction: "none" },
        pendingFormat: state.pendingFormat,
      }),
    ).toBe(true);
    expect(f.editor.snapshot.value!.draftText).toBe("alpha xbeta");
    expect(
      f.editor.snapshot.value!.draftView.shapeText!.characterRuns!.find((run) => run.start === 6),
    ).toMatchObject({
      start: 6,
      end: 7,
      ...materializeWordArtCharacterStylePreset("black-soft-shadow"),
    });
    f.callbacks.setSelection({ start: 11, end: 11, direction: "none" });
    expect(f.editor.snapshot.value!.pendingFormat).toBeUndefined();
    expect(f.pane.snapshot.value!.wordArtStyleId).toBe("accent3-solid");
  } finally {
    f.scope.stop();
  }
});

test("composition, retired range and malformed preset leave the rich draft untouched", () => {
  const f = subject();
  try {
    f.callbacks.setSelection({ start: 0, end: 5, direction: "forward" });
    const captured = f.intent({ type: "set-wordart-style", presetId: "black-soft-shadow" }),
      before = f.editor.snapshot.value!.draftView;
    f.callbacks.setSelection({ start: 6, end: 10, direction: "forward" });
    expect(f.pane.onIntent(captured)).toBe(false);
    expect(f.pane.onIntent(f.intent({ type: "set-wordart-style", presetId: "forged" }))).toBe(
      false,
    );
    f.callbacks.setComposing(true);
    expect(f.pane.capabilities.value.wordArtStyle?.enabled).toBe(false);
    expect(
      f.pane.onIntent(
        f.intent({
          type: "set-style",
          target: "text",
          category: "shadow",
          value: materializeWordArtCharacterStylePreset("black-soft-shadow").shadow,
        }),
      ),
    ).toBe(false);
    expect(f.editor.snapshot.value!.draftView).toEqual(before);
    expect(f.core.history.undoStack).toHaveLength(0);
  } finally {
    f.scope.stop();
  }
});
