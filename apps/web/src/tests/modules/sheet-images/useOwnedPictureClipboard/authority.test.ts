import { describe, expect, test } from "vitest";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { createSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { context, fixture, rect } from "./fixture";

describe("owned clipboard host command authority", () => {
  test.each([false, undefined, "throw"] as const)(
    "exact command outcome %s retains cut and history for an accepted retry",
    async (outcome) => {
      const f = fixture();
      await f.clipboard.copy([["owned-group"]], "cut");
      const identity = f.clipboard.getIdentity();
      const before = serializeWorkbook(f.session.workbook);
      f.execute.mockImplementationOnce(() => {
        if (outcome === "throw") throw new Error("Synthetic command refusal.");
        return outcome as boolean;
      });
      expect(f.clipboard.paste({ row: 7, column: 6 })).toBe(true);
      expect(f.clipboard.getIdentity()).toEqual(identity);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.clipboard.paste({ row: 7, column: 6 })).toBe(true);
      expect(f.clipboard.hasPending()).toBe(false);
      expect(f.session.history.undoStack).toHaveLength(1);
      const after = serializeWorkbook(f.session.workbook);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    },
  );

  test("root cut replaces the same stacking positions and preserves every descendant ID", async () => {
    const f = fixture();
    const originalIds = f.sheet.floatingImages.map((root) => root.id);
    const group = structuredClone(f.sheet.floatingImages[1]!);
    await f.clipboard.copy([["legacy"], ["owned-group"]], "cut");
    f.clipboard.paste({ row: 8, column: 5 }, f.transfer());
    expect(f.sheet.floatingImages.map((root) => root.id)).toEqual(originalIds);
    const moved = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(moved) || !isPictureGroup(group)) throw new Error("Expected group.");
    expect(moved.members).toEqual(group.members);
    expect(moved.frame.angleDeg).toBe(group.frame.angleDeg);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  test.each(["revision", "generation", "sheet-instance", "sheet-id", "metrics"] as const)(
    "stale %s cut cannot mutate a destination or source",
    async (change) => {
      const f = fixture();
      await f.clipboard.copy([["owned-group"]], "cut");
      if (change === "revision") f.session.history.revision += 1;
      if (change === "generation") f.setGeneration(4);
      if (change === "sheet-instance") f.setSheet({ ...f.sheet });
      if (change === "sheet-id") f.sheet.id = "replaced-id";
      if (change === "metrics") f.setContext(context(f.sheet));
      const before = serializeWorkbook(f.session.workbook);
      expect(f.clipboard.paste({ row: 7, column: 6 })).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.clipboard.hasPending()).toBe(false);
    },
  );

  test("same effective metrics allow a cut after viewport scroll and context wrapper replacement", async () => {
    const f = fixture();
    const capturedContext = f.getContext();
    const sourceRect = rect(f.sheet.floatingImages[1]!, capturedContext);
    await f.clipboard.copy([["owned-group"]], "cut");
    const capturedIdentity = f.clipboard.getIdentity();
    const scrolled = context(
      f.sheet,
      new Map([
        [0, 51],
        [1, 39],
      ]),
      { x: 390, y: 250 },
    );
    f.setContext({ metrics: capturedContext.metrics, layout: scrolled.layout });
    expect(f.clipboard.getIdentity()).toEqual(capturedIdentity);
    expect(f.clipboard.hasPending()).toBe(true);
    const address = { row: 7, column: 6 };
    const destination = scrolled.layout.getCellRect(address)!;
    expect(f.clipboard.paste(address)).toBe(true);
    const placed = rect(f.sheet.floatingImages[1]!, f.getContext());
    expect(placed).toEqual({
      x: destination.x,
      y: destination.y,
      width: sourceRect.width,
      height: sourceRect.height,
    });
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.clipboard.hasPending()).toBe(false);
  });

  test("a real effective AutoFit metric change still invalidates the captured cut", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "cut");
    f.setContext(
      context(
        f.sheet,
        new Map([
          [0, 79],
          [1, 39],
        ]),
      ),
    );
    const before = serializeWorkbook(f.session.workbook);
    expect(f.clipboard.paste({ row: 7, column: 6 })).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.clipboard.hasPending()).toBe(false);
  });

  test("hidden descendant source change without revision still rejects the entire cut", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "cut");
    const root = f.sheet.floatingImages[1]!;
    if (!isPictureGroup(root)) throw new Error("Expected group.");
    const nested = root.members[1]!;
    if (nested.kind !== "grouped-group-v1") throw new Error("Expected nested group.");
    nested.members[0]!.altText = "Changed hidden descendant";
    const before = serializeWorkbook(f.session.workbook);
    expect(f.clipboard.paste({ row: 7, column: 6 })).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.onFeedback).toHaveBeenLastCalledWith("clipboard.documentChanged");
    expect(f.clipboard.hasPending()).toBe(true);
  });

  test("copy keeps a detached complete source tree across later edits and destination owner replacement", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "copy");
    f.sheet.floatingImages[1]!.altText = "Edited after copy";
    const destination = createSheet("Destination", "destination");
    f.session.workbook.sheets.set(destination.id, destination);
    f.setSheet(destination);
    f.setContext(context(destination));
    f.setGeneration(8);
    f.session.history.revision += 1;
    expect(f.clipboard.paste({ row: 8, column: 5 })).toBe(true);
    expect(destination.floatingImages[0]!.altText).toBe("Synthetic group");
    expect(f.clipboard.hasPending()).toBe(true);
  });

  test("reentrant accepted cut completion cannot consume a newer copy", async () => {
    const f = fixture();
    await f.clipboard.copy([["owned-group"]], "cut");
    let newerCopy: Promise<void> | undefined;
    f.execute.mockImplementationOnce(() => {
      newerCopy = f.clipboard.copy([["legacy"]], "copy");
      return true;
    });
    expect(f.clipboard.paste({ row: 8, column: 5 })).toBe(true);
    await newerCopy;
    expect(f.clipboard.hasPending()).toBe(true);
    f.clipboard.paste({ row: 9, column: 5 });
    expect(f.sheet.floatingImages.at(-1)!.altText).toBe("Legacy");
  });

  test("reentrant copy cancellation before native write never overwrites the newer lease", async () => {
    const f = fixture();
    let newerCopy: Promise<void> | undefined;
    f.onCopy.mockImplementationOnce(() => {
      newerCopy = f.clipboard.copy([["legacy"]], "copy");
    });
    await f.clipboard.copy([["owned-group"]], "copy");
    await newerCopy;
    expect(f.write).toHaveBeenCalledExactlyOnceWith({
      text: "Legacy",
      localToken: f.clipboard.getIdentity()!.token,
    });
  });

  test.each(["generation", "metrics", "layout"] as const)(
    "destination %s changing while placement runs rejects before execute",
    async (change) => {
      const f = fixture();
      await f.clipboard.copy([["owned-group"]], "copy");
      const original = f.getContext().layout.getCellRect;
      f.getContext().layout.getCellRect = (address) => {
        const result = original(address);
        if (change === "generation") f.setGeneration(9);
        if (change === "metrics")
          f.setContext({ ...f.getContext(), metrics: context(f.sheet).metrics });
        if (change === "layout")
          f.setContext({ ...f.getContext(), layout: context(f.sheet).layout });
        return result;
      };
      expect(f.clipboard.paste({ row: 8, column: 5 })).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.onFeedback).toHaveBeenLastCalledWith("clipboard.documentChanged");
    },
  );
});
