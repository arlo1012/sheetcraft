import { ref, shallowRef } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Workbook, Sheet, CellAddress } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { downloadBlob } from "../../shared/files/download";
import { prepareAttachment, attachmentBlob } from "./attachment-file";
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
  const idFactory = createBrowserIdFactory();
  let target:
    | { workbook: Workbook; sheetId: string; address: CellAddress; display: "icon" | "document" }
    | undefined;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function requestInsert(display: "icon" | "document") {
    if (!allowed() || busy.value || !options.flush()) return;
    target = {
      workbook: options.getWorkbook(),
      sheetId: options.getSheet().id,
      address: { ...options.getAddress() },
      display,
    };
    if (fileInput.value) {
      fileInput.value.value = "";
      fileInput.value.click();
    }
  }
  async function onFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const pending = target;
    target = undefined;
    if (!file || !pending || busy.value || !allowed()) return;
    busy.value = true;
    try {
      const attachment = await prepareAttachment(file, pending.display);
      if (
        pending.workbook !== options.getWorkbook() ||
        pending.sheetId !== options.getSheet().id ||
        !allowed()
      )
        return;
      const drawing: SheetAttachmentDrawing = {
        id: idFactory("attachment"),
        kind: "attachment",
        name: attachment.filename,
        anchor: pending.address,
        offsetX: 8,
        offsetY: 8,
        width: pending.display === "document" ? 360 : 220,
        height: pending.display === "document" ? 240 : 80,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#d1d5db",
        strokeWidth: 1,
        color: "#111827",
        fontSize: 14,
        bold: false,
        italic: false,
        rotation: 0,
        attachment,
      };
      options.execute(
        createSetSheetDrawingsCommand(pending.sheetId, [
          ...(options.getSheet().drawings ?? []),
          drawing,
        ]),
      );
    } catch {
      options.onError();
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
    target = undefined;
  }
  return { fileInput, busy, viewing, requestInsert, onFiles, download, close };
}
