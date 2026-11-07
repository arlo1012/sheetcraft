import { createAttachmentDrawing } from "./create-attachment-drawing";
import { ref, shallowRef } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Workbook, Sheet, CellAddress } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { downloadBlob } from "../../shared/files/download";
import { prepareAttachment, attachmentBlob } from "./attachment-file";
type AttachmentInsertion = {
  id: number;
  workbook: Workbook;
  sheet: Sheet;
  address: CellAddress;
  display: "icon" | "document";
  file?: File;
};
export function useAttachmentActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  onError: () => void;
}) {
  const fileInput = ref<HTMLInputElement>();
  const busy = ref(false);
  const viewing = shallowRef<SheetAttachmentDrawing>();
  const inserting = shallowRef<AttachmentInsertion>();
  const insertError = ref(false);
  let sequence = 0;
  const idFactory = createBrowserIdFactory();
  let pickerTarget: AttachmentInsertion | undefined;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function requestInsert(display: "icon" | "document", file?: File) {
    if (!allowed() || busy.value || !options.flush()) return;
    inserting.value = {
      id: ++sequence,
      workbook: options.getWorkbook(),
      sheet: options.getSheet(),
      address: { ...options.getAddress() },
      display,
      file,
    };
    insertError.value = false;
    pickerTarget = undefined;
    return true;
  }
  function chooseFile() {
    if (!inserting.value || !allowed() || busy.value) return;
    pickerTarget = inserting.value;
    if (fileInput.value) {
      fileInput.value.value = "";
      fileInput.value.click();
    }
  }
  function onFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const pending = pickerTarget;
    pickerTarget = undefined;
    if (!file || !pending || !isCurrent(pending) || busy.value) return;
    inserting.value = { ...pending, file };
    insertError.value = false;
  }
  function isCurrent(pending: AttachmentInsertion) {
    return (
      inserting.value === pending &&
      pending.workbook === options.getWorkbook() &&
      pending.sheet === options.getSheet() &&
      pending.workbook.sheets.get(pending.sheet.id) === pending.sheet &&
      allowed()
    );
  }
  async function confirmInsert(display: "icon" | "document") {
    const pending = inserting.value;
    if (!pending?.file || busy.value || !isCurrent(pending)) return;
    busy.value = true;
    insertError.value = false;
    try {
      const attachment = await prepareAttachment(pending.file, display);
      if (!isCurrent(pending)) return;
      const drawing = createAttachmentDrawing(idFactory("attachment"), pending.address, attachment);
      const accepted = options.execute(
        createSetSheetDrawingsCommand(pending.sheet.id, [
          ...(options.getSheet().drawings ?? []),
          drawing,
        ]),
      );
      if (!isCurrent(pending)) return;
      if (accepted !== true) throw new Error("Attachment insertion was refused.");
      inserting.value = undefined;
    } catch {
      if (isCurrent(pending)) insertError.value = true;
    } finally {
      busy.value = false;
    }
  }
  function download(drawing: SheetAttachmentDrawing) {
    try {
      downloadBlob(attachmentBlob(drawing.attachment), drawing.attachment.filename);
    } catch {
      options.onError();
    }
  }
  function close() {
    viewing.value = undefined;
    inserting.value = undefined;
    pickerTarget = undefined;
    insertError.value = false;
  }
  return {
    fileInput,
    busy,
    viewing,
    inserting,
    insertError,
    requestInsert,
    chooseFile,
    onFiles,
    confirmInsert,
    download,
    close,
  };
}
