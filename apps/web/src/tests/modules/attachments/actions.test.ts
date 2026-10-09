import { afterEach, describe, expect, test, vi } from "vitest";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import { useAttachmentActions } from "../../../modules/attachments/useAttachmentActions";
import * as files from "../../../modules/attachments/attachment-file";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  let workbook = createWorkbook({ id: "attachments", sheetId: "sheet" });
  let sheet = getActiveSheet(workbook);
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand) => applyWorkbookCommand(workbook, command));
  const onError = vi.fn();
  const actions = useAttachmentActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 2, column: 3 }),
    isBusy: () => false,
    flush,
    execute,
    onError,
  });
  const input = document.createElement("input");
  input.type = "file";
  Object.defineProperty(input, "files", {
    value: [new File(["abc"], "report.txt", { type: "text/plain" })],
  });
  actions.fileInput.value = input;
  const event = new Event("change");
  Object.defineProperty(event, "target", { value: input });
  return {
    actions,
    execute,
    onError,
    flush,
    event,
    get sheet() {
      return sheet;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    replaceWorkbook() {
      workbook = createWorkbook({ id: "replacement", sheetId: sheet.id });
    },
  };
}
const attachment: SheetAttachment = {
  filename: "report.txt",
  mimeType: "text/plain",
  size: 3,
  data: "YWJj",
  display: "document",
};

describe("attachment actions", () => {
  test("prepares a file before inserting a single atomic Core drawing", async () => {
    const f = fixture();
    f.actions.requestInsert("document");
    await f.actions.onFiles(f.event);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings).toHaveLength(1);
    expect(f.sheet.drawings![0]).toMatchObject({
      kind: "attachment",
      anchor: { row: 2, column: 3 },
      attachment,
    });
    expect(f.actions.busy.value).toBe(false);
  });
  test("reports preparation failure without inserting any drawing", async () => {
    const f = fixture();
    vi.spyOn(files, "prepareAttachment").mockRejectedValue(new Error("read failed"));
    f.actions.requestInsert("icon");
    await f.actions.onFiles(f.event);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.onError).toHaveBeenCalledTimes(1);
    expect(f.actions.busy.value).toBe(false);
  });
  test.each(["switchSheet", "replaceWorkbook", "protection"] as const)(
    "rejects a prepared file after %s",
    async (change) => {
      const f = fixture();
      let resolve!: (value: SheetAttachment) => void;
      vi.spyOn(files, "prepareAttachment").mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      f.actions.requestInsert("document");
      const pending = f.actions.onFiles(f.event);
      expect(f.actions.busy.value).toBe(true);
      if (change === "protection") f.sheet.properties.protected = true;
      else f[change]();
      resolve(attachment);
      await pending;
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(f.actions.busy.value).toBe(false);
    },
  );
  test.each(["protection", "flush"] as const)(
    "does not capture an insertion target when %s blocks editing",
    async (block) => {
      const f = fixture();
      const prepare = vi.spyOn(files, "prepareAttachment");
      if (block === "protection") f.sheet.properties.protected = true;
      else f.flush.mockReturnValue(false);
      f.actions.requestInsert("icon");
      await f.actions.onFiles(f.event);
      expect(prepare).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
});
