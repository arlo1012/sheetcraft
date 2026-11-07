import { shallowRef, ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, CellAddress } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { createAttachmentDrawing } from "./create-attachment-drawing";
export type DiagramWorkspace = {
  getSheets: () => Iterable<Sheet>;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
};
export function useDiagramActions<T extends { title: string }, S extends string>(
  options: DiagramWorkspace,
  config: {
    idPrefix: string;
    gallery: S;
    frame?: (source: T) => { width: number; height: number };
    decode: (attachment: SheetAttachment) => T | undefined;
    encode: (source: T) => SheetAttachment;
  },
) {
  const editor = shallowRef<{
    start: S;
    existing: { sheetName: string; document: T }[];
    sheet: Sheet;
    anchor: CellAddress;
    original?: SheetAttachmentDrawing;
    document?: T;
  }>();
  const error = ref(false);
  const makeId = createBrowserIdFactory();
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function open(start: S = config.gallery, original?: SheetAttachmentDrawing) {
    const document = original && config.decode(original.attachment);
    if ((original && !document) || !allowed() || !options.flush()) return false;
    error.value = false;
    const existing = [];
    if (start === config.gallery && !original) {
      for (const sheet of options.getSheets()) {
        if (sheet.properties.hidden) continue;
        for (const drawing of sheet.drawings ?? []) {
          if (drawing.kind !== "attachment") continue;
          const chart = config.decode(drawing.attachment);
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
  function save(document: T) {
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
      const attachment = config.encode(document);
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
            ...createAttachmentDrawing(makeId(config.idPrefix), target.anchor, attachment),
            name: document.title.trim(),
            ...(config.frame?.(document) ?? { width: 480, height: 300 }),
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
