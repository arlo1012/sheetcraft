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

test("canonical shape recovery, autosave and reload preserve complete placement/properties", async () => {
  vi.useFakeTimers();
  const original = createWorkbookWithValue("saved");
  getActiveSheet(original).drawings = [framedShape()];
  const snapshot = serializeWorkbook(original),
    save = vi.fn(async (_snapshot: unknown) => asReceipt(2));
  const f = mountPersistence({
    store: createStore({ load: async () => ({ revision: 1, savedAt: 1, snapshot }), save }),
    workbook: createWorkbookWithValue("current"),
  });
  await f.persistence.ready;
  expect(f.persistence.error.value).toBeUndefined();
  expect(f.value()).toBe("saved");
  expect(serializeWorkbook(f.getWorkbook())).toEqual(snapshot);
  f.edit("draft");
  await nextTick();
  expect(await f.persistence.saveNow()).toBe(true);
  expect(save.mock.calls[0]?.[0]).toEqual(serializeWorkbook(f.getWorkbook()));
  expect(await f.persistence.reload()).toBe(true);
  expect(serializeWorkbook(f.getWorkbook())).toEqual(snapshot);
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

test("a local draft conflict still preserves both the draft and saved canonical record", async () => {
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
  expect(f.persistence.error.value).toBe("conflict");
  expect(f.value()).toBe("new draft");
  expect(await f.persistence.saveNow()).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(serializeWorkbook(original)).toEqual(snapshot);
  f.wrapper.unmount();
});
