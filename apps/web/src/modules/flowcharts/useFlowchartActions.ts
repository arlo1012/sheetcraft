import type { FlowchartStart } from "./flowchart-templates";
import { shallowRef, ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, CellAddress } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { createAttachmentDrawing } from "../attachments/create-attachment-drawing";
import {
  decodeFlowchartAttachment,
  encodeFlowchartAttachment,
  type FlowchartDocument,
} from "./flowchart-document";

export function useFlowchartActions(options: {
  getSheets: () => Iterable<Sheet>;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
}) {
  const editor = shallowRef<{
    start: FlowchartStart;
    existing: { sheetName: string; document: FlowchartDocument }[];
    sheet: Sheet;
    anchor: CellAddress;
    original?: SheetAttachmentDrawing;
    document?: FlowchartDocument;
  }>();
  const error = ref(false);
  const makeId = createBrowserIdFactory();
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function open(start: FlowchartStart = "gallery", original?: SheetAttachmentDrawing) {
    const document = original && decodeFlowchartAttachment(original.attachment);
    if ((original && !document) || !allowed() || !options.flush()) return false;
    error.value = false;
    const existing = [];
    if (start === "gallery" && !original) {
      for (const sheet of options.getSheets()) {
        if (sheet.properties.hidden) continue;
        for (const drawing of sheet.drawings ?? []) {
          if (drawing.kind !== "attachment") continue;
          const chart = decodeFlowchartAttachment(drawing.attachment);
          if (chart) existing.push({ sheetName: sheet.name, document: chart });
        }
      }
    }
    editor.value = {
      start,
      existing,
      sheet: options.getSheet(),
      anchor: { ...options.getAddress() },
      original,
      document,
    };
    return true;
  }
  function save(document: FlowchartDocument) {
    const target = editor.value;
    if (!target) return;
    error.value = true;
    if (!allowed() || options.getSheet() !== target.sheet) return;
    const drawings = target.sheet.drawings ?? [];
    const existing = drawings.find((item) => item.id === target.original?.id);
    if (
      target.original &&
      (existing?.kind !== "attachment" ||
        existing.attachment.data !== target.original.attachment.data)
    )
      return;
    try {
      const attachment = encodeFlowchartAttachment(document);
      if (
        existing?.kind === "attachment" &&
        existing.attachment.data === attachment.data &&
        existing.name === document.title.trim()
      ) {
        close();
        return;
      }
      const drawing = existing
        ? { ...existing, name: document.title.trim(), attachment }
        : {
            ...createAttachmentDrawing(makeId("flowchart"), target.anchor, attachment),
            name: document.title.trim(),
            width: 480,
            height: 300,
          };
      const updated = existing
        ? drawings.map((item) => (item.id === existing.id ? drawing : item))
        : [...drawings, drawing];
      if (options.execute(createSetSheetDrawingsCommand(target.sheet.id, updated))) close();
    } catch {
      error.value = true;
    }
  }
  function close() {
    editor.value = undefined;
    error.value = false;
  }
  return { editor, error, open, save, close };
}
