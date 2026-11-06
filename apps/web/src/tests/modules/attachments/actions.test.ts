// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  insertSheet,
} from "@sheetcraft/core/workbook";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import { useAttachmentActions } from "../../../modules/attachments/useAttachmentActions";
import * as files from "../../../modules/attachments/attachment-file";

afterEach(() => vi.restoreAllMocks());
function fixture() {
  let workbook = createWorkbook({ id: "attachments", sheetId: "sheet" });
  let sheet = getActiveSheet(workbook);
  const flush = vi.fn(() => true);
  const execute = vi.fn(
    (command: WorkbookCommand) => applyWorkbookCommand(workbook, command) !== null,
  );
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
    configurable: true,
  });
  const openPicker = vi.spyOn(input, "click").mockImplementation(() => {});
  actions.fileInput.value = input;
  const event = new Event("change");
  Object.defineProperty(event, "target", { value: input });
  return {
    actions,
    execute,
    onError,
    flush,
    event,
    input,
    openPicker,
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
  test("opens an insertion draft without choosing a file or changing the workbook", () => {
    const f = fixture();
    const prepare = vi.spyOn(files, "prepareAttachment");
    f.actions.requestInsert("document");

    expect(f.actions.inserting.value).toMatchObject({
      sheet: f.sheet,
      address: { row: 2, column: 3 },
      display: "document",
    });
    expect(f.actions.inserting.value?.file).toBeUndefined();
    expect(f.openPicker).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.drawings ?? []).toEqual([]);
  });

  test("only the explicit browse action opens the picker and stages its selected file", () => {
    const f = fixture();
    const prepare = vi.spyOn(files, "prepareAttachment");
    f.actions.requestInsert("document");
    f.actions.onFiles(f.event);
    expect(f.actions.inserting.value?.file).toBeUndefined();

    f.actions.chooseFile();
    expect(f.openPicker).toHaveBeenCalledTimes(1);
    f.actions.onFiles(f.event);
    expect(f.actions.inserting.value?.file).toBe(f.input.files![0]);
    expect(prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.busy.value).toBe(false);
  });

  test.each(["icon", "document"] as const)(
    "inserts one atomic drawing only after confirming %s display",
    async (display) => {
      const f = fixture();
      const prepared = { ...attachment, display };
      const prepare = vi.spyOn(files, "prepareAttachment").mockResolvedValue(prepared);
      f.actions.requestInsert(display === "icon" ? "document" : "icon");
      f.actions.chooseFile();
      f.actions.onFiles(f.event);
      await f.actions.confirmInsert(display);

      expect(prepare).toHaveBeenCalledWith(f.input.files![0], display);
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.sheet.drawings).toHaveLength(1);
      expect(f.sheet.drawings![0]).toMatchObject({
        kind: "attachment",
        anchor: { row: 2, column: 3 },
        attachment: prepared,
        width: display === "document" ? 360 : 220,
        height: display === "document" ? 240 : 80,
      });
      expect(f.actions.inserting.value).toBeUndefined();
      expect(f.actions.busy.value).toBe(false);
      expect(f.onError).not.toHaveBeenCalled();
    },
  );

  test("keeps a failed preparation draft for retry and reports its error inline", async () => {
    const f = fixture();
    const prepare = vi
      .spyOn(files, "prepareAttachment")
      .mockRejectedValueOnce(new Error("read failed"));
    f.actions.requestInsert("icon");
    f.actions.chooseFile();
    f.actions.onFiles(f.event);
    const draft = f.actions.inserting.value;
    await f.actions.confirmInsert("icon");

    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.inserting.value).toBe(draft);
    expect(f.actions.insertError.value).toBe(true);
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.actions.busy.value).toBe(false);

    prepare.mockResolvedValue({ ...attachment, display: "icon" });
    await f.actions.confirmInsert("icon");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.inserting.value).toBeUndefined();
    expect(f.actions.insertError.value).toBe(false);
  });

  test("retains the selected file after execution is refused without showing a toast", async () => {
    const f = fixture();
    vi.spyOn(files, "prepareAttachment").mockResolvedValue(attachment);
    f.execute.mockReturnValue(false);
    f.actions.requestInsert("document");
    f.actions.chooseFile();
    f.actions.onFiles(f.event);
    const draft = f.actions.inserting.value;
    await f.actions.confirmInsert("document");

    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings ?? []).toEqual([]);
    expect(f.actions.inserting.value).toBe(draft);
    expect(f.actions.insertError.value).toBe(true);
    expect(f.actions.busy.value).toBe(false);
    expect(f.onError).not.toHaveBeenCalled();
  });

  test.each(["switchSheet", "replaceWorkbook", "protection", "close"] as const)(
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
      f.actions.chooseFile();
      f.actions.onFiles(f.event);
      const pending = f.actions.confirmInsert("document");
      expect(f.actions.busy.value).toBe(true);
      if (change === "protection") f.sheet.properties.protected = true;
      else if (change === "close") f.actions.close();
      else f[change]();
      resolve(attachment);
      await pending;
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.onError).not.toHaveBeenCalled();
      expect(f.actions.busy.value).toBe(false);
      expect(f.actions.insertError.value).toBe(false);
    },
  );

  test("ignores a file picker result after closing and opening another insertion draft", () => {
    const f = fixture();
    f.actions.requestInsert("document");
    f.actions.chooseFile();
    f.actions.close();
    f.actions.requestInsert("icon");
    const current = f.actions.inserting.value;
    f.actions.onFiles(f.event);

    expect(f.actions.inserting.value).toBe(current);
    expect(f.actions.inserting.value?.file).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("does not prepare or insert a draft without a selected file", async () => {
    const f = fixture();
    const prepare = vi.spyOn(files, "prepareAttachment");
    f.actions.requestInsert("document");
    await f.actions.confirmInsert("document");
    expect(prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.inserting.value).toBeDefined();
  });

  test("keeps the previously selected file when another picker selection is cancelled", () => {
    const f = fixture();
    f.actions.requestInsert("document");
    f.actions.chooseFile();
    f.actions.onFiles(f.event);
    const selected = f.actions.inserting.value?.file;
    f.actions.chooseFile();
    Object.defineProperty(f.input, "files", { value: [] });
    f.actions.onFiles(f.event);
    expect(f.actions.inserting.value?.file).toBe(selected);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("ignores duplicate confirmation while a selected file is being prepared", async () => {
    const f = fixture();
    let resolve!: (value: SheetAttachment) => void;
    const prepare = vi.spyOn(files, "prepareAttachment").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    f.actions.requestInsert("document");
    f.actions.chooseFile();
    f.actions.onFiles(f.event);
    const pending = f.actions.confirmInsert("document");
    await f.actions.confirmInsert("icon");
    expect(prepare).toHaveBeenCalledTimes(1);
    resolve(attachment);
    await pending;
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.actions.busy.value).toBe(false);
  });

  test("still reports download failures through the existing toast callback", async () => {
    const f = fixture();
    vi.spyOn(files, "prepareAttachment").mockResolvedValue(attachment);
    f.actions.requestInsert("document");
    f.actions.chooseFile();
    f.actions.onFiles(f.event);
    await f.actions.confirmInsert("document");
    const drawing = f.sheet.drawings!.find(
      (value): value is SheetAttachmentDrawing => value.kind === "attachment",
    )!;
    vi.spyOn(files, "attachmentBlob").mockImplementation(() => {
      throw new Error("decode failed");
    });
    f.actions.download(drawing);
    expect(f.onError).toHaveBeenCalledTimes(1);
  });
  test.each(["protection", "flush"] as const)(
    "does not capture an insertion target when %s blocks editing",
    async (block) => {
      const f = fixture();
      const prepare = vi.spyOn(files, "prepareAttachment");
      if (block === "protection") f.sheet.properties.protected = true;
      else f.flush.mockReturnValue(false);
      f.actions.requestInsert("icon");
      f.actions.chooseFile();
      f.actions.onFiles(f.event);
      await f.actions.confirmInsert("icon");
      expect(prepare).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.openPicker).not.toHaveBeenCalled();
      expect(f.actions.inserting.value).toBeUndefined();
    },
  );
});
