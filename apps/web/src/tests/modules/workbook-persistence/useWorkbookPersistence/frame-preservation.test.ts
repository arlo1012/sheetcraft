import { afterEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
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
afterEach(() => vi.useRealTimers());
describe("frame-aware recovery preservation during view integration", () => {
  test("a valid newer snapshot stays in storage and cannot be overwritten by manual or automatic saves", async () => {
    vi.useFakeTimers();
    const original = createWorkbookWithValue("recoverable");
    getActiveSheet(original).floatingImages = [framedPicture()];
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
    getActiveSheet(original).floatingImages = [framedPicture()];
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
    getActiveSheet(newer).floatingImages = [framedPicture()];
    await expect(f.persistence.replaceDocument(newer)).rejects.toMatchObject({
      code: "unsupported-picture-frame",
    });
    await vi.advanceTimersByTimeAsync(350);
    expect(save).toHaveBeenCalledOnce();
    expect(savedCellValue(save, 0)).toBe("saved current");
    expect(f.value()).toBe("saved current");
    f.wrapper.unmount();
  });
  test("a candidate acquiring a frame while the old save settles is rejected before loading or replacement", async () => {
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
    getActiveSheet(candidate).floatingImages = [framedPicture()];
    pending.resolve(asReceipt(1));
    await saving;
    await expect(replacing).rejects.toMatchObject({ code: "unsupported-picture-frame" });
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
