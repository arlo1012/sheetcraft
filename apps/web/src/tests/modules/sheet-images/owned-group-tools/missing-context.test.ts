import { describe, expect, test } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { fixture, legacy } from "./fixture";

describe("page grouping needs a mounted current frame context", () => {
  test("provided but unavailable context never silently creates groupId membership", () => {
    const f = fixture([legacy("a"), legacy("b", 120)]);
    f.setContext(undefined);
    const before = serializeWorkbook(f.session.workbook);
    expect(f.tools.group()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.selectedIds.value).toEqual(["a", "b"]);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
});
