import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbookFile, mountFileActions } from "./fixture";

const mocks = vi.hoisted(() => ({ downloadWorkbookJson: vi.fn() }));

vi.mock("../../../../modules/workbook-persistence/workbookJsonTransfer", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../../modules/workbook-persistence/workbookJsonTransfer")
    >();
  return { ...actual, downloadWorkbookJson: mocks.downloadWorkbookJson };
});

const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    wrapper.unmount();
  }
  mocks.downloadWorkbookJson.mockReset();
});

function mountActions(...args: Parameters<typeof mountFileActions>) {
  const fixture = mountFileActions(...args);
  wrappers.push(fixture.wrapper);
  return fixture;
}

function dispatchBeforeUnload(): BeforeUnloadEvent {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  return event;
}

describe("useWorkbookFileActions save and leave", () => {
  test("flushes before Ctrl+S and saves the current document", async () => {
    const fixture = mountActions();
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.flushPendingEdits).toHaveBeenCalledOnce();
    expect(fixture.persistence.saveNow).toHaveBeenCalledOnce();
  });

  test("does not save, export, or import while IME composition blocks flushing", async () => {
    const fixture = mountActions({ flushPendingEdits: () => false });
    const file = createWorkbookFile(vi.fn(async () => "{}"));

    await fixture.actions.save();
    fixture.actions.exportJson();
    await fixture.actions.importJson(file);

    expect(fixture.persistence.saveNow).not.toHaveBeenCalled();
    expect(mocks.downloadWorkbookJson).not.toHaveBeenCalled();
    expect(file.text).not.toHaveBeenCalled();
    expect(fixture.actions.feedback.value).toEqual({
      key: "persistence.finishEditing",
      error: true,
    });
  });

  test("exports the exact active workbook after flushing", () => {
    const fixture = mountActions();

    fixture.actions.exportJson();

    expect(mocks.downloadWorkbookJson).toHaveBeenCalledExactlyOnceWith(fixture.workbook);
    expect(fixture.actions.feedback.value).toEqual({
      key: "persistence.exportStarted",
      error: false,
    });
  });

  test("warns before unload only for a dirty document or pending editor draft", () => {
    const fixture = mountActions();

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);

    fixture.dirty.value = true;
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    fixture.dirty.value = false;
    fixture.hasPendingEdits.mockReturnValue(true);
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
  });
});
