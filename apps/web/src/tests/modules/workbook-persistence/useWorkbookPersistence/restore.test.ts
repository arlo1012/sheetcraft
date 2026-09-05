import { describe, expect, test, vi } from "vitest";
import {
  asReceipt,
  createPersistedWorkbook,
  createStore,
  createWorkbookWithValue,
  deferred,
  mountPersistence,
} from "./fixture";

describe("useWorkbookPersistence restoration", () => {
  test("restores a validated snapshot once without creating a save", async () => {
    const save = vi.fn(async () => asReceipt(1));
    const store = createStore({
      load: vi.fn(async () => createPersistedWorkbook("restored", 4, 123)),
      save,
    });
    const fixture = mountPersistence({ store });

    await fixture.persistence.ready;

    expect(fixture.value()).toBe("restored");
    expect(fixture.replaceCalls).toHaveLength(1);
    expect(fixture.persistence.savedAt.value).toBe(123);
    expect(fixture.persistence.dirty.value).toBe(false);
    expect(fixture.persistence.status.value).toBe("saved");
    expect(save).not.toHaveBeenCalled();
    fixture.wrapper.unmount();
  });

  test("keeps the active workbook when an initial read arrives after an edit", async () => {
    const read = deferred<ReturnType<typeof createPersistedWorkbook> | undefined>();
    const save = vi.fn(async () => asReceipt(1));
    const store = createStore({ load: vi.fn(() => read.promise), save });
    const fixture = mountPersistence({ store, workbook: createWorkbookWithValue("local") });

    fixture.edit("new local value");
    read.resolve(createPersistedWorkbook("stale recovery"));
    await fixture.persistence.ready;

    expect(fixture.value()).toBe("new local value");
    expect(fixture.replaceCalls).toHaveLength(0);
    expect(fixture.persistence.error.value).toBe("conflict");
    expect(save).not.toHaveBeenCalled();
    fixture.wrapper.unmount();
  });

  test("does not report a missing reload as a successful replacement", async () => {
    const fixture = mountPersistence({
      store: createStore({ load: vi.fn(async () => undefined) }),
      workbook: createWorkbookWithValue("local"),
    });
    await fixture.persistence.ready;
    fixture.edit("dirty local");

    expect(await fixture.persistence.reload()).toBe(false);
    expect(fixture.value()).toBe("dirty local");
    expect(fixture.persistence.dirty.value).toBe(true);
    expect(fixture.persistence.status.value).toBe("pending");
    fixture.wrapper.unmount();
  });

  test("does not replace the controller after an unmounted initial read resolves", async () => {
    const read = deferred<ReturnType<typeof createPersistedWorkbook> | undefined>();
    const fixture = mountPersistence({ store: createStore({ load: vi.fn(() => read.promise) }) });

    fixture.wrapper.unmount();
    read.resolve(createPersistedWorkbook("late"));
    await fixture.persistence.ready;

    expect(fixture.replaceCalls).toHaveLength(0);
  });

  test("reports a corrupted recovery record without replacing the active workbook", async () => {
    const store = createStore({
      load: vi.fn(async () => ({ revision: 1, savedAt: 1, snapshot: { version: 2 } })),
    });
    const fixture = mountPersistence({ store, workbook: createWorkbookWithValue("safe") });

    await fixture.persistence.ready;

    expect(fixture.value()).toBe("safe");
    expect(fixture.persistence.error.value).toBe("invalid-snapshot");
    expect(fixture.replaceCalls).toHaveLength(0);
    fixture.wrapper.unmount();
  });

  test("reload replaces only a valid stored document", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(createPersistedWorkbook("reloaded", 7, 70));
    const fixture = mountPersistence({
      store: createStore({ load }),
      workbook: createWorkbookWithValue("old"),
    });
    await fixture.persistence.ready;

    expect(await fixture.persistence.reload()).toBe(true);
    expect(fixture.value()).toBe("reloaded");
    expect(fixture.persistence.savedAt.value).toBe(70);
    fixture.wrapper.unmount();
  });
});
