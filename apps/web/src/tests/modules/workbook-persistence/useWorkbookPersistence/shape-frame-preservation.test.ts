import { afterEach, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { framedShape } from "../../sheet-drawings/framed-shape-fixture";
import {
  createStore,
  createWorkbookWithValue,
  mountPersistence,
  asReceipt,
  deferred,
} from "./fixture";
import { mountFileActions } from "../useWorkbookFileActions/fixture";
afterEach(() => vi.useRealTimers());

test("canonical shape recovery is retained, cannot be overwritten, and reports the correct feature", async () => {
  vi.useFakeTimers();
  const original = createWorkbookWithValue("saved");
  getActiveSheet(original).drawings = [framedShape()];
  const snapshot = serializeWorkbook(original),
    save = vi.fn(async () => asReceipt(2)),
    replace = vi.fn(async () => asReceipt(2));
  const load = vi
    .fn()
    .mockResolvedValueOnce({ revision: 1, savedAt: 1, snapshot })
    .mockRejectedValueOnce(new Error("read failed"))
    .mockResolvedValueOnce(undefined);
  const f = mountPersistence({
    store: createStore({ load, save, replace }),
    workbook: createWorkbookWithValue("current"),
  });
  await f.persistence.ready;
  expect(f.persistence.error.value).toBe("unsupported-shape-frame");
  expect(f.value()).toBe("current");
  expect(f.replaceCalls).toEqual([]);
  f.edit("draft");
  await nextTick();
  await vi.advanceTimersByTimeAsync(500);
  expect(await f.persistence.saveNow()).toBe(false);
  await expect(
    f.persistence.replaceDocument(createWorkbookWithValue("replacement")),
  ).rejects.toMatchObject({ code: "unsupported-shape-frame" });
  expect(await f.persistence.resetDocument()).toBe(false);
  expect(await f.persistence.reload()).toBe(false);
  expect(f.persistence.error.value).toBe("unsupported-shape-frame");
  expect(save).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(serializeWorkbook(original)).toEqual(snapshot);
  expect(await f.persistence.reload()).toBe(false);
  expect(f.persistence.error.value).toBeUndefined();
  f.edit("safe");
  expect(await f.persistence.saveNow()).toBe(true);
  f.wrapper.unmount();
});

test("unsupported shape recovery has a distinct visible message and is not resettable", async () => {
  const f = mountFileActions();
  f.persistence.error.value = "unsupported-shape-frame";
  expect(f.actions.canReset.value).toBe(false);
  f.actions.requestReset();
  expect(f.actions.confirmation.value).toBeUndefined();
  await f.actions.importJson({ text: async () => "{}" });
  expect(f.actions.feedback.value).toEqual({ key: "persistence.unsupportedShapes", error: true });
  expect(f.persistence.replaceDocument).not.toHaveBeenCalled();
  f.wrapper.unmount();
});

test("local draft changes during the saved read still identify and protect canonical shapes", async () => {
  const original = createWorkbookWithValue("saved");
  getActiveSheet(original).drawings = [framedShape()];
  const snapshot = serializeWorkbook(original),
    pending = deferred<{ revision: number; savedAt: number; snapshot: typeof snapshot }>();
  const replace = vi.fn(async () => asReceipt(2)),
    save = vi.fn(async () => asReceipt(2));
  const f = mountPersistence({
    store: createStore({ load: () => pending.promise, replace, save }),
    workbook: createWorkbookWithValue("current"),
  });
  await nextTick();
  f.edit("new draft");
  pending.resolve({ revision: 1, savedAt: 1, snapshot });
  await f.persistence.ready;
  expect(f.persistence.error.value).toBe("unsupported-shape-frame");
  expect(f.value()).toBe("new draft");
  await expect(
    f.persistence.replaceDocument(createWorkbookWithValue("replacement")),
  ).rejects.toMatchObject({ code: "unsupported-shape-frame" });
  expect(await f.persistence.resetDocument()).toBe(false);
  expect(await f.persistence.saveNow()).toBe(false);
  expect(replace).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  f.wrapper.unmount();
});
