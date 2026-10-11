import { afterEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { pictureGroup } from "../../sheet-images/picture-group-fixture";
import { framedPicture } from "../../sheet-images/framed-picture-fixture";
import {
  createStore,
  deferred,
  createWorkbookWithValue,
  mountPersistence,
  asReceipt,
  savedCellValue,
} from "./fixture";
import { mountFileActions } from "../useWorkbookFileActions/fixture";
function unsupportedReflection() {
  return { ...framedPicture(), hidden: true, transform: { appearance: { reflection: true } } };
}
afterEach(() => vi.useRealTimers());
describe("internal owned-picture recovery and unsupported paint preservation", () => {
  test.each([
    { image: framedPicture(), version: 47 },
    { image: pictureGroup(), version: 48 },
  ])(
    "supported snapshot$version recovers and saves without flattening",
    async ({ image, version }) => {
      const original = createWorkbookWithValue("recoverable");
      getActiveSheet(original).floatingImages = [image];
      const snapshot = serializeWorkbook(original),
        save = vi.fn(async (_snapshot: ReturnType<typeof serializeWorkbook>) => asReceipt(2));
      const f = mountPersistence({
        store: createStore({
          load: async () => ({ revision: 1, savedAt: 1, snapshot }),
          save,
        }),
        workbook: createWorkbookWithValue("current"),
      });
      await f.persistence.ready;
      expect(f.persistence.error.value).toBeUndefined();
      expect(f.value()).toBe("recoverable");
      expect(f.replaceCalls).toHaveLength(1);
      expect(serializeWorkbook(f.getWorkbook())).toEqual(snapshot);
      expect(snapshot.version).toBe(version);
      f.edit("saved owned document");
      expect(await f.persistence.saveNow()).toBe(true);
      expect(savedCellValue(save, 0)).toBe("saved owned document");
      expect(save.mock.calls[0]?.[0]).toMatchObject({
        version,
        sheets: [{ floatingImages: [image] }],
      });
      f.wrapper.unmount();
    },
  );
  test("a valid snapshot with unsupported hidden reflection stays in storage and cannot be overwritten by manual or automatic saves", async () => {
    vi.useFakeTimers();
    const original = createWorkbookWithValue("recoverable");
    getActiveSheet(original).floatingImages = [unsupportedReflection()];
    const snapshot = serializeWorkbook(original),
      save = vi.fn(async () => asReceipt(2)),
      replace = vi.fn(async () => asReceipt(2));
    const f = mountPersistence({
      store: createStore({
        load: async () => ({ revision: 1, savedAt: 1, snapshot }),
        save,
        replace,
      }),
      workbook: createWorkbookWithValue("current"),
    });
    await f.persistence.ready;
    expect(f.persistence.error.value).toBe("unsupported-picture-frame");
    expect(f.value()).toBe("current");
    expect(f.replaceCalls).toEqual([]);
    f.edit("retained local draft");
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(await f.persistence.saveNow()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    await expect(
      f.persistence.replaceDocument(createWorkbookWithValue("replacement")),
    ).rejects.toMatchObject({ code: "unsupported-picture-frame" });
    expect(await f.persistence.resetDocument()).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(snapshot).toEqual(serializeWorkbook(original));
    f.wrapper.unmount();
  });
  test("a failed reload cannot unlock a known unsupported recovery record", async () => {
    const original = createWorkbookWithValue("recoverable");
    getActiveSheet(original).floatingImages = [unsupportedReflection()];
    const load = vi
      .fn()
      .mockResolvedValueOnce({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(original) })
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce(undefined);
    const save = vi.fn(async () => asReceipt(2)),
      replace = vi.fn(async () => asReceipt(2));
    const f = mountPersistence({
      store: createStore({ load, save, replace }),
      workbook: createWorkbookWithValue("current"),
    });
    await f.persistence.ready;
    expect(await f.persistence.reload()).toBe(false);
    expect(f.persistence.error.value).toBe("unsupported-picture-frame");
    f.edit("local draft");
    expect(await f.persistence.saveNow()).toBe(false);
    await expect(
      f.persistence.replaceDocument(createWorkbookWithValue("replacement")),
    ).rejects.toMatchObject({ code: "unsupported-picture-frame" });
    expect(await f.persistence.resetDocument()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // Only a successful read proving the old record is gone releases this guard.
    expect(await f.persistence.reload()).toBe(false);
    expect(f.persistence.error.value).toBeUndefined();
    f.edit("safe to save");
    expect(await f.persistence.saveNow()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    f.wrapper.unmount();
  });
  test("rejecting an unsupported replacement does not cancel a scheduled save of the current document", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => asReceipt(1));
    const f = mountPersistence({
      store: createStore({ save }),
      workbook: createWorkbookWithValue("old"),
    });
    await f.persistence.ready;
    f.edit("saved current");
    await nextTick();
    const newer = createWorkbookWithValue("candidate");
    getActiveSheet(newer).floatingImages = [unsupportedReflection()];
    await expect(f.persistence.replaceDocument(newer)).rejects.toMatchObject({
      code: "unsupported-picture-reflection",
    });
    await vi.advanceTimersByTimeAsync(350);
    expect(save).toHaveBeenCalledOnce();
    expect(savedCellValue(save, 0)).toBe("saved current");
    expect(f.value()).toBe("saved current");
    f.wrapper.unmount();
  });
  test("a candidate acquiring unsupported reflection while the old save settles is rejected before loading or replacement", async () => {
    const pending = deferred<ReturnType<typeof asReceipt>>(),
      save = vi.fn(() => pending.promise),
      replace = vi.fn(async () => asReceipt(2));
    const f = mountPersistence({
      store: createStore({ save, replace }),
      workbook: createWorkbookWithValue("old"),
    });
    await f.persistence.ready;
    f.edit("pending");
    const saving = f.persistence.saveNow();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    const candidate = createWorkbookWithValue("candidate"),
      replacing = f.persistence.replaceDocument(candidate);
    getActiveSheet(candidate).floatingImages = [unsupportedReflection()];
    pending.resolve(asReceipt(1));
    await saving;
    await expect(replacing).rejects.toMatchObject({ code: "unsupported-picture-reflection" });
    expect(f.persistence.loading.value).toBe(false);
    expect(f.value()).toBe("pending");
    expect(f.replaceCalls).toEqual([]);
    expect(replace).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("an unsupported but valid record is not presented as corrupt data eligible for reset", () => {
    const f = mountFileActions();
    f.persistence.error.value = "unsupported-picture-frame";
    expect(f.actions.canReset.value).toBe(false);
    f.actions.requestReset();
    expect(f.actions.confirmation.value).toBeUndefined();
    expect(f.persistence.resetDocument).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
});
