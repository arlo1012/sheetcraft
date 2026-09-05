import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkbookStoreError } from "../../../../modules/workbook-persistence/workbookStore";
import {
  asReceipt,
  createPersistedWorkbook,
  createStore,
  createWorkbookWithValue,
  deferred,
  mountPersistence,
  savedCellValue,
} from "./fixture";

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorkbookPersistence replacement", () => {
  test("serializes replacement, reload, and manual save as document operations", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(createPersistedWorkbook("reloaded", 2, 20));
    const save = vi.fn(async (_snapshot, expectedRevision) =>
      asReceipt((expectedRevision ?? 0) + 1),
    );
    const replace = vi.fn(async () => asReceipt(3));
    const fixture = mountPersistence({ store: createStore({ load, save, replace }) });
    await fixture.persistence.ready;

    const replacing = fixture.persistence.replaceDocument(createWorkbookWithValue("imported"));
    const reloading = fixture.persistence.reload();
    const saving = fixture.persistence.saveNow();
    await replacing;
    expect(await reloading).toBe(true);
    expect(await saving).toBe(true);

    expect(fixture.value()).toBe("reloaded");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    fixture.wrapper.unmount();
  });

  test("confirms an imported document after settling the old write", async () => {
    const save = vi.fn(async (_snapshot, expectedRevision) =>
      asReceipt((expectedRevision ?? 0) + 1),
    );
    const replace = vi.fn(async () => asReceipt(4, 40));
    const fixture = mountPersistence({
      store: createStore({
        load: vi.fn(async () => createPersistedWorkbook("stored", 3)),
        save,
        replace,
      }),
    });
    await fixture.persistence.ready;
    fixture.edit("old pending");

    const imported = createWorkbookWithValue("imported");
    await fixture.persistence.replaceDocument(imported);

    expect(fixture.getWorkbook()).toBe(imported);
    expect(fixture.replaceCalls.at(-1)).toBe(imported);
    expect(fixture.value()).toBe("imported");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(savedCellValue(replace, 0)).toBe("imported");
    expect(fixture.persistence.savedAt.value).toBe(40);
    expect(fixture.persistence.dirty.value).toBe(false);
    expect(save).not.toHaveBeenCalled();
    fixture.wrapper.unmount();
  });

  test("automatically saves an edit made while replacement confirmation is pending", async () => {
    vi.useFakeTimers();
    const confirmation = deferred<ReturnType<typeof asReceipt>>();
    const replace = vi.fn(() => confirmation.promise);
    const save = vi.fn(async (_snapshot: unknown, _expectedRevision: number | undefined) =>
      asReceipt(6, 60),
    );
    const fixture = mountPersistence({ store: createStore({ replace, save }), debounceMs: 1 });
    await fixture.persistence.ready;

    const replacing = fixture.persistence.replaceDocument(createWorkbookWithValue("imported"));
    await Promise.resolve();
    await Promise.resolve();
    expect(replace).toHaveBeenCalledTimes(1);
    fixture.edit("edited during confirmation");
    confirmation.resolve(asReceipt(5, 50));
    await replacing;

    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toBe(5);
    expect(savedCellValue(save, 0)).toBe("edited during confirmation");
    expect(fixture.persistence.dirty.value).toBe(false);
    fixture.wrapper.unmount();
  });

  test.each(["invalid-record", "conflict"] as const)(
    "confirms an imported document after a prior %s error",
    async (previousError) => {
      const save = vi.fn(async () => {
        throw new WorkbookStoreError(previousError);
      });
      const replace = vi.fn(async () => asReceipt(8, 80));
      const store =
        previousError === "invalid-record"
          ? createStore({
              load: vi.fn(async () => ({ revision: 0, savedAt: 1, snapshot: {} })),
              replace,
            })
          : createStore({ save, replace });
      const fixture = mountPersistence({ store, debounceMs: 1 });
      await fixture.persistence.ready;
      if (previousError === "conflict") {
        fixture.edit("conflicted");
        expect(await fixture.persistence.saveNow()).toBe(false);
      }

      await fixture.persistence.replaceDocument(createWorkbookWithValue("imported"));

      expect(replace).toHaveBeenCalledTimes(1);
      expect(fixture.value()).toBe("imported");
      expect(fixture.persistence.error.value).toBeUndefined();
      expect(fixture.persistence.dirty.value).toBe(false);
      fixture.wrapper.unmount();
    },
  );

  test("keeps an imported document dirty when confirmed replacement fails", async () => {
    const replace = vi.fn(async () => {
      throw new WorkbookStoreError("quota");
    });
    const fixture = mountPersistence({ store: createStore({ replace }) });
    await fixture.persistence.ready;

    const imported = createWorkbookWithValue("imported");
    await fixture.persistence.replaceDocument(imported);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(fixture.getWorkbook()).toBe(imported);
    expect(fixture.value()).toBe("imported");
    expect(fixture.persistence.error.value).toBe("quota");
    expect(fixture.persistence.dirty.value).toBe(true);
    fixture.wrapper.unmount();
  });
});
