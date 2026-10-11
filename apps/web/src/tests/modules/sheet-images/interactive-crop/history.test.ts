import { afterEach, describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { fixture, leafPath } from "./fixture";

const fixtures: ReturnType<typeof fixture>[] = [];
function owner(id?: string, path: readonly string[] | null = null) {
  const value = fixture(id, path);
  fixtures.push(value);
  return value;
}
afterEach(() => fixtures.splice(0).forEach((value) => value.scope.stop()));

describe("interactive crop draft and workbook history", () => {
  test.each(["legacy0", "legacy90", "framed", "owned-group"])(
    "%s previews several gestures then applies the complete forest as exactly one undo",
    (id) => {
      const f = owner(id, id === "owned-group" ? leafPath : null);
      const before = serializeWorkbook(f.session.workbook);
      expect(f.crop.start()).toBe(true);
      f.gesture();
      f.gesture("se", { x: -9, y: 6 });
      const proposed = structuredClone(f.crop.previewRoots.value!);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.session.history.redoStack).toHaveLength(0);
      expect(f.crop.apply()).toBe(true);
      expect(f.crop.active.value).toBe(false);
      expect(f.crop.previewRoots.value).toBeUndefined();
      expect(f.crop.view.value).toBeUndefined();
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.execute).toHaveBeenLastCalledWith(proposed);
      expect(f.sheet.floatingImages).toEqual(proposed);
      expect(f.session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.session.workbook);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(undoWorkbookCommand(f.session)).toBe(false);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    },
  );

  test.each(["false", "throw"])(
    "execute %s preserves the exact draft, owner snapshot and history for one successful retry",
    (outcome) => {
      const f = owner("owned-group", leafPath);
      const before = serializeWorkbook(f.session.workbook);
      expect(f.crop.start()).toBe(true);
      f.gesture("e", { x: -8, y: 12 });
      const snapshot = f.crop.captureGesture()!;
      const view = structuredClone(f.crop.view.value!);
      const proposed = structuredClone(f.crop.previewRoots.value!);
      if (outcome === "false") f.execute.mockReturnValueOnce(false);
      else
        f.execute.mockImplementationOnce(() => {
          throw new Error("Rejected by host.");
        });
      expect(f.crop.apply()).toBe(false);
      expect(f.crop.active.value).toBe(true);
      expect(f.crop.captureGesture()!.sessionId).toBe(snapshot.sessionId);
      expect(f.crop.captureGesture()!.crop).toBe(snapshot.crop);
      expect(f.crop.view.value).toEqual(view);
      expect(f.crop.previewRoots.value).toEqual(proposed);
      expect(f.failure).toHaveBeenCalledTimes(1);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.session.history.redoStack).toHaveLength(0);
      expect(f.crop.apply()).toBe(true);
      expect(f.execute).toHaveBeenCalledTimes(2);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("an apply re-entered by the command owner cannot create a second workbook command", () => {
    const f = owner();
    expect(f.crop.start()).toBe(true);
    f.gesture();
    let reentered: boolean | undefined;
    f.execute.mockImplementation((roots) => {
      reentered = f.crop.apply();
      return f.commit(roots);
    });
    expect(f.crop.apply()).toBe(true);
    expect(reentered).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("execute changing the owner before throwing revokes its stale draft without history", () => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    const snapshot = f.gesture();
    f.execute.mockImplementationOnce(() => {
      f.selectedIds.value = ["legacy0"];
      throw new Error("Owner changed while the command was rejected.");
    });
    expect(f.crop.apply()).toBe(false);
    expect(f.failure).toHaveBeenCalledTimes(1);
    expect(f.crop.active.value).toBe(false);
    expect(f.crop.view.value).toBeUndefined();
    expect(f.crop.previewRoots.value).toBeUndefined();
    expect(f.crop.previewGesture(snapshot, "source", { x: 8, y: 4 })).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.crop.start()).toBe(true);
    expect(f.crop.view.value!.picture.id).toBe("legacy0");
  });

  test("local Undo and Redo change only finished drafts and a fresh gesture clears local Redo", () => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    const initial = f.crop.captureGesture()!.crop;
    f.gesture();
    const first = f.crop.captureGesture()!.crop;
    f.gesture("sw", { x: -15, y: 11 });
    const second = f.crop.captureGesture()!.crop;
    expect(f.crop.undoDraft()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toEqual(first);
    expect(f.crop.undoDraft()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toEqual(initial);
    expect(f.crop.undoDraft()).toBe(false);
    expect(f.crop.redoDraft()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toEqual(first);
    expect(f.crop.redoDraft()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toEqual(second);
    expect(f.crop.redoDraft()).toBe(false);
    expect(f.crop.undoDraft()).toBe(true);
    f.gesture("source", { x: -5, y: 3 });
    expect(f.crop.redoDraft()).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("cancelling an unfinished pointer gesture restores its preceding draft", () => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    f.gesture();
    const snapshot = f.crop.captureGesture()!;
    expect(f.crop.previewGesture(snapshot, "ne", { x: 15, y: -10 })).toBe(true);
    expect(f.crop.captureGesture()!.crop).not.toEqual(snapshot.crop);
    f.crop.cancelGesture(snapshot);
    expect(f.crop.captureGesture()!.crop).toBe(snapshot.crop);
    expect(f.crop.undoDraft()).toBe(true);
    expect(f.crop.undoDraft()).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each(["legacy0", "legacy90", "framed", "owned-group"])(
    "%s unchanged draft and a draft undone back to its initial state create no command",
    (id) => {
      const f = owner(id, id === "owned-group" ? leafPath : null);
      const before = serializeWorkbook(f.session.workbook);
      expect(f.crop.start()).toBe(true);
      f.gesture("source", { x: 0, y: 0 });
      expect(f.crop.undoDraft()).toBe(false);
      expect(f.crop.apply()).toBe(true);
      expect(f.crop.start()).toBe(true);
      f.gesture();
      expect(f.crop.undoDraft()).toBe(true);
      expect(f.crop.apply()).toBe(true);
      expect(f.crop.active.value).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("explicit Cancel discards the original draft without touching workbook history", () => {
    const f = owner("legacy90");
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    f.gesture();
    f.gesture("nw", { x: 10, y: 4 });
    f.crop.cancel();
    expect(f.crop.active.value).toBe(false);
    expect(f.crop.captureGesture()).toBeUndefined();
    expect(f.crop.apply()).toBe(false);
    expect(f.crop.undoDraft()).toBe(false);
    expect(f.crop.redoDraft()).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.crop.start()).toBe(true);
    expect(f.crop.undoDraft()).toBe(false);
  });

  test("opposite finished source drags returning the exact legacy crop are a durable no-op", () => {
    const f = owner("legacy0");
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    const initial = f.crop.captureGesture()!.crop;
    f.gesture("source", { x: 12, y: 0 });
    f.gesture("source", { x: -12, y: 0 });
    const returned = f.crop.captureGesture()!.crop;
    expect(returned).toEqual(initial);
    expect(returned.source).not.toBe(initial.source);
    expect(f.crop.apply()).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("a ratio preset belongs to draft Undo, keeps content and survives a refused apply", () => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    const initial = f.crop.captureGesture()!.crop;
    expect(f.crop.setRatio(16 / 9)).toBe(true);
    const preset = f.crop.captureGesture()!.crop;
    expect(preset.layout.rect.width / preset.layout.rect.height).toBeCloseTo(16 / 9);
    expect(preset.layout.angleDeg).toBe(initial.layout.angleDeg);
    expect(preset.source.offsetXRatio).toBe(0);
    expect(preset.source.offsetYRatio).toBe(0);
    expect(preset.layout.rect.width * preset.source.widthRatio).toBeCloseTo(
      initial.layout.rect.width * initial.source.widthRatio,
    );
    expect(preset.layout.rect.height * preset.source.heightRatio).toBeCloseTo(
      initial.layout.rect.height * initial.source.heightRatio,
    );
    expect(f.crop.undoDraft()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toBe(initial);
    expect(f.crop.redoDraft()).toBe(true);
    expect(f.crop.captureGesture()!.crop).toBe(preset);
    const proposed = structuredClone(f.crop.previewRoots.value!);
    f.execute.mockReturnValueOnce(false);
    expect(f.crop.apply()).toBe(false);
    expect(f.crop.active.value).toBe(true);
    expect(f.crop.captureGesture()!.crop).toBe(preset);
    expect(f.crop.previewRoots.value).toEqual(proposed);
    expect(f.failure).toHaveBeenCalledTimes(1);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.crop.apply()).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test.each([0, -1, NaN, Infinity])(
    "invalid ratio %s preserves its draft and local Undo",
    (ratio) => {
      const f = owner();
      const before = serializeWorkbook(f.session.workbook);
      expect(f.crop.start()).toBe(true);
      f.gesture();
      const draft = f.crop.captureGesture()!;
      expect(f.crop.setRatio(ratio)).toBe(false);
      expect(f.crop.captureGesture()!.crop).toBe(draft.crop);
      expect(f.failure).toHaveBeenCalledTimes(1);
      expect(f.crop.undoDraft()).toBe(true);
      expect(f.crop.undoDraft()).toBe(false);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test.each([
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
    { x: "12", y: 0 },
  ])("invalid pointer delta %j is atomic", (delta) => {
    const f = owner();
    const before = serializeWorkbook(f.session.workbook);
    expect(f.crop.start()).toBe(true);
    const snapshot = f.crop.captureGesture()!;
    expect(f.crop.previewGesture(snapshot, "source", delta as never)).toBe(false);
    expect(f.crop.previewGesture(snapshot, "se", delta as never)).toBe(false);
    expect(f.crop.captureGesture()!.crop).toBe(snapshot.crop);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });
});
