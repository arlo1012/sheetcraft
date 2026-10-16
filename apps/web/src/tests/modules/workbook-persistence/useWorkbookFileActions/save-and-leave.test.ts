import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { WorkbookFileError } from "../../../../modules/workbook-persistence/workbookJsonTransfer";
import { UnsupportedShapeFrameDocumentError } from "../../../../modules/sheet-drawings/shape-document-support";
import { UnsupportedPictureDocumentError } from "../../../../modules/sheet-images/picture-document-support";
import { createWorkbook } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
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

  test("does not save, export, replace or commit while IME composition blocks flushing", async () => {
    const fixture = mountActions({ flushPendingEdits: () => false });
    const file = createWorkbookFile(
      vi.fn(async () =>
        JSON.stringify(
          serializeWorkbook(createWorkbook({ id: "candidate", sheetId: "candidate-sheet" })),
        ),
      ),
    );

    await fixture.actions.save();
    fixture.actions.exportJson();
    await fixture.actions.importJson(file);

    expect(fixture.persistence.saveNow).not.toHaveBeenCalled();
    expect(mocks.downloadWorkbookJson).not.toHaveBeenCalled();
    expect(file.text).toHaveBeenCalledOnce();
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.actions.confirmation.value).toBeUndefined();
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

  test.each([
    [new WorkbookFileError("missing-image"), "persistence.exportMissingImage"],
    [new WorkbookFileError("image-storage-unavailable"), "persistence.exportImageStorageFailed"],
    [new WorkbookFileError("image-read-failed"), "persistence.exportImageReadFailed"],
    [new WorkbookFileError("download-failed"), "persistence.exportDownloadFailed"],
    [new WorkbookFileError("invalid-snapshot"), "persistence.exportInvalidSnapshot"],
    [
      new WorkbookDomainError({ code: "invalid_snapshot" }, "private content"),
      "persistence.exportInvalidSnapshot",
    ],
    [
      new WorkbookDomainError({ code: "unsupported_snapshot_version" }),
      "persistence.exportInvalidSnapshot",
    ],
    [
      new UnsupportedShapeFrameDocumentError("private-sheet", ["private-object"]),
      "persistence.exportUnsupportedShapes",
    ],
    [
      new UnsupportedPictureDocumentError("private-sheet", ["private-object"]),
      "persistence.exportUnsupportedPictures",
    ],
    [new Error("private content and stack"), "persistence.exportFailed"],
    [{ code: "missing-image", message: "untrusted object" }, "persistence.exportFailed"],
    [new WorkbookDomainError({ code: "workbook_operation_failed" }), "persistence.exportFailed"],
  ])("reports a safe export reason for %s", async (error, key) => {
    const fixture = mountActions();
    mocks.downloadWorkbookJson.mockImplementation(() => {
      throw error;
    });
    await fixture.actions.exportJson();
    expect(fixture.actions.feedback.value).toEqual({ key, error: true });
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.persistence.resetDocument).not.toHaveBeenCalled();
  });

  test("does not overlap another file operation or its confirmation", async () => {
    let blocked = true;
    const fixture = mountActions({ isBlocked: () => blocked });
    const file = createWorkbookFile(vi.fn(async () => "{}"));
    await fixture.actions.save();
    await fixture.actions.exportJson();
    await fixture.actions.importJson(file);
    fixture.actions.requestReload();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    window.dispatchEvent(new Event("pagehide"));
    expect(fixture.flushPendingEdits).not.toHaveBeenCalled();
    expect(fixture.persistence.saveNow).not.toHaveBeenCalled();
    expect(mocks.downloadWorkbookJson).not.toHaveBeenCalled();
    expect(file.text).not.toHaveBeenCalled();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    blocked = false;
    await fixture.actions.save();
    expect(fixture.persistence.saveNow).toHaveBeenCalledOnce();
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
