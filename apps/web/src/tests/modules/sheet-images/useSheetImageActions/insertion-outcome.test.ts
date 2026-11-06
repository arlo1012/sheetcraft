// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { prepareImageAsset } from "../../../../modules/image-assets/prepareImageAsset";
import { asset, deferred, file, fixture } from "./replacement-fixture";

vi.mock("../../../../modules/image-assets/prepareImageAsset", () => ({
  prepareImageAsset: vi.fn(),
}));

const fixtures: ReturnType<typeof fixture>[] = [];
function createFixture() {
  const value = fixture();
  fixtures.push(value);
  return value;
}
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset);
});
afterEach(() => {
  for (const value of fixtures.splice(0)) value.scope.stop();
  vi.restoreAllMocks();
});

describe("picture file insertion outcomes", () => {
  test("returns true from pasteImageFile only after a floating picture is committed", async () => {
    const f = createFixture();
    const original = [...f.sheet.floatingImages];

    const accepted = await f.actions.pasteImageFile(file, "floating", { row: 4, column: 5 });

    expect(accepted).toBe(true);
    expect(f.sheet.floatingImages).toHaveLength(original.length + 1);
    expect(f.sheet.floatingImages.slice(0, original.length)).toEqual(original);
    expect(f.sheet.floatingImages.at(-1)).toMatchObject({
      assetId: asset.id,
      altText: file.name,
      anchor: { row: 4, column: 5 },
    });
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.actions.busy.value).toBe(false);
  });

  test("returns false for failed asset storage and true when the same insertion is retried successfully", async () => {
    const f = createFixture();
    const before = serializeWorkbook(f.session.workbook);
    f.put.mockRejectedValueOnce(new Error("Storage unavailable"));

    expect(await f.actions.pasteImageFile(file, "floating")).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.actions.busy.value).toBe(false);

    expect(await f.actions.pasteImageFile(file, "floating")).toBe(true);
    expect(f.put).toHaveBeenCalledTimes(2);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.floatingImages.at(-1)).toMatchObject({ assetId: asset.id });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.actions.feedback.value).toBe("image.inserted");
    expect(f.actions.busy.value).toBe(false);
  });

  test("returns false when the document command refuses insertion without mutating the workbook", async () => {
    const f = createFixture();
    f.refuse();
    const before = serializeWorkbook(f.session.workbook);

    expect(await f.actions.pasteImageFile(file, "floating")).toBe(false);

    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.actions.busy.value).toBe(false);
  });

  test.each([
    { phase: "decode", owner: "generation" },
    { phase: "decode", owner: "sheet replacement" },
    { phase: "store", owner: "generation" },
    { phase: "store", owner: "sheet replacement" },
  ] as const)(
    "returns false without a command when $owner changes during $phase",
    async ({ phase, owner }) => {
      const f = createFixture();
      const decoded = deferred<typeof asset>();
      const stored = deferred<void>();
      if (phase === "decode") vi.mocked(prepareImageAsset).mockReturnValueOnce(decoded.promise);
      else f.put.mockReturnValueOnce(stored.promise);
      const pending = f.actions.pasteImageFile(file, "floating");
      if (phase === "store") {
        await Promise.resolve();
        expect(f.put).toHaveBeenCalledTimes(1);
      }
      if (owner === "generation") f.changeGeneration();
      else f.replaceSheet(createSheet("Replacement", f.sheet.id));
      const before = serializeWorkbook(f.session.workbook);
      decoded.resolve(asset);
      stored.resolve(undefined);

      expect(await pending).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.actions.busy.value).toBe(false);
      if (phase === "decode") expect(f.put).not.toHaveBeenCalled();
    },
  );
});
