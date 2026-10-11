import { afterEach, describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { framedPicture } from "../../sheet-images/framed-picture-fixture";
import { createWorkbookFile, deferred, mountFileActions } from "./fixture";

const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    wrapper.unmount();
  }
});

function mountActions(...args: Parameters<typeof mountFileActions>) {
  const fixture = mountFileActions(...args);
  wrappers.push(fixture.wrapper);
  return fixture;
}

describe("useWorkbookFileActions import", () => {
  test("keeps the active document when JSON is invalid or the file cannot be read", async () => {
    const fixture = mountActions();
    const invalidJson = createWorkbookFile(async () => "not json");
    const unreadable = createWorkbookFile(async () => {
      throw new Error("read failed");
    });

    await fixture.actions.importJson(invalidJson);
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.actions.feedback.value).toEqual({ key: "persistence.invalidJson", error: true });

    await fixture.actions.importJson(unreadable);
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.actions.feedback.value).toEqual({ key: "persistence.readFailed", error: true });
  });

  test("requires confirmation and keeps the current document when import is canceled", async () => {
    const fixture = mountActions();
    const imported = createWorkbook({ id: "imported", sheetId: "imported-sheet" });

    await fixture.actions.importJson(
      createWorkbookFile(async () => JSON.stringify(serializeWorkbook(imported))),
    );
    expect(fixture.actions.confirmation.value).toBe("import");
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();

    fixture.actions.cancel();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
  });

  test("replaces the document only after a confirmed valid import", async () => {
    const fixture = mountActions();
    const imported = createWorkbook({ id: "imported", sheetId: "imported-sheet" });

    await fixture.actions.importJson(
      createWorkbookFile(async () => JSON.stringify(serializeWorkbook(imported))),
    );
    await fixture.actions.confirm();

    expect(fixture.persistence.replaceDocument).toHaveBeenCalledOnce();
    expect(fixture.persistence.replaceDocument.mock.calls[0]?.[0]?.id).toBe(imported.id);
    expect(fixture.persistence.replaceDocument.mock.calls[0]?.[0]?.activeSheetId).toBe(
      imported.activeSheetId,
    );
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.actions.feedback.value).toEqual({ key: "persistence.imported", error: false });
  });

  test("ignores a file read that resolves after unmount", async () => {
    const fixture = mountActions();
    const read = deferred<string>();
    const importing = fixture.actions.importJson(createWorkbookFile(() => read.promise));

    fixture.wrapper.unmount();
    wrappers.splice(wrappers.indexOf(fixture.wrapper), 1);
    read.resolve(
      JSON.stringify(serializeWorkbook(createWorkbook({ id: "late", sheetId: "late-sheet" }))),
    );
    await importing;

    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.actions.confirmation.value).toBeUndefined();
  });

  test("rejects unsupported geometry before flushing the current cell draft", async () => {
    const fixture = mountActions();
    const candidate = createWorkbook({ id: "candidate", sheetId: "candidate-sheet" });
    getActiveSheet(candidate).floatingImages = [framedPicture()];
    await fixture.actions.importJson(
      createWorkbookFile(async () => JSON.stringify(serializeWorkbook(candidate))),
    );
    expect(fixture.flushPendingEdits).not.toHaveBeenCalled();
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.actions.feedback.value).toEqual({
      key: "persistence.unsupportedPictures",
      error: true,
    });
  });

  test("reads a valid candidate without replacing or committing while an IME edit still needs completion", async () => {
    const fixture = mountActions({ flushPendingEdits: () => false });
    const file = createWorkbookFile(
      vi.fn(async () =>
        JSON.stringify(
          serializeWorkbook(createWorkbook({ id: "candidate", sheetId: "candidate-sheet" })),
        ),
      ),
    );

    await fixture.actions.importJson(file);

    expect(file.text).toHaveBeenCalledOnce();
    expect(fixture.persistence.replaceDocument).not.toHaveBeenCalled();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    expect(fixture.actions.feedback.value).toEqual({
      key: "persistence.finishEditing",
      error: true,
    });
  });
});
