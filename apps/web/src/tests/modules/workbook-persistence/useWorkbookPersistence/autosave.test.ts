import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkbookStoreError } from "../../../../modules/workbook-persistence/workbookStore";
import { asReceipt, createStore, deferred, mountPersistence, savedCellValue } from "./fixture";

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorkbookPersistence autosave", () => {
  test("writes the current workbook when manually saving an empty store before any edit", async () => {
    const save = vi.fn(async () => asReceipt(1, 10));
    const fixture = mountPersistence({ store: createStore({ save }) });
    await fixture.persistence.ready;

    expect(await fixture.persistence.saveNow()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(fixture.persistence.savedAt.value).toBe(10);
    fixture.wrapper.unmount();
  });

  test("serializes the latest revision after an edit arrives during a save", async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<ReturnType<typeof asReceipt>>();
    const secondWrite = deferred<ReturnType<typeof asReceipt>>();
    const save = vi
      .fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);
    const fixture = mountPersistence({ store: createStore({ save }), debounceMs: 1 });
    await fixture.persistence.ready;

    fixture.edit("first");
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);

    fixture.edit("latest");
    await vi.advanceTimersByTimeAsync(1);
    firstWrite.resolve(asReceipt(1, 10));
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    secondWrite.resolve(asReceipt(2, 20));
    await Promise.resolve();
    await Promise.resolve();

    expect(savedCellValue(save, 0)).toBe("first");
    expect(savedCellValue(save, 1)).toBe("latest");
    expect(fixture.persistence.dirty.value).toBe(false);
    expect(fixture.persistence.savedAt.value).toBe(20);
    fixture.wrapper.unmount();
  });

  test("allows a manual retry after a quota failure without scheduling retries", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new WorkbookStoreError("quota"))
      .mockResolvedValueOnce(asReceipt(1, 10));
    const fixture = mountPersistence({ store: createStore({ save }) });
    await fixture.persistence.ready;
    fixture.edit("retry");

    expect(await fixture.persistence.saveNow()).toBe(false);
    expect(fixture.persistence.error.value).toBe("quota");
    expect(await fixture.persistence.saveNow()).toBe(true);
    expect(fixture.persistence.error.value).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(2);
    fixture.wrapper.unmount();
  });

  test("stops automatic writes after a compare-and-swap conflict", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {
      throw new WorkbookStoreError("conflict");
    });
    const fixture = mountPersistence({ store: createStore({ save }), debounceMs: 1 });
    await fixture.persistence.ready;
    fixture.edit("first");
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    fixture.edit("second");
    await vi.advanceTimersByTimeAsync(1);

    expect(fixture.persistence.error.value).toBe("conflict");
    expect(save).toHaveBeenCalledTimes(1);
    fixture.wrapper.unmount();
  });
});
