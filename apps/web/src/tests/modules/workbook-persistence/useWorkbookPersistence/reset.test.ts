import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkbookStoreError } from "../../../../modules/workbook-persistence/workbookStore";
import {
  asReceipt,
  createStore,
  createWorkbookWithValue,
  deferred,
  mountPersistence,
  savedCellValue,
} from "./fixture";

afterEach(() => vi.useRealTimers());

describe("discarding an unreadable local copy", () => {
  test("persists a blank workbook before replacing the current one and resumes autosave", async () => {
    vi.useFakeTimers();
    const receipt = deferred<ReturnType<typeof asReceipt>>();
    const replace = vi.fn(() => receipt.promise);
    const save = vi.fn(async () => asReceipt(8));
    const fixture = mountPersistence({
      workbook: createWorkbookWithValue("current edits"),
      store: createStore({
        load: async () => ({ revision: 0, savedAt: 1, snapshot: {} }),
        replace,
        save,
      }),
      debounceMs: 1,
    });
    await fixture.persistence.ready;
    expect(fixture.persistence.error.value).toBe("invalid-record");

    const reset = fixture.persistence.resetDocument();
    await Promise.resolve();
    await Promise.resolve();
    expect(replace).toHaveBeenCalledOnce();
    expect(replace.mock.calls[0]).toMatchObject([{ sheets: [{ cells: [] }] }]);
    expect(fixture.value()).toBe("current edits");
    expect(fixture.replaceCalls).toHaveLength(0);
    receipt.resolve(asReceipt(7, 70));
    expect(await reset).toBe(true);
    expect(fixture.value()).toBeUndefined();
    expect(fixture.getWorkbook().sheets.size).toBe(1);
    expect(fixture.persistence.status.value).toBe("saved");
    expect(fixture.persistence.error.value).toBeUndefined();

    fixture.edit("new edit");
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]).toMatchObject([expect.anything(), 7]);
    expect(savedCellValue(save, 0)).toBe("new edit");
    fixture.wrapper.unmount();
  });

  test("keeps current content on write failure and allows a later reset to recover", async () => {
    const replace = vi
      .fn()
      .mockRejectedValueOnce(new WorkbookStoreError("quota"))
      .mockResolvedValueOnce(asReceipt(2));
    const fixture = mountPersistence({
      workbook: createWorkbookWithValue("keep this"),
      store: createStore({
        load: async () => ({ revision: 1, savedAt: 1, snapshot: { version: 999 } }),
        replace,
      }),
    });
    await fixture.persistence.ready;
    expect(fixture.persistence.error.value).toBe("invalid-snapshot");
    expect(await fixture.persistence.resetDocument()).toBe(false);
    expect(fixture.value()).toBe("keep this");
    expect(fixture.replaceCalls).toHaveLength(0);
    expect(fixture.persistence.error.value).toBe("quota");
    expect(fixture.persistence.loading.value).toBe(false);
    expect(await fixture.persistence.resetDocument()).toBe(true);
    expect(fixture.value()).toBeUndefined();
    expect(fixture.persistence.error.value).toBeUndefined();
    fixture.wrapper.unmount();
  });
});
